import * as THREE from 'three'
import { DEFAULT_DIMS, bookPose } from './bookShape'
import type { BookDims, BookPose } from './bookShape'
import { createBlock, createCover, createHeadbands, createSheet } from './geometry'
import { CoverMaterial, PageMaterial } from './materials'
import type { CoverLook } from './materials'
import { makeHeadband, makePageEdges, makePaper, makeTitleStamp } from './textures'
import type { PaperStyle } from './textures'
import { blankInk } from './pageTexture'

/** Where page ink textures come from. Even pages are left-hand pages. */
export interface PageSource {
  texture(index: number): THREE.Texture
}

interface Turn {
  /** spread the sheet belongs to: it carries pages 2*base+1 (front) and 2*base+2 (back) */
  base: number
  theta: number
  vel: number
  target: number
  twist: number
  twistTarget: number
  dragging: boolean
  /** a small lift of the corner that hints the page can be turned */
  peek?: boolean
}

const STIFFNESS = 90
const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.86

/**
 * The whole book as a three.js object: cover, two page blocks, headbands and the
 * turning sheet. Owns the open/close and page-turn animation.
 */
export class BookRig {
  readonly group = new THREE.Group()
  readonly dims: BookDims
  pose: BookPose

  private cover: ReturnType<typeof createCover>
  private left: ReturnType<typeof createBlock>
  private right: ReturnType<typeof createBlock>
  private bands: ReturnType<typeof createHeadbands>
  private sheet: ReturnType<typeof createSheet>
  private body = new THREE.Group()
  private sheetMesh: THREE.Mesh
  private blank = blankInk()
  private titleStamp: THREE.Texture

  readonly coverMaterial: CoverMaterial
  private pageL: PageMaterial
  private pageR: PageMaterial
  private pageSheet: PageMaterial
  private edgeMaterial: THREE.MeshStandardMaterial

  private source: PageSource | null = null
  private totalPages = 480
  spread = 0
  private openNow = 0
  private openVel = 0
  openTarget = 0
  private turn: Turn | null = null
  private poseKey = ''
  reducedMotion = false
  onSpreadChange?: (spread: number) => void
  /** true while anything is moving, so the scene knows to keep drawing */
  busy = true

  constructor(look: CoverLook, paper: PaperStyle, title: string, author: string, dims: BookDims = DEFAULT_DIMS) {
    this.dims = dims
    this.pose = bookPose(dims, 0, 0.3)
    this.cover = createCover(dims)
    this.left = createBlock(dims, 'left')
    this.right = createBlock(dims, 'right')
    this.bands = createHeadbands(dims)
    this.sheet = createSheet(dims)
    const openPose = bookPose(dims, 1, 0.5)
    this.left.orient(openPose)
    this.right.orient(openPose)

    this.titleStamp = makeTitleStamp(title, author)
    this.coverMaterial = new CoverMaterial(look, this.titleStamp)
    this.coverMaterial.setLook(look, true)

    const p = makePaper(paper)
    const pageParams = { map: p.map, bumpMap: p.bump, bumpScale: 0.6, roughness: p.look.roughness, metalness: 0 }
    this.pageL = new PageMaterial(pageParams, this.blank)
    this.pageL.u.uFlip.value = 1
    this.pageR = new PageMaterial(pageParams, this.blank)
    this.pageSheet = new PageMaterial({ ...pageParams, side: THREE.DoubleSide }, this.blank)
    this.pageSheet.u.uTransmit.value = 0.6
    this.pageSheet.u.uShowThrough.value = 0.06
    const e = makePageEdges(paper)
    this.edgeMaterial = new THREE.MeshStandardMaterial({ map: e.map, bumpMap: e.bump, bumpScale: 1.2, roughness: 0.92, side: THREE.DoubleSide })

    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.body) => {
      const m = new THREE.Mesh(geometry, material)
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      parent.add(m)
      return m
    }
    add(this.cover.geometry, this.coverMaterial)
    add(this.left.top, this.pageL)
    add(this.right.top, this.pageR)
    add(this.left.edges, this.edgeMaterial)
    add(this.right.edges, this.edgeMaterial)
    add(this.bands.geometry, new THREE.MeshStandardMaterial({ map: makeHeadband(), roughness: 0.8 }))
    this.sheetMesh = add(this.sheet.geometry, this.pageSheet, this.group)
    // nothing but the sheet itself could shade it, and self-shadowing only adds speckle
    this.sheetMesh.receiveShadow = false
    this.sheetMesh.visible = false
    this.group.add(this.body)
    this.refreshPose(true)
  }

  setSource(source: PageSource, totalPages: number) {
    this.source = source
    this.totalPages = totalPages
    this.spread = Math.min(this.spread, this.lastSpread)
    this.assignInk()
    this.refreshPose()
    this.busy = true
  }

  /** Changes the stamped title on the front cover. */
  setTitle(title: string, author: string) {
    const old = this.titleStamp
    this.titleStamp = makeTitleStamp(title, author)
    this.coverMaterial.setTitle(this.titleStamp)
    old.dispose()
    this.busy = true
  }

  /** Shows a spread straight away, without a page-turn (restoring a place, jumping to a chapter). */
  jumpTo(spread: number) {
    if (this.turn) {
      this.turn = null
      this.sheetMesh.visible = false
    }
    this.spread = Math.min(this.lastSpread, Math.max(0, Math.round(spread)))
    this.assignInk()
    this.refreshPose()
    this.busy = true
  }

  /** Opens the book without the opening animation. */
  openInstantly() {
    this.openTarget = 1
    this.openNow = 1
    this.openVel = 0
    this.refreshPose(true)
    this.busy = true
  }

  get turning() {
    return !!this.turn && !this.turn.peek
  }

  setPaper(paper: PaperStyle) {
    const p = makePaper(paper)
    const e = makePageEdges(paper)
    for (const m of [this.pageL, this.pageR, this.pageSheet]) {
      m.map?.dispose()
      m.bumpMap?.dispose()
      m.map = p.map
      m.bumpMap = p.bump
      m.roughness = p.look.roughness
    }
    this.edgeMaterial.map?.dispose()
    this.edgeMaterial.map = e.map
    this.edgeMaterial.bumpMap = e.bump
    this.busy = true
  }

  /** Re-reads page textures from the source, e.g. after the ink colour or font changed. */
  refreshInk() {
    this.assignInk()
    this.busy = true
  }

  setLight(dirView: THREE.Vector3, color: THREE.Color) {
    this.pageSheet.u.uLightDir.value.copy(dirView)
    this.pageSheet.u.uLightColor.value.copy(color)
  }

  get isOpen() {
    return this.openNow > 0.995
  }

  get openAmount() {
    return this.openNow
  }

  get lastSpread() {
    return Math.max(0, Math.ceil(this.totalPages / 2) - 1)
  }

  // --- page turning -------------------------------------------------------

  private canTurn(dir: 1 | -1) {
    return dir === 1 ? this.spread < this.lastSpread : this.spread > 0
  }

  private settleTurn() {
    const t = this.turn
    if (!t) return
    this.turn = null
    this.sheetMesh.visible = false
    const landed = t.target > Math.PI / 2 ? t.base + 1 : t.base
    if (landed !== this.spread) {
      this.spread = landed
      this.onSpreadChange?.(landed)
    }
    this.assignInk()
    this.refreshPose()
  }

  /** Starts a turn that the pointer then steers with `dragTurn`. */
  beginDrag(dir: 1 | -1) {
    if (!this.isOpen) return false
    const lifted = this.turn
    if (lifted?.peek && (lifted.base === this.spread ? 1 : -1) === dir) {
      // the corner is already lifted on this side: carry on from there
      lifted.peek = false
      return true
    }
    this.settleTurn()
    if (!this.canTurn(dir)) return false
    const start = dir === 1 ? 0 : Math.PI
    this.turn = { base: dir === 1 ? this.spread : this.spread - 1, theta: start, vel: 0, target: start, twist: 0, twistTarget: 0, dragging: true }
    this.sheetMesh.visible = true
    this.assignInk()
    return true
  }

  /** `x` is the pointer position across the page (1 = right fore-edge, -1 = left), `z` -1..1 from head to tail. */
  dragTurn(x: number, z: number) {
    const t = this.turn
    if (!t || !t.dragging) return
    this.busy = true
    t.target = Math.acos(Math.min(1, Math.max(-1, x)))
    t.twistTarget = Math.min(1, Math.max(-1, z)) * 0.9
  }

  /**
   * Lifts (or lowers) the outer corner of the next or previous page a little, to
   * show that it can be turned.
   */
  peek(dir: 1 | -1, on: boolean) {
    const t = this.turn
    if (!on) {
      if (t?.peek) {
        t.dragging = false
        t.target = t.base === this.spread ? 0 : Math.PI
        t.twistTarget = 0
        this.busy = true
      }
      return
    }
    if (t || this.reducedMotion || !this.isOpen || !this.canTurn(dir)) return
    if (!this.beginDrag(dir)) return
    this.turn!.peek = true
    this.dragTurn(dir * 0.955, 0.9)
  }

  /** Lets go of the sheet: it falls to whichever side it is leaning towards. */
  releaseDrag() {
    const t = this.turn
    if (!t || !t.dragging) return
    t.dragging = false
    t.peek = false
    const lean = t.theta + t.vel * 0.12
    t.target = lean > Math.PI / 2 ? Math.PI : 0
    t.twistTarget = 0
  }

  /** Turns a whole page forwards (1) or back (-1). */
  flip(dir: 1 | -1) {
    if (!this.isOpen) return
    this.settleTurn()
    if (!this.canTurn(dir)) return
    if (this.reducedMotion) {
      this.spread += dir
      this.onSpreadChange?.(this.spread)
      this.assignInk()
      this.refreshPose()
      this.busy = true
      return
    }
    const start = dir === 1 ? 0 : Math.PI
    this.turn = { base: dir === 1 ? this.spread : this.spread - 1, theta: start, vel: 0, target: Math.PI - start, twist: 0, twistTarget: 0, dragging: false }
    this.sheetMesh.visible = true
    this.assignInk()
    this.busy = true
  }

  /** Completes the turn being dragged in its own direction (used for a tap). */
  completeDrag(dir: 1 | -1) {
    const t = this.turn
    if (!t) return
    t.dragging = false
    t.peek = false
    t.target = dir === 1 ? Math.PI : 0
    t.twistTarget = 0
  }

  private assignInk() {
    const src = this.source
    const tex = (i: number) => (src && i >= 0 && i < this.totalPages ? src.texture(i) : this.blank)
    const t = this.turn
    const k = t ? t.base : this.spread
    this.pageL.u.inkFront.value = tex(2 * k)
    this.pageR.u.inkFront.value = tex(t ? 2 * k + 3 : 2 * k + 1)
    if (t) {
      this.pageSheet.u.inkFront.value = tex(2 * k + 1)
      this.pageSheet.u.inkBack.value = tex(2 * k + 2)
    }
  }

  // --- animation ----------------------------------------------------------

  private refreshPose(force = false) {
    const k = this.turn ? this.turn.base : this.spread
    const progress = (2 * k + 1) / Math.max(2, this.totalPages)
    const key = `${this.openNow.toFixed(4)}|${progress.toFixed(4)}`
    if (!force && key === this.poseKey) return
    const openChanged = force || !this.poseKey.startsWith(this.openNow.toFixed(4) + '|')
    this.poseKey = key
    this.pose = bookPose(this.dims, this.openNow, progress)
    if (openChanged) this.cover.update(this.openNow)
    this.left.update(this.pose, this.openNow)
    this.right.update(this.pose, this.openNow)
    this.bands.update(this.left.binding, this.right.binding)
    this.body.position.x = this.pose.offsetX
  }

  tick(dt: number) {
    dt = Math.min(dt, 1 / 30)
    this.busy = this.coverMaterial.tick(dt)

    // opening and closing
    if (this.openNow !== this.openTarget) {
      if (this.reducedMotion) {
        this.openNow = this.openTarget
      } else {
        const k = 26
        this.openVel += (k * (this.openTarget - this.openNow) - 2 * Math.sqrt(k) * this.openVel) * dt
        this.openNow += this.openVel * dt
        if (Math.abs(this.openTarget - this.openNow) < 0.0008 && Math.abs(this.openVel) < 0.01) {
          this.openNow = this.openTarget
          this.openVel = 0
        }
        this.openNow = Math.min(1, Math.max(0, this.openNow))
      }
      if (this.openTarget < 1) this.settleTurn()
      this.refreshPose()
      this.busy = true
    }

    const t = this.turn
    if (t) {
      // a held sheet that has come to rest needs no more frames until the pointer moves
      if (!t.dragging || Math.abs(t.target - t.theta) > 0.002 || Math.abs(t.vel) > 0.02 || Math.abs(t.twistTarget - t.twist) > 0.004) this.busy = true
      const stiff = t.dragging ? STIFFNESS * 2.2 : STIFFNESS
      const damp = t.dragging ? DAMPING * 1.5 : DAMPING
      t.vel += (stiff * (t.target - t.theta) - damp * t.vel) * dt
      t.theta = Math.min(Math.PI, Math.max(0, t.theta + t.vel * dt))
      t.twist += (t.twistTarget - t.twist) * Math.min(1, dt * 9)
      this.sheet.update(this.pose, t.theta / Math.PI, t.twist)
      if (!t.dragging && Math.abs(t.target - t.theta) < 0.012 && Math.abs(t.vel) < 0.25) this.settleTurn()
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material as THREE.MeshStandardMaterial
        m.dispose()
      }
    })
    this.blank.dispose()
    this.titleStamp.dispose()
  }
}
