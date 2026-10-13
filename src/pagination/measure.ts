// Text measurement with a canvas, cached per font face. Widths scale linearly with
// size, so each word is measured once at a reference size and scaled as needed.

const REF = 100
const FALLBACK = 'Georgia, "Times New Roman", serif'

let ctx: CanvasRenderingContext2D | null = null
const caches = new Map<string, Map<string, number>>()

export function fontString(family: string, size: number, bold = false, italic = false) {
  return `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px "${family}", ${FALLBACK}`
}

export function measure(text: string, family: string, size: number, bold = false, italic = false) {
  const key = `${family}|${bold ? 1 : 0}${italic ? 1 : 0}`
  let cache = caches.get(key)
  if (!cache) caches.set(key, (cache = new Map()))
  let w = cache.get(text)
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')!
    ctx.font = fontString(family, REF, bold, italic)
    w = ctx.measureText(text).width
    cache.set(text, w)
  }
  return (w * size) / REF
}

const loaded = new Map<string, Promise<void>>()

/** Makes sure every face of a font is ready before text is measured with it. */
export function ensureFont(family: string) {
  let p = loaded.get(family)
  if (!p) {
    const faces = ['400', '700', 'italic 400', 'italic 700'].map((f) => document.fonts.load(`${f} 16px "${family}"`).catch(() => []))
    p = Promise.all(faces).then(() => {
      // anything measured before the font arrived used the fallback
      for (const key of caches.keys()) if (key.startsWith(`${family}|`)) caches.delete(key)
    })
    loaded.set(family, p)
  }
  return p
}
