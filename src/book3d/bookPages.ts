import * as THREE from 'three'
import type { BookContent } from '../model/document'
import { drawPage } from '../pagination/draw'
import { fontString } from '../pagination/measure'
import type { Pagination } from '../pagination/paginate'
import type { PageGeometry, TypeSettings } from '../pagination/types'
import type { PageSource } from './BookRig'
import { DEFAULT_DIMS } from './bookShape'

// The printed pages of the 3D book. The shared pagination engine decides what goes
// on each page; this draws a page as ink on white, which the page material
// multiplies into the paper the way real ink soaks in and darkens the sheet.

/** Margins as a share of the page: wider at the spine, as in a printed book. */
export const PAGE_MARGIN = { inner: 0.125, outer: 0.1, top: 0.105, bottom: 0.115 }
export const PAGE_ASPECT = DEFAULT_DIMS.W / DEFAULT_DIMS.H

export interface PageLayout {
  /** size of a whole page in layout pixels */
  width: number
  height: number
  /** the text area handed to the pagination engine */
  geometry: PageGeometry
}

/**
 * Page layout for a book whose pages appear `screenHeight` pixels tall, so that a
 * layout pixel is about one pixel on screen and type keeps its chosen size.
 */
export function pageLayout(screenHeight: number): PageLayout {
  const height = Math.round(Math.min(1150, Math.max(540, screenHeight)) / 20) * 20
  const width = Math.round(height * PAGE_ASPECT)
  return {
    width,
    height,
    geometry: { width: Math.round(width * (1 - PAGE_MARGIN.inner - PAGE_MARGIN.outer)), height: Math.round(height * (1 - PAGE_MARGIN.top - PAGE_MARGIN.bottom)), chapterDrop: 3 },
  }
}

/**
 * Pages are numbered as the rig counts them: 0 is the blank left-hand page facing
 * the first page of text, so page 1 of the book falls on the right as it should.
 */
export const rigIndexOfPage = (page: number) => page + 1
export const pageOfRigIndex = (index: number) => index - 1

export interface PageFurniture {
  /** running head, or '' on pages that carry none */
  head: string
  number: string
}

export function furnitureFor(pagination: Pagination, content: BookContent, title: string, page: number): PageFurniture {
  const p = pagination.pages[page]
  if (!p) return { head: '', number: '' }
  // chapter openings carry no running head; left pages name the book, right pages the chapter
  const opening = p.indexInChapter === 0
  const left = rigIndexOfPage(page) % 2 === 0
  const head = opening ? '' : left ? title : content.chapters[p.chapter]?.title || title
  return { head, number: String(page + 1) }
}

export class BookPages implements PageSource {
  private cache = new Map<number, { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement }>()
  private pagination: Pagination
  private content: BookContent
  private layout: PageLayout
  private title: string
  private ink: string
  private textureHeight: number
  /** called when a page that is already on show has been redrawn (a picture finished loading) */
  onChange?: () => void

  constructor(o: { pagination: Pagination; content: BookContent; layout: PageLayout; title: string; ink: string; textureHeight: number }) {
    this.pagination = o.pagination
    this.content = o.content
    this.layout = o.layout
    this.title = o.title
    this.ink = o.ink
    // no sharper than three texture pixels per layout pixel: more only costs memory
    this.textureHeight = Math.min(o.textureHeight, o.layout.height * 3)
  }

  get totalPages() {
    return this.pagination.pages.length + 1
  }

  texture(index: number) {
    let hit = this.cache.get(index)
    if (hit) {
      // keep recently used pages at the young end
      this.cache.delete(index)
      this.cache.set(index, hit)
      return hit.texture
    }
    const canvas = document.createElement('canvas')
    canvas.height = this.textureHeight
    canvas.width = Math.round(this.textureHeight * PAGE_ASPECT)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    hit = { texture, canvas }
    this.draw(index, hit)
    this.cache.set(index, hit)
    if (this.cache.size > 8) {
      const oldest = this.cache.keys().next().value!
      this.cache.get(oldest)!.texture.dispose()
      this.cache.delete(oldest)
    }
    return texture
  }

  /** Draws the pages around a spread ahead of time so the next turn starts without a hitch. */
  warm(spread: number) {
    for (const i of [2 * spread + 2, 2 * spread + 3, 2 * spread - 1, 2 * spread - 2]) if (i >= 0 && i < this.totalPages) this.texture(i)
    // the pages on show must outlive the ones just warmed
    for (const i of [2 * spread, 2 * spread + 1]) if (i < this.totalPages) this.texture(i)
  }

  dispose() {
    for (const { texture } of this.cache.values()) texture.dispose()
    this.cache.clear()
    this.onChange = undefined
  }

  private draw(index: number, target: { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement }) {
    const { canvas } = target
    const { layout, pagination } = this
    const type: TypeSettings = pagination.type
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const pageNo = pageOfRigIndex(index)
    const page = pagination.pages[pageNo]
    if (!page) return

    const s = canvas.height / layout.height
    ctx.scale(s, s)
    // even numbers are left-hand pages, with the gutter on their right
    const left = index % 2 === 0
    const x = layout.width * (left ? PAGE_MARGIN.outer : PAGE_MARGIN.inner)
    const y = layout.height * PAGE_MARGIN.top
    const w = layout.geometry.width
    const size = type.fontSize

    ctx.fillStyle = this.ink
    // a faint halo of the same colour: ink spreading a little into the paper fibres
    ctx.shadowColor = this.ink
    ctx.shadowBlur = size * 0.035 * s

    const { head, number } = furnitureFor(pagination, this.content, this.title, pageNo)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if (head) {
      ctx.font = fontString(type.fontFamily, size * 0.7)
      ctx.letterSpacing = `${size * 0.09}px`
      let text = head.toUpperCase()
      while (text.length > 8 && ctx.measureText(text).width > w * 0.96) text = text.slice(0, -2).trimEnd()
      ctx.fillText(text === head.toUpperCase() ? text : `${text}…`, x + w / 2, y * 0.6)
      ctx.letterSpacing = '0px'
    }
    ctx.font = fontString(type.fontFamily, size * 0.82)
    ctx.fillText(number, x + w / 2, layout.height * (1 - PAGE_MARGIN.bottom * 0.42))

    drawPage(ctx, page, type, {
      x,
      y,
      width: w,
      ink: this.ink,
      onImageReady: () => {
        if (this.cache.get(index) !== target) return
        this.draw(index, target)
        this.onChange?.()
      },
    })
    target.texture.needsUpdate = true
  }
}
