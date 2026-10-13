import * as THREE from 'three'
import { PLACEHOLDER_TITLE, layoutPlaceholder } from './placeholder'
import type { PlaceholderPage } from './placeholder'

// Draws the printed side of a page: ink on white. The page material multiplies this
// into the paper, the way real ink soaks in and darkens the sheet.

export interface PageInkOptions {
  /** canvas height in pixels; width follows the page proportions */
  height: number
  aspect: number
  font: string
  /** 1 is a comfortable book size */
  fontScale: number
  ink: string
}

const MARGIN = { inner: 0.125, outer: 0.105, top: 0.105, bottom: 0.115 }
const LINE_HEIGHT = 1.42

function metrics(o: PageInkOptions) {
  const w = Math.round(o.height * o.aspect)
  const size = o.height * 0.0185 * o.fontScale
  const lh = size * LINE_HEIGHT
  const textW = w * (1 - MARGIN.inner - MARGIN.outer)
  const textH = o.height * (1 - MARGIN.top - MARGIN.bottom)
  return { w, size, lh, textW, textH, linesPerPage: Math.floor(textH / lh) }
}

export class PlaceholderBook {
  readonly pages: PlaceholderPage[]
  private o: PageInkOptions
  private cache = new Map<number, THREE.CanvasTexture>()
  maxAnisotropy = 8

  constructor(o: PageInkOptions) {
    this.o = o
    const m = metrics(o)
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `${m.size}px "${o.font}", Georgia, serif`
    this.pages = layoutPlaceholder((s) => ctx.measureText(s).width, m.textW, m.linesPerPage, m.size * 1.4)
  }

  /** Texture for a page number; the placeholder text simply repeats. */
  texture(index: number) {
    let t = this.cache.get(index)
    if (!t) {
      t = this.draw(index)
      this.cache.set(index, t)
      if (this.cache.size > 10) {
        const oldest = this.cache.keys().next().value!
        this.cache.get(oldest)!.dispose()
        this.cache.delete(oldest)
      }
    }
    return t
  }

  dispose() {
    for (const t of this.cache.values()) t.dispose()
    this.cache.clear()
  }

  private draw(index: number) {
    const o = this.o
    const m = metrics(o)
    const page = this.pages[((index % this.pages.length) + this.pages.length) % this.pages.length]
    const canvas = document.createElement('canvas')
    canvas.width = m.w
    canvas.height = o.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, m.w, o.height)

    // even page numbers are left-hand pages, with the gutter on their right
    const isLeft = index % 2 === 0
    const x0 = m.w * (isLeft ? MARGIN.outer : MARGIN.inner)
    const serif = `"${o.font}", Georgia, serif`
    ctx.fillStyle = o.ink
    ctx.textBaseline = 'alphabetic'
    // a faint halo of the same colour: ink spreading a little into the paper fibres
    ctx.shadowColor = o.ink
    ctx.shadowBlur = m.size * 0.035

    // running head and page number
    ctx.textAlign = 'center'
    ctx.font = `${m.size * 0.72}px ${serif}`
    ctx.letterSpacing = `${m.size * 0.09}px`
    if (!page.chapterStart) ctx.fillText(PLACEHOLDER_TITLE.toUpperCase(), x0 + m.textW / 2, o.height * MARGIN.top * 0.62)
    ctx.letterSpacing = '0px'
    ctx.font = `${m.size * 0.85}px ${serif}`
    ctx.fillText(String(141 + index), x0 + m.textW / 2, o.height * (1 - MARGIN.bottom * 0.45))

    let y = o.height * MARGIN.top + m.size
    if (page.chapterStart) {
      ctx.font = `${m.size * 0.8}px ${serif}`
      ctx.letterSpacing = `${m.size * 0.16}px`
      ctx.fillText('CHAPTER', x0 + m.textW / 2, y + m.lh * 1.6)
      ctx.letterSpacing = '0px'
      ctx.font = `${m.size * 1.9}px ${serif}`
      ctx.fillText('I', x0 + m.textW / 2, y + m.lh * 3.5)
      y += m.lh * 7
    }

    ctx.textAlign = 'left'
    ctx.font = `${m.size}px ${serif}`
    const space = ctx.measureText(' ').width
    for (const line of page.lines) {
      const indent = line.indent ? m.size * 1.4 : 0
      let x = x0 + indent
      let gap = space
      if (line.justify && line.words.length > 1) {
        const natural = line.words.reduce((sum, w) => sum + ctx.measureText(w).width, 0)
        gap = (m.textW - indent - natural) / (line.words.length - 1)
      }
      for (const word of line.words) {
        ctx.fillText(word, x, y)
        x += ctx.measureText(word).width + gap
      }
      y += m.lh
    }

    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = this.maxAnisotropy
    return t
  }
}

export function blankInk() {
  const c = document.createElement('canvas')
  c.width = c.height = 4
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 4, 4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
