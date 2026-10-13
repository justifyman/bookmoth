import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { Bloom, DepthOfField, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { BookRig } from './BookRig'
import type { PageSource } from './BookRig'
import { DEFAULT_DIMS } from './bookShape'
import { COVERS, DESKS } from './looks'
import type { CoverKind, DeskKind } from './looks'
import { prepareSet } from './materials'
import type { CoverLook, TextureSet } from './materials'
import { QUALITY } from './quality'
import type { Quality } from './quality'
import type { PaperStyle } from './textures'

export type { CoverKind, DeskKind } from './looks'

export interface SceneSettings {
  cover: CoverKind
  paper: PaperStyle
  desk: DeskKind
  quality: Quality
  open: boolean
  /** night light: a dark room with one lamp over the book */
  night?: boolean
}

/** Which part of the open book fills the screen: both pages, or one page on narrow screens. */
export type Focus = 'both' | 'left' | 'right'

/** The book being read: its pages and where the reader is. */
export interface BookFeed {
  title: string
  author: string
  source: PageSource | null
  /** number of page sides, counting from the left-hand page of the first spread */
  totalPages: number
  /** the spread that should be showing */
  spread: number
  /** the reader turned a page */
  onSpread: (spread: number, dir: 1 | -1) => void
  focus: Focus
  /** a tap or swipe that asks for the next (1) or previous (-1) page without dragging the sheet */
  onStep: (dir: 1 | -1) => void
  onTapMiddle: () => void
}

export interface SceneApi {
  /** turns a whole page with the full animation */
  flip: (dir: 1 | -1) => void
}

const ASSETS = `${import.meta.env.BASE_URL}assets`

// Texture sets are fetched only when a look that needs them is chosen, and kept
// afterwards so switching back is instant.
const loader = new THREE.TextureLoader()
const sets = new Map<string, Promise<TextureSet>>()
function loadSet(folder: string, res: '2k' | '1k') {
  const key = `${folder}/${res}`
  let p = sets.get(key)
  if (!p) {
    const dir = `${ASSETS}/textures/${folder}${res === '1k' ? '/1k' : ''}`
    p = Promise.all(['albedo', 'normal', 'arm'].map((m) => loader.loadAsync(`${dir}/${m}.jpg`))).then(([albedo, normal, arm]) => prepareSet({ albedo, normal, arm }, 8))
    p.catch(() => sets.delete(key))
    sets.set(key, p)
  }
  return p
}

/** The most recently loaded set; the previous one stays in use while a new one downloads. */
function useTextureSet(folder: string, res: '2k' | '1k') {
  const [loaded, setLoaded] = useState<{ folder: string; set: TextureSet } | null>(null)
  useEffect(() => {
    let alive = true
    loadSet(folder, res).then(
      (set) => alive && setLoaded({ folder, set }),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [folder, res])
  return loaded
}

const LIGHT_POS = new THREE.Vector3(-2.4, 5.6, -2.6)
const LIGHT_COLOR = new THREE.Color('#ffe8cf')
const LIGHT_INTENSITY = 2.7
const ENVIRONMENT = 0.5
const ROOM = new THREE.Color('#0d0907')
// Night light. A desk lamp stands just out of view at the back left:
// its light is brightest on the desk beside it and thins out with distance the way
// real light does, so the room falls away gradually instead of being cut off. A
// little cool moonlight keeps the shadows from going flat black.
const MOON_COLOR = new THREE.Color('#7f94cf')
const MOON_INTENSITY = 0.16
const NIGHT_ENVIRONMENT = 0.045
const NIGHT_ROOM = new THREE.Color('#040304')
const LAMP_POS = new THREE.Vector3(-2.4, 2.9, -2.0)
const LAMP_TARGET = new THREE.Vector3(0.25, 0, 0.3)
const LAMP_COLOR = new THREE.Color('#ffb066')
const LAMP_INTENSITY = 54

/** How far the scene has faded into night, from 0 to 1. Shared by the lights and the book. */
type Mood = { current: { night: number } }

function Lighting({ night, quality, mood }: { night: boolean; quality: Quality; mood: Mood }) {
  const q = QUALITY[quality]
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const sun = useRef<THREE.DirectionalLight>(null)
  const lamp = useRef<THREE.SpotLight>(null)
  useEffect(() => {
    const l = lamp.current
    if (l) {
      l.target.position.copy(LAMP_TARGET)
      l.target.updateMatrixWorld()
    }
    invalidate()
  }, [night, invalidate])
  useFrame((_, dt) => {
    const m = mood.current
    const want = night ? 1 : 0
    if (m.night !== want) {
      const step = Math.min(dt, 1 / 30) / 0.9
      m.night = Math.abs(want - m.night) <= step ? want : m.night + Math.sign(want - m.night) * step
      invalidate()
    }
    const n = m.night * m.night * (3 - 2 * m.night)
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(LIGHT_INTENSITY, MOON_INTENSITY, n)
      sun.current.color.lerpColors(LIGHT_COLOR, MOON_COLOR, n)
      // only one light throws shadows at a time, except while one fades into the other
      sun.current.castShadow = n < 1
    }
    if (lamp.current) {
      lamp.current.visible = n > 0
      lamp.current.intensity = LAMP_INTENSITY * n
    }
    scene.environmentIntensity = THREE.MathUtils.lerp(ENVIRONMENT, NIGHT_ENVIRONMENT, n)
    if (scene.background instanceof THREE.Color) scene.background.lerpColors(ROOM, NIGHT_ROOM, n)
    if (scene.fog) scene.fog.color.lerpColors(ROOM, NIGHT_ROOM, n)
  })
  return (
    <>
      <directionalLight
        ref={sun}
        position={LIGHT_POS}
        castShadow
        shadow-mapSize={[q.shadowMap, q.shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
        shadow-radius={q.shadowRadius}
        shadow-camera-left={-2.8}
        shadow-camera-right={2.8}
        shadow-camera-top={2.8}
        shadow-camera-bottom={-2.8}
        shadow-camera-near={1}
        shadow-camera-far={14}
      />
      {/* a wide, fully soft cone: what shapes the pool of light is distance, not the edge of the beam */}
      <spotLight ref={lamp} position={LAMP_POS} color={LAMP_COLOR} angle={1.12} penumbra={1} decay={2} visible={false} castShadow shadow-mapSize={[q.shadowMap, q.shadowMap]} shadow-bias={-0.0008} shadow-normalBias={0.03} shadow-radius={q.shadowRadius * 2.5} shadow-camera-near={0.5} shadow-camera-far={12} />
    </>
  )
}
// ?elev= and ?zoom= let a developer inspect the book from other angles
const debug = new URLSearchParams(location.search)
const VIEW_ELEVATION = (Number(debug.get('elev') ?? 63) * Math.PI) / 180
const ZOOM = Number(debug.get('zoom') ?? 1)
const FOV = 28
const TAN = Math.tan((FOV * Math.PI) / 360)

/**
 * How far the camera sits from the book, and how many screen pixels one scene unit
 * covers there. `open` and `single` run from 0 to 1.
 */
export function framing(width: number, height: number, open: number, single: number) {
  const d = DEFAULT_DIMS
  const spread = THREE.MathUtils.lerp(d.W / 2 + 0.5, d.W + d.o + 0.32, open)
  const halfW = THREE.MathUtils.lerp(spread, d.W / 2 + d.o + 0.16, single * open)
  const halfH = (d.H / 2 + d.o) * Math.sin(VIEW_ELEVATION) + 0.34
  const dist = Math.max(halfW / (TAN * (width / Math.max(1, height))), halfH / TAN) * ZOOM
  return { dist, pxPerUnit: height / (2 * dist * TAN) }
}

/** Height on screen, in CSS pixels, of one page of the open book. */
export function pageHeightOnScreen(width: number, height: number, single: boolean) {
  return framing(width, height, 1, single ? 1 : 0).pxPerUnit * DEFAULT_DIMS.H * Math.sin(VIEW_ELEVATION)
}

function Desk({ kind, res }: { kind: DeskKind; res: '2k' | '1k' }) {
  const invalidate = useThree((s) => s.invalidate)
  const loaded = useTextureSet(DESKS[kind].folder, res)
  // the desk shown is the one whose textures have arrived; until then the previous one stays
  const [shown, setShown] = useState<{ kind: DeskKind; maps: TextureSet } | null>(null)
  useEffect(() => {
    if (!loaded || loaded.folder !== DESKS[kind].folder) return
    // copies, because a cover may be using the same pictures at another scale
    const maps = { albedo: loaded.set.albedo.clone(), normal: loaded.set.normal.clone(), arm: loaded.set.arm.clone() }
    for (const t of [maps.albedo, maps.normal, maps.arm]) {
      t.repeat.setScalar(60 / DESKS[kind].tile)
      // grain runs across the desk, left to right
      t.rotation = Math.PI / 2
      t.needsUpdate = true
    }
    setShown({ kind, maps })
    invalidate()
    return () => {
      for (const t of [maps.albedo, maps.normal, maps.arm]) t.dispose()
    }
  }, [loaded, kind, invalidate])
  if (!shown) return null
  const desk = DESKS[shown.kind]
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[60, 60]} />
      {/* a satin finish: the scanned gloss map gives harsh glints under the lamp */}
      <meshStandardMaterial key={shown.kind} map={shown.maps.albedo} normalMap={shown.maps.normal} normalScale={[desk.relief, desk.relief]} aoMap={shown.maps.arm} roughness={desk.roughness} metalness={0} color={desk.color} envMapIntensity={0.55} />
    </mesh>
  )
}

interface BookProps {
  settings: SceneSettings
  feed: BookFeed
  apiRef?: RefObject<SceneApi | null>
  instantOpen?: boolean
  onReady?: () => void
  onFrameRate?: (fps: number) => void
}

interface BookInnerProps extends BookProps {
  mood: Mood
}

function Book({ settings, feed, apiRef, instantOpen, onReady, onFrameRate, mood }: BookInnerProps) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const q = QUALITY[settings.quality]

  // the look in use changes once the chosen cover's textures have arrived
  const [look, setLook] = useState<CoverLook | null>(null)
  useEffect(() => {
    let alive = true
    const { folder, label: _label, swatch: _swatch, ...params } = COVERS[settings.cover]
    loadSet(folder, q.textures).then(
      (set) => alive && setLook({ ...params, set }),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [settings.cover, q.textures])

  const live = useRef({ settings, feed, instantOpen, onReady, onFrameRate })
  const lookRef = useRef(look)
  useEffect(() => {
    live.current = { settings, feed, instantOpen, onReady, onFrameRate }
    lookRef.current = look
  })

  // the rig is built once, when the first cover has arrived; later changes are applied to it below
  const [rig, setRig] = useState<BookRig | null>(null)
  const skipHint = useRef(false)
  const hasLook = !!look
  useEffect(() => {
    if (!hasLook) return
    const now = live.current
    const r = new BookRig(lookRef.current!, now.settings.paper, now.feed.title, now.feed.author)
    skipHint.current = !!now.instantOpen
    if (now.instantOpen) r.openInstantly()
    setRig(r)
    return () => {
      setRig(null)
      r.dispose()
    }
  }, [hasLook])

  useEffect(() => {
    if (rig && look) rig.coverMaterial.setLook(look)
    invalidate()
  }, [rig, look, invalidate])

  const firstPaper = useRef<BookRig | null>(null)
  useEffect(() => {
    if (!rig) return
    if (firstPaper.current !== rig) firstPaper.current = rig
    else rig.setPaper(settings.paper)
    invalidate()
  }, [rig, settings.paper, invalidate])

  const firstTitle = useRef<BookRig | null>(null)
  useEffect(() => {
    if (!rig) return
    if (firstTitle.current !== rig) firstTitle.current = rig
    else rig.setTitle(feed.title, feed.author)
    invalidate()
  }, [rig, feed.title, feed.author, invalidate])

  useEffect(() => {
    if (!rig) return
    rig.openTarget = settings.open ? 1 : 0
    invalidate()
  }, [rig, settings.open, invalidate])

  useEffect(() => {
    if (!rig) return
    rig.setSource(feed.source ?? { texture: () => blank(rig) }, feed.totalPages)
    invalidate()
  }, [rig, feed.source, feed.totalPages, invalidate])

  // show the wanted spread, unless the reader has just turned to it themselves
  const reported = useRef(-1)
  useEffect(() => {
    if (!rig) return
    if (feed.spread !== reported.current || rig.spread !== feed.spread) {
      reported.current = feed.spread
      if (rig.spread !== feed.spread || rig.turning) rig.jumpTo(feed.spread)
    }
    invalidate()
  }, [rig, feed.spread, feed.totalPages, invalidate])

  useEffect(() => {
    if (!rig) return
    rig.onSpreadChange = (spread) => {
      const dir = spread > reported.current ? 1 : -1
      reported.current = spread
      live.current.feed.onSpread(spread, dir)
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => (rig.reducedMotion = mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [rig])

  useEffect(() => {
    if (!apiRef || !rig) return
    apiRef.current = {
      flip: (dir) => {
        rig.flip(dir)
        invalidate()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, rig, invalidate])

  // pointer page turning
  useEffect(() => {
    if (!rig) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    const locate = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      plane.constant = -rig.pose.yG
      return ray.ray.intersectPlane(plane, hit) ? hit : null
    }
    /** a turn can start on this side: in one-page view only the page on screen can be turned onwards */
    const turnable = (dir: 1 | -1) => {
      const focus = live.current.feed.focus
      return focus === 'both' || (dir === 1 ? focus === 'right' : focus === 'left')
    }
    let press: { id: number; dir: 1 | -1; x: number; y: number; rel: number; moved: boolean; turning: boolean } | null = null
    let peeking: 1 | -1 | 0 = 0

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const p = locate(e)
      if (!p) return
      const r = el.getBoundingClientRect()
      const rel = (e.clientX - r.left) / r.width
      const dir = live.current.feed.focus === 'both' ? (p.x >= 0 ? 1 : -1) : rel >= 0.5 ? 1 : -1
      press = { id: e.pointerId, dir, x: e.clientX, y: e.clientY, rel, moved: false, turning: turnable(dir) && rig.beginDrag(dir) }
      peeking = 0
      el.setPointerCapture(e.pointerId)
      invalidate()
    }
    const move = (e: PointerEvent) => {
      if (!press) {
        // a mouse resting near an outer corner lifts it a little
        if (e.pointerType !== 'mouse') return
        const p = locate(e)
        const d = rig.dims
        const side = p && Math.abs(p.x) > d.W * 0.7 && Math.abs(p.x) < d.W * 1.04 && Math.abs(p.z) > d.H * 0.28 && Math.abs(p.z) < d.H * 0.54 ? (p.x > 0 ? 1 : -1) : 0
        if (side !== peeking) {
          if (peeking) rig.peek(peeking, false)
          if (side && turnable(side)) rig.peek(side, true)
          peeking = side
          invalidate()
        }
        return
      }
      if (e.pointerId !== press.id) return
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return
      press.moved = true
      if (!press.turning) return
      const p = locate(e)
      if (p) rig.dragTurn(p.x / rig.dims.W, p.z / (rig.dims.H / 2))
      invalidate()
    }
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return
      const g = press
      press = null
      const { feed } = live.current
      const edge = feed.focus === 'both' ? 0.38 : 0.3
      const middle = g.rel > edge && g.rel < 1 - edge
      if (e.type === 'pointercancel') {
        if (g.turning) rig.releaseDrag()
      } else if (g.turning) {
        if (g.moved) rig.releaseDrag()
        else if (middle) {
          rig.releaseDrag()
          feed.onTapMiddle()
        } else rig.completeDrag(g.dir)
      } else {
        const dx = e.clientX - g.x
        if (g.moved) {
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - g.y) * 1.5) feed.onStep(dx < 0 ? 1 : -1)
        } else if (middle) feed.onTapMiddle()
        else feed.onStep(g.dir)
      }
      invalidate()
    }
    const leave = () => {
      if (peeking) rig.peek(peeking, false)
      peeking = 0
      invalidate()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
  }, [gl, camera, rig, invalidate])

  // once the book lies open, lift the corner for a moment to show that pages can be turned
  const hinted = useRef(false)
  const hint = () => {
    if (!rig || hinted.current) return
    hinted.current = true
    if (skipHint.current) return
    const dir = live.current.feed.focus === 'left' ? -1 : 1
    setTimeout(() => {
      rig.peek(dir, true)
      invalidate()
    }, 250)
    setTimeout(() => {
      rig.peek(dir, false)
      invalidate()
    }, 1500)
  }

  const lightDir = useMemo(() => new THREE.Vector3(), [])
  const lightColor = useMemo(() => new THREE.Color(), [])
  const lampDir = useMemo(() => LAMP_POS.clone().normalize(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const view = useRef<{ x: number; single: number } | null>(null)
  const ready = useRef(false)
  const rate = useRef({ time: 0, frames: 0 })
  useFrame((_, dt) => {
    if (!rig) return
    rig.tick(dt)
    if (rig.isOpen) hint()

    // frame the book: the cover when closed, the spread when open, one page on narrow screens
    const d = rig.dims
    const a = rig.openAmount
    const focus = live.current.feed.focus
    const wantX = focus === 'left' ? -d.W / 2 : focus === 'right' ? d.W / 2 : 0
    const wantSingle = focus === 'both' ? 0 : 1
    const v = (view.current ??= { x: wantX, single: wantSingle })
    const ease = rig.reducedMotion ? 1 : Math.min(1, dt * 7)
    v.x += (wantX - v.x) * ease
    v.single += (wantSingle - v.single) * ease
    const panning = Math.abs(wantX - v.x) > 0.0008 || Math.abs(wantSingle - v.single) > 0.0008
    if (!panning) {
      v.x = wantX
      v.single = wantSingle
    }
    const { dist } = framing(size.width, size.height, a, v.single)
    target.set(v.x * a, THREE.MathUtils.lerp(d.T / 2, 0.1, a), 0.04)
    camera.position.set(target.x, target.y + Math.sin(VIEW_ELEVATION) * dist, target.z + Math.cos(VIEW_ELEVATION) * dist)
    camera.lookAt(target)

    // the light that glows through a turning page: the room light by day, the lamp at night
    const night = mood.current.night
    lightDir.copy(LIGHT_POS).normalize().lerp(lampDir, night).normalize().transformDirection(camera.matrixWorldInverse)
    rig.setLight(lightDir, lightColor.lerpColors(LIGHT_COLOR, LAMP_GLOW, night))

    if (!ready.current) {
      ready.current = true
      live.current.onReady?.()
    }
    // measure how smoothly page turns run, to step the quality down on slow devices
    if (rig.turning && dt < 0.5) {
      rate.current.time += dt
      rate.current.frames++
      if (rate.current.frames >= 40) {
        live.current.onFrameRate?.(rate.current.frames / rate.current.time)
        rate.current = { time: 0, frames: 0 }
      }
    }
    if (rig.busy || panning) invalidate()
  })

  return rig ? <primitive object={rig.group} /> : null
}

const LAMP_GLOW = LAMP_COLOR.clone().multiplyScalar(1.5)

const blanks = new WeakMap<BookRig, THREE.Texture>()
function blank(rig: BookRig) {
  let t = blanks.get(rig)
  if (!t) {
    t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    t.needsUpdate = true
    blanks.set(rig, t)
  }
  return t
}

export function BookScene(props: BookProps) {
  const q = QUALITY[props.settings.quality]
  const night = !!props.settings.night
  const mood = useRef({ night: night ? 1 : 0 })
  return (
    <Canvas
      // the renderer's own smoothing cannot be changed once it exists
      key={q.post ? 'post' : 'plain'}
      shadows
      frameloop="demand"
      dpr={[1, q.maxDpr]}
      camera={{ fov: FOV, near: 0.5, far: 60, position: [0, 6, 3] }}
      gl={{ antialias: !q.post, powerPreference: 'high-performance' }}
      style={{ background: '#0d0907' }}
      aria-hidden="true"
    >
      <color attach="background" args={['#0d0907']} />
      <fog attach="fog" args={['#0d0907', 9, 24]} />
      <Lighting night={night} quality={props.settings.quality} mood={mood} />
      <Suspense fallback={null}>
        <Environment files={`${ASSETS}/hdri/wooden_lounge.hdr`} environmentIntensity={ENVIRONMENT} />
      </Suspense>
      <Desk kind={props.settings.desk} res={q.textures} />
      <Book {...props} mood={mood} />
      {q.post && (
        <EffectComposer multisampling={q.msaa}>
          <N8AO aoRadius={0.3} intensity={2.4} distanceFalloff={0.8} halfRes={q.halfResAO} quality="medium" />
          {q.dof ? <DepthOfField target={[0, 0.1, 0.1]} worldFocusRange={2.6} bokehScale={2.4} /> : <></>}
          <Bloom intensity={night ? 0.16 : 0.12} luminanceThreshold={0.92} mipmapBlur />
          <Vignette offset={0.28} darkness={0.62} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
