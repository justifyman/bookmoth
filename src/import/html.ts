import type { Block, Run } from '../model/document'

// Turns a parsed HTML tree (from an EPUB chapter or a converted Word file) into
// Lumen's blocks. Publisher styling is dropped on purpose: only structure and
// emphasis survive, so every mode can set the text its own way.

const SKIP = new Set(['script', 'style', 'head', 'template', 'noscript', 'nav', 'iframe', 'object', 'audio', 'video', 'form', 'button', 'input', 'select', 'textarea'])
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'table', 'tr', 'td', 'th', 'pre', 'figure', 'figcaption', 'address', 'body', 'center'])
const BOLD = new Set(['b', 'strong'])
const ITALIC = new Set(['i', 'em', 'cite', 'dfn', 'var'])

export type ImageLoader = (src: string) => Promise<Blob | null>

export async function imageBlock(blob: Blob, alt: string): Promise<Block | null> {
  try {
    const bmp = await createImageBitmap(blob)
    const { width, height } = bmp
    bmp.close()
    // spacer gifs and tiny decorations are not worth a place on the page
    if (width < 48 || height < 48) return null
    return { type: 'image', blob, width, height, alt }
  } catch {
    return null
  }
}

export async function htmlToBlocks(root: Element, loadImage?: ImageLoader): Promise<Block[]> {
  const out: (Block | Promise<Block | null>)[] = []
  let runs: Run[] = []
  let kind: 'paragraph' | 'quote' = 'paragraph'
  let heading: 0 | 1 | 2 | 3 = 0

  const flush = () => {
    if (runs.some((r) => r.text.trim())) {
      out.push(heading ? { type: 'heading', level: heading, runs } : { type: kind, runs })
    }
    runs = []
  }

  const walk = (node: Node, bold: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue ?? '').replace(/\s+/g, ' ')
      if (text) runs.push({ text, bold: bold || undefined, italic: italic || undefined })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.localName.toLowerCase()
    if (SKIP.has(tag)) return

    if (tag === 'br') return flush()
    if (tag === 'hr') {
      flush()
      out.push({ type: 'break' })
      return
    }
    if (tag === 'img' || tag === 'image') {
      const src = el.getAttribute('src') ?? el.getAttribute('xlink:href') ?? el.getAttribute('href')
      if (src && loadImage) {
        flush()
        const alt = el.getAttribute('alt') ?? ''
        out.push(loadImage(src).then((blob) => (blob ? imageBlock(blob, alt) : null)))
      }
      return
    }

    const style = el.getAttribute('style') ?? ''
    const cls = el.getAttribute('class') ?? ''
    const b = bold || BOLD.has(tag) || /font-weight:\s*(bold|[6-9]00)/i.test(style) || /\bbold\b/i.test(cls)
    const i = italic || ITALIC.has(tag) || /font-style:\s*italic/i.test(style) || /\bital/i.test(cls)

    const h = /^h([1-6])$/.exec(tag)
    if (h) {
      flush()
      heading = Math.min(3, Number(h[1])) as 1 | 2 | 3
      el.childNodes.forEach((c) => walk(c, false, i))
      flush()
      heading = 0
      return
    }
    if (tag === 'blockquote') {
      flush()
      const before = kind
      kind = 'quote'
      el.childNodes.forEach((c) => walk(c, b, i))
      flush()
      kind = before
      return
    }
    if (BLOCKS.has(tag)) {
      flush()
      if (tag === 'li') runs.push({ text: '• ' })
      el.childNodes.forEach((c) => walk(c, b, i))
      flush()
      return
    }
    el.childNodes.forEach((c) => walk(c, b, i))
  }

  walk(root, false, false)
  flush()
  const settled = await Promise.all(out)
  return settled.filter((b): b is Block => b !== null)
}

/** Plain text of the first heading, if a chapter starts with one. */
export function firstHeading(blocks: Block[]) {
  const first = blocks.find((b) => b.type !== 'image' && b.type !== 'break')
  return first?.type === 'heading' ? first.runs.map((r) => r.text).join('').trim() : ''
}
