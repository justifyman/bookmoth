import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Block, Chapter } from '../model/document'
import { ImportProblem, PROBLEMS } from './problems'
import { usable } from './metadata'
import type { Imported } from './index'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// PDFs store positioned glyphs, not paragraphs. This rebuilds running text from
// them: lines are gathered in reading order, page furniture (running heads, page
// numbers) is dropped, lines are joined back into paragraphs and words split by
// end-of-line hyphens are mended. It works well for ordinary prose and is
// approximate for complex layouts.

interface Line {
  text: string
  x0: number
  x1: number
  y: number
  size: number
  page: number
  /** 0 at the top of the page, 1 at the bottom */
  rel: number
}

export function openPdf(data: ArrayBuffer | Uint8Array) {
  return pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise
}

async function pageLines(doc: pdfjs.PDFDocumentProxy, pageNo: number): Promise<Line[]> {
  const page = await doc.getPage(pageNo)
  const view = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const lines: Line[] = []
  let cur: Line | null = null
  let lastEnd = 0
  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const item = raw
    const size = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10
    const x = item.transform[4]
    const y = item.transform[5]
    // items arrive in reading order; a new line starts when the baseline moves
    if (!cur || Math.abs(y - cur.y) > size * 0.5) {
      if (cur && cur.text.trim()) lines.push(cur)
      cur = { text: '', x0: x, x1: x, y, size, page: pageNo, rel: 1 - y / view.height }
      lastEnd = x
    }
    if (item.str) {
      const gap = x - lastEnd
      if (cur.text && gap > size * 0.18 && !cur.text.endsWith(' ') && !item.str.startsWith(' ')) cur.text += ' '
      cur.text += item.str
      cur.size = Math.max(cur.size, item.str.trim() ? size : 0)
      lastEnd = x + item.width
      cur.x1 = Math.max(cur.x1, lastEnd)
    }
    if (item.hasEOL && cur.text.trim()) {
      lines.push(cur)
      cur = null
    }
  }
  if (cur && cur.text.trim()) lines.push(cur)
  page.cleanup()
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text)
}

function mode(values: number[], round = 0.5) {
  const counts = new Map<number, number>()
  let best = values[0] ?? 0
  let bestN = 0
  for (const v of values) {
    const k = Math.round(v / round) * round
    const n = (counts.get(k) ?? 0) + 1
    counts.set(k, n)
    if (n > bestN) {
      bestN = n
      best = k
    }
  }
  return best
}

const PAGE_NUMBER = /^\W*(page\s*)?(\d{1,4}|[ivxlc]{1,7})(\s*(of|\/)\s*\d+)?\W*$/i
const TERMINAL = /[.!?:"”’)\]]$/
const CHAPTER = /^(chapter|part|book)\s+([\divxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i

export async function importPdf(data: ArrayBuffer): Promise<Imported & { scanned: boolean }> {
  let doc: pdfjs.PDFDocumentProxy
  try {
    // pdf.js takes ownership of the bytes it is given, so hand it a copy
    doc = await openPdf(data.slice(0))
  } catch (e) {
    if ((e as Error)?.name === 'PasswordException') throw new ImportProblem(PROBLEMS.passwordPdf())
    throw new ImportProblem(PROBLEMS.damaged())
  }

  try {
    let title = ''
    let author = ''
    try {
      const info = (await doc.getMetadata()).info as Record<string, unknown>
      title = usable(info?.Title)
      author = usable(info?.Author)
    } catch {
      // metadata is optional
    }

    const cover = await renderPageBlob(doc, 1, 420).catch(() => null)

    const pages: Line[][] = []
    for (let n = 1; n <= doc.numPages; n++) {
      pages.push(await pageLines(doc, n))
      if (n % 8 === 0) await new Promise((r) => setTimeout(r))
    }
    const chars = pages.reduce((sum, p) => sum + p.reduce((s, l) => s + l.text.length, 0), 0)
    if (chars < Math.max(200, doc.numPages * 40)) return { title, author, cover, content: { chapters: [] }, scanned: true }

    // running heads and page numbers: short lines in the top or bottom margin that repeat
    const signature = (l: Line) => l.text.replace(/\d+/g, '#').toLowerCase()
    const repeats = new Map<string, number>()
    for (const p of pages) for (const l of p) if ((l.rel < 0.1 || l.rel > 0.9) && l.text.length < 70) repeats.set(signature(l), (repeats.get(signature(l)) ?? 0) + 1)
    const often = Math.max(3, doc.numPages * 0.15)
    const lines = pages.flatMap((p) =>
      p.filter((l) => {
        if (l.rel >= 0.1 && l.rel <= 0.9) return true
        if (PAGE_NUMBER.test(l.text)) return false
        return !(l.text.length < 70 && (repeats.get(signature(l)) ?? 0) >= often)
      }),
    )
    if (!lines.length) return { title, author, cover, content: { chapters: [] }, scanned: true }

    const body = mode(lines.flatMap((l) => Array(Math.min(40, Math.ceil(l.text.length / 10))).fill(l.size)))
    const gaps: number[] = []
    for (let i = 1; i < lines.length; i++) {
      const dy = lines[i - 1].y - lines[i].y
      if (lines[i].page === lines[i - 1].page && dy > 0 && dy < body * 3) gaps.push(dy)
    }
    const leading = gaps.length ? mode(gaps) : body * 1.2
    const right = lines.map((l) => l.x1).sort((a, b) => a - b)[Math.floor(lines.length * 0.9)]
    const left = mode(lines.map((l) => l.x0), 2)

    const blocks: Block[] = []
    let para = ''
    let prev: Line | null = null
    const flush = () => {
      if (para.trim()) blocks.push({ type: 'paragraph', runs: [{ text: para.trim() }] })
      para = ''
    }
    for (const line of lines) {
      const isHeading = line.text.length < 120 && (line.size >= body * 1.18 || (CHAPTER.test(line.text) && line.text.length < 60))
      if (isHeading) {
        flush()
        const level = line.size >= body * 1.5 || CHAPTER.test(line.text) ? 1 : 2
        const last = blocks[blocks.length - 1]
        // a heading set over two lines
        if (prev && last?.type === 'heading' && last.level === level && prev.page === line.page && Math.abs(prev.size - line.size) < 0.5) last.runs[0].text += ` ${line.text}`
        else blocks.push({ type: 'heading', level, runs: [{ text: line.text }] })
        prev = line
        continue
      }
      let fresh = !prev || !para
      if (prev && para) {
        const samePage = prev.page === line.page
        const dy = prev.y - line.y
        const indented = line.x0 - left > body * 0.8 && prev.x0 - left <= body * 0.8
        const prevShort = prev.x1 < right - (right - left) * 0.12
        const ended = TERMINAL.test(prev.text)
        if (samePage && dy > leading * 1.45) fresh = true
        else if (indented) fresh = true
        // a short line that ends a sentence closes its paragraph, also across a page or column break
        else if (prevShort && ended) fresh = true
      }
      if (fresh) flush()
      if (para.endsWith('-') && /^[a-z]/.test(line.text) && !para.endsWith(' -')) para = para.slice(0, -1) + line.text
      else para += (para ? ' ' : '') + line.text
      prev = line
    }
    flush()

    const chapters: Chapter[] = []
    let current: Chapter = { title: '', blocks: [] }
    for (const block of blocks) {
      if (block.type === 'heading' && block.level === 1) {
        if (current.blocks.length) chapters.push(current)
        current = { title: block.runs[0].text, blocks: [block] }
      } else current.blocks.push(block)
    }
    if (current.blocks.length) chapters.push(current)
    return { title, author, cover, content: { chapters }, scanned: false }
  } finally {
    void doc.loadingTask.destroy()
  }
}

/** Renders one page to an image, for covers and the page-by-page viewer. */
export async function renderPageBlob(doc: pdfjs.PDFDocumentProxy, pageNo: number, width: number): Promise<Blob> {
  const canvas = await renderPageCanvas(doc, pageNo, width)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/jpeg', 0.85))
}

export async function renderPageCanvas(doc: pdfjs.PDFDocumentProxy, pageNo: number, width: number) {
  const page = await doc.getPage(pageNo)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}
