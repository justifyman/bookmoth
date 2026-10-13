import type { Block, Chapter } from '../model/document'
import { ImportProblem, PROBLEMS } from './problems'
import type { Imported } from './index'

function decode(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(data)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(data)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    // older files are usually in the Western European encoding
    return new TextDecoder('windows-1252').decode(data)
  }
}

const CHAPTER_LINE = /^\s*(chapter|book|part|volume|act|canto|letter|section|prologue|epilogue|preface|introduction)\b[\s.:—-]*([\divxlcm]+|one|two|three|four|five|six|seven|eight|nine|ten|the\s+\w+)?\b.{0,60}$/i

function isChapterLine(line: string) {
  const t = line.trim()
  if (!t || t.length > 80) return false
  if (CHAPTER_LINE.test(t) && !/[.,;]$/.test(t.replace(/\.$/, ''))) return true
  // a lone roman numeral or number on its own line
  return /^([IVXLC]+|\d{1,3})\.?$/.test(t)
}

/** Text with emphasis marked the Project Gutenberg way: _italic_. */
function runsOf(text: string) {
  const parts = text.split(/_([^_\n]{1,400})_/)
  if (parts.length === 1) return [{ text }]
  return parts.map((p, i) => (i % 2 ? { text: p, italic: true } : { text: p })).filter((r) => r.text)
}

export function importTxt(data: ArrayBuffer): Imported {
  let text = decode(data).replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
  if (!text.trim()) throw new ImportProblem(PROBLEMS.empty())

  // Project Gutenberg files carry a licence wrapper with the title and author in it
  let title = ''
  let author = ''
  const start = /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(text)
  if (start) {
    const head = text.slice(0, start.index)
    title = /^Title:\s*(.+)$/m.exec(head)?.[1].trim() ?? ''
    author = /^Author:\s*(.+)$/m.exec(head)?.[1].trim() ?? ''
    text = text.slice(start.index + start[0].length)
    const end = /\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(text)
    if (end) text = text.slice(0, end.index)
  }

  const lines = text.split('\n')
  const blank = lines.filter((l) => !l.trim()).length
  const long = lines.filter((l) => l.length > 160).length
  // hard-wrapped files separate paragraphs with blank lines; others put one paragraph per line
  const wrapped = blank > lines.length * 0.08 && long < lines.length * 0.2

  const paragraphs: string[] = []
  if (wrapped) {
    let cur: string[] = []
    const flush = () => {
      if (cur.length) paragraphs.push(cur.join(' '))
      cur = []
    }
    for (const line of lines) {
      if (!line.trim()) flush()
      else if (isChapterLine(line) && !cur.length) {
        paragraphs.push(line.trim())
      } else cur.push(line.trim())
    }
    flush()
  } else {
    for (const line of lines) if (line.trim()) paragraphs.push(line.trim())
  }

  const chapters: Chapter[] = []
  const subtitled = new Set<Chapter>()
  let current: Chapter = { title: '', blocks: [] }
  for (const p of paragraphs) {
    if (/^(\*\s*){3,}$|^[-–—_]{3,}$/.test(p)) {
      current.blocks.push({ type: 'break' })
      continue
    }
    if (isChapterLine(p)) {
      if (current.blocks.length) chapters.push(current)
      current = { title: p, blocks: [{ type: 'heading', level: 1, runs: [{ text: p }] }] }
      continue
    }
    // "CHAPTER I." with its name on the next line: the name belongs in the title
    const heading = current.blocks.length === 1 && current.blocks[0].type === 'heading' ? current.blocks[0] : null
    if (heading && p.length < 70 && !/[.!?,;:"”’]$/.test(p) && !subtitled.has(current) && heading.runs[0].text === current.title && !/\s\S+\s\S+\s/.test(current.title)) {
      current.title = `${current.title.replace(/[.:]$/, '')}. ${p}`
      heading.runs = [{ text: current.title }]
      subtitled.add(current)
      continue
    }
    const block: Block = { type: 'paragraph', runs: runsOf(p) }
    current.blocks.push(block)
  }
  if (current.blocks.length) chapters.push(current)

  // a table of contents reads as a run of chapters with nothing in them: drop the
  // entries whose real chapter comes later, and fold any other empty one into the next
  const key = (c: Chapter) => c.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 2).join(' ')
  const empty = (c: Chapter) => c.blocks.length === 1 && c.blocks[0].type === 'heading'
  for (let i = chapters.length - 1; i >= 0; i--) {
    const c = chapters[i]
    if (!empty(c) || chapters.length === 1) continue
    const later = chapters.slice(i + 1).some((d) => !empty(d) && key(d) === key(c))
    const next = chapters[i + 1]
    if (!later && next) {
      const first = next.blocks[0]
      if (first.type === 'heading') first.level = 2
      next.blocks.unshift(c.blocks[0])
      next.title = c.title
    }
    if (later || next) chapters.splice(i, 1)
  }
  if (!chapters.length) throw new ImportProblem(PROBLEMS.empty())
  return { title, author, cover: null, content: { chapters } }
}
