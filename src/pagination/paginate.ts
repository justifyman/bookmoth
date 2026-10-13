import { compareAnchors } from '../model/document'
import type { Anchor, Block, BookContent, Run } from '../model/document'
import { ensureFont, measure } from './measure'
import type { LineItem, Page, PageGeometry, Segment, TypeSettings } from './types'

// The pagination engine shared by plain, 3D book and newspaper modes. It breaks the
// book's text into lines and pages for a given text area and type settings. Each
// mode only decides the size of the area and how to draw the result.

interface Token {
  text: string
  bold: boolean
  italic: boolean
  /** character offset within the block */
  offset: number
  /** a space comes before this token */
  space: boolean
  /** a line may start here even without a space (East Asian text, broken long words) */
  breakable: boolean
}

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/

const tokenCache = new WeakMap<Run[], Token[]>()

function tokenize(runs: Run[]): Token[] {
  const cached = tokenCache.get(runs)
  if (cached) return cached
  const tokens: Token[] = []
  let offset = 0
  let pendingSpace = false
  for (const run of runs) {
    const bold = !!run.bold
    const italic = !!run.italic
    let i = 0
    const text = run.text
    while (i < text.length) {
      if (text[i] === ' ') {
        pendingSpace = true
        i++
        continue
      }
      let j = i
      while (j < text.length && text[j] !== ' ') j++
      const word = text.slice(i, j)
      if (CJK.test(word)) {
        for (let k = 0; k < word.length; k++) {
          tokens.push({ text: word[k], bold, italic, offset: offset + i + k, space: pendingSpace && k === 0, breakable: true })
        }
      } else {
        tokens.push({ text: word, bold, italic, offset: offset + i, space: pendingSpace, breakable: false })
      }
      pendingSpace = false
      i = j
    }
    offset += text.length
  }
  if (tokens.length) tokens[0].space = false
  tokenCache.set(runs, tokens)
  return tokens
}

interface RawLine {
  tokens: { t: Token; w: number }[]
  /** width with ordinary spaces */
  natural: number
  /** number of spaces that can stretch */
  gaps: number
  last: boolean
}

interface Face {
  family: string
  size: number
  /** overrides the runs' own weight, for headings */
  bold?: boolean
}

function breakLines(tokens: Token[], face: Face, widthFor: (line: number) => number): RawLine[] {
  const { family, size } = face
  const spaceW = measure(' ', family, size)
  const lines: RawLine[] = []
  let line: RawLine = { tokens: [], natural: 0, gaps: 0, last: false }
  const push = () => {
    lines.push(line)
    line = { tokens: [], natural: 0, gaps: 0, last: false }
  }
  const widthOf = (t: Token) => measure(t.text, family, size, face.bold ?? t.bold, t.italic)

  let i = 0
  while (i < tokens.length) {
    // a word is a run of tokens with no break opportunity between them
    let j = i + 1
    while (j < tokens.length && !tokens[j].space && !tokens[j].breakable) j++
    const word = tokens.slice(i, j).map((t) => ({ t, w: widthOf(t) }))
    const wordW = word.reduce((s, x) => s + x.w, 0)
    const avail = widthFor(lines.length)
    const lead = line.tokens.length && tokens[i].space ? spaceW : 0

    if (line.tokens.length && line.natural + lead + wordW > avail) {
      push()
      continue // retry this word on the fresh line
    }
    if (!line.tokens.length && wordW > avail && word.length === 1 && word[0].t.text.length > 1) {
      // a single word wider than the line: cut it where it stops fitting
      const t = word[0].t
      let cut = 1
      while (cut < t.text.length && measure(t.text.slice(0, cut + 1), family, size, face.bold ?? t.bold, t.italic) <= avail) cut++
      const head: Token = { ...t, text: t.text.slice(0, cut) }
      const tail: Token = { ...t, text: t.text.slice(cut), offset: t.offset + cut, space: false, breakable: true }
      tokens = [...tokens.slice(0, i), head, tail, ...tokens.slice(i + 1)]
      continue
    }
    if (lead) line.gaps++
    line.natural += lead + wordW
    line.tokens.push(...word)
    i = j
  }
  if (line.tokens.length) lines.push(line)
  if (lines.length) lines[lines.length - 1].last = true
  return lines
}

type Align = 'left' | 'center' | 'justify'

function placeLine(raw: RawLine, face: Face, x0: number, width: number, align: Align): Segment[] {
  const spaceW = measure(' ', face.family, face.size)
  let gap = spaceW
  let x = x0
  const stretch = align === 'justify' && !raw.last && raw.gaps > 0 ? (width - raw.natural) / raw.gaps : 0
  // do not tear a short line apart just to fill the measure
  const justified = stretch > 0 && stretch < face.size * 0.9
  if (justified) gap += stretch
  if (align === 'center') x += (width - raw.natural) / 2

  const segments: Segment[] = []
  raw.tokens.forEach(({ t, w }, k) => {
    const bold = face.bold ?? t.bold
    if (k > 0 && t.space) x += gap
    const prev = segments[segments.length - 1]
    // unjustified neighbours in the same style can share one segment
    if (prev && !justified && !!prev.bold === bold && !!prev.italic === t.italic) {
      prev.text += (t.space ? ' ' : '') + t.text
      prev.width = x + w - prev.x
    } else {
      segments.push({ text: t.text, x, width: w, bold: bold || undefined, italic: t.italic || undefined })
    }
    x += w
  })
  return segments
}

export interface Pagination {
  pages: Page[]
  /** index of the first page of each chapter */
  chapterFirstPage: number[]
  type: TypeSettings
  geometry: PageGeometry
}

const HEADING_SCALE = [1.6, 1.25, 1.08]

function paginateChapter(blocks: Block[], chapter: number, type: TypeSettings, geo: PageGeometry): Page[] {
  const { fontFamily: family, fontSize: size } = type
  const lh = size * type.lineHeight
  const W = geo.width
  const pages: Page[] = []
  let page: Page = { chapter, indexInChapter: 0, start: { chapter, block: 0, offset: 0 }, items: [] }
  let H = geo.heightFor?.(0) ?? geo.height
  let y = 0

  const newPage = () => {
    pages.push(page)
    page = { chapter, indexInChapter: pages.length, start: { chapter, block: 0, offset: 0 }, items: [] }
    H = geo.heightFor?.(pages.length) ?? geo.height
    y = 0
  }
  const room = (h: number) => y + h <= H + 0.5
  /** vertical space that is dropped at the top of a page */
  const gap = (h: number) => {
    if (page.items.length) y += h
  }

  blocks.forEach((block, bi) => {
    const prev = blocks[bi - 1]

    if (block.type === 'break') {
      if (!room(lh * 2)) newPage()
      if (page.items.length) {
        page.items.push({ kind: 'ornament', y, height: lh * 2, block: bi, offset: 0 })
        y += lh * 2
      }
      return
    }

    if (block.type === 'image') {
      let w = Math.min(W, block.width)
      let h = (w * block.height) / Math.max(1, block.width)
      const maxH = (geo.heightFor?.(page.indexInChapter + 1) ?? geo.height) * 0.9
      if (h > maxH) {
        w *= maxH / h
        h = maxH
      }
      gap(lh * 0.5)
      if (!room(h)) newPage()
      page.items.push({ kind: 'image', y, height: h, x: (W - w) / 2, width: w, blob: block.blob, alt: block.alt, block: bi, offset: 0 })
      y += h + lh * 0.5
      return
    }

    const tokens = tokenize(block.runs)
    if (!tokens.length) return

    if (block.type === 'heading') {
      if (bi === 0 && geo.omitChapterHeading && blocks.length > 1) return
      const hs = size * HEADING_SCALE[block.level - 1]
      const hlh = hs * 1.25
      const face: Face = { family, size: hs, bold: block.level > 1 }
      const lines = breakLines(tokens, face, () => W)
      // keep a heading with at least two lines of what follows
      if (page.items.length && !room(lh * 1.2 + lines.length * hlh + lh * 2.8)) newPage()
      if (bi === 0) y += lh * (geo.chapterDrop ?? 2)
      else gap(lh * 1.2)
      for (const raw of lines) {
        if (!room(hlh)) newPage()
        const item: LineItem = { kind: 'line', y, height: hlh, size: hs, heading: block.level, block: bi, offset: raw.tokens[0].t.offset, segments: placeLine(raw, face, 0, W, block.level === 1 ? 'center' : 'left') }
        page.items.push(item)
        y += hlh
      }
      y += lh * 0.8
      return
    }

    const quote = block.type === 'quote'
    const inset = quote ? size * 1.6 : 0
    const width = W - inset * 2
    // book style: paragraphs are marked by an indent, except right after a heading or a break
    const indent = !quote && prev && (prev.type === 'paragraph' || prev.type === 'quote') ? size * 1.4 : 0
    const face: Face = { family, size }
    const lines = breakLines(tokens, face, (n) => width - (n === 0 ? indent : 0))
    if (quote) gap(lh * 0.5)
    lines.forEach((raw, n) => {
      if (!room(lh)) newPage()
      const first = n === 0 ? indent : 0
      const item: LineItem = { kind: 'line', y, height: lh, size, heading: 0, block: bi, offset: raw.tokens[0].t.offset, segments: placeLine(raw, face, inset + first, width - first, type.justify ? 'justify' : 'left') }
      page.items.push(item)
      y += lh
    })
    if (quote) y += lh * 0.5
  })

  if (page.items.length || !pages.length) pages.push(page)
  for (const p of pages) {
    const first = p.items[0]
    if (first) p.start = { chapter, block: first.block, offset: first.offset }
  }
  return pages
}

const now = () => performance.now()

/**
 * Paginates a whole book. Long books are worked through in short slices so the
 * interface stays responsive; pass an AbortSignal to drop a run that is no longer wanted.
 */
export async function paginate(content: BookContent, type: TypeSettings, geometry: PageGeometry, signal?: AbortSignal): Promise<Pagination> {
  await ensureFont(type.fontFamily)
  const pages: Page[] = []
  const chapterFirstPage: number[] = []
  let slice = now()
  for (let c = 0; c < content.chapters.length; c++) {
    chapterFirstPage.push(pages.length)
    for (const p of paginateChapter(content.chapters[c].blocks, c, type, geometry)) pages.push(p)
    if (now() - slice > 12) {
      await new Promise((r) => setTimeout(r))
      if (signal?.aborted) throw new DOMException('Pagination cancelled', 'AbortError')
      slice = now()
    }
  }
  if (!pages.length) {
    chapterFirstPage.push(0)
    pages.push({ chapter: 0, indexInChapter: 0, start: { chapter: 0, block: 0, offset: 0 }, items: [] })
  }
  return { pages, chapterFirstPage, type, geometry }
}

/** The page that contains a place in the text. */
export function pageOfAnchor(p: Pagination, anchor: Anchor) {
  const chapter = Math.min(Math.max(0, anchor.chapter), p.chapterFirstPage.length - 1)
  let lo = p.chapterFirstPage[chapter]
  let hi = (p.chapterFirstPage[chapter + 1] ?? p.pages.length) - 1
  if (anchor.chapter > chapter) return hi
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (compareAnchors(p.pages[mid].start, anchor) <= 0) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function anchorOfPage(p: Pagination, page: number): Anchor {
  return p.pages[Math.min(Math.max(0, page), p.pages.length - 1)].start
}
