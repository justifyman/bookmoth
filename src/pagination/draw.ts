import { fontString } from './measure'
import type { Page, TypeSettings } from './types'

// Draws a paginated page onto a canvas. The 3D book turns these canvases into
// page textures; the same line positions drive the DOM renderer in plain mode.

const bitmaps = new WeakMap<Blob, ImageBitmap | 'loading' | 'failed'>()

/** Returns a decoded image if it is ready, otherwise starts decoding and calls `onReady` later. */
export function bitmapFor(blob: Blob, onReady?: () => void) {
  const hit = bitmaps.get(blob)
  if (hit && typeof hit !== 'string') return hit
  if (!hit) {
    bitmaps.set(blob, 'loading')
    createImageBitmap(blob).then(
      (bmp) => {
        bitmaps.set(blob, bmp)
        onReady?.()
      },
      () => bitmaps.set(blob, 'failed'),
    )
  }
  return null
}

/** Distance from the top of a line box to the text baseline. */
export function baselineOf(height: number, size: number) {
  return (height - size) / 2 + size * 0.8
}

export interface DrawOptions {
  /** top-left corner of the text area on the canvas, in layout pixels */
  x: number
  y: number
  /** width of the text area */
  width: number
  ink: string
  onImageReady?: () => void
}

export function drawPage(ctx: CanvasRenderingContext2D, page: Page, type: TypeSettings, o: DrawOptions) {
  ctx.fillStyle = o.ink
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  for (const item of page.items) {
    const top = o.y + item.y
    if (item.kind === 'line') {
      const base = top + baselineOf(item.height, item.size)
      for (const seg of item.segments) {
        ctx.font = fontString(type.fontFamily, item.size, seg.bold, seg.italic)
        ctx.fillText(seg.text, o.x + seg.x, base)
      }
    } else if (item.kind === 'ornament') {
      ctx.font = fontString(type.fontFamily, type.fontSize)
      ctx.textAlign = 'center'
      ctx.fillText('*   *   *', o.x + o.width / 2, top + item.height / 2 + type.fontSize * 0.3)
      ctx.textAlign = 'left'
    } else {
      const bmp = bitmapFor(item.blob, o.onImageReady)
      if (bmp) {
        ctx.save()
        ctx.shadowColor = 'transparent'
        // pictures are printed too: multiply keeps the paper showing through
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(bmp, o.x + item.x, top, item.width, item.height)
        ctx.restore()
      }
    }
  }
}
