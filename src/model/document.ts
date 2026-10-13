// The one shape every imported book is converted into. All reading modes and the
// pagination engine work from this, never from the original file.

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; runs: Run[] }
  | { type: 'paragraph'; runs: Run[] }
  | { type: 'quote'; runs: Run[] }
  /** a pause within a chapter, usually printed as a gap or an ornament */
  | { type: 'break' }
  | { type: 'image'; blob: Blob; width: number; height: number; alt: string }

export interface Chapter {
  title: string
  blocks: Block[]
}

export interface BookContent {
  chapters: Chapter[]
}

/**
 * A place in the text that survives any change of font, page size or reading mode:
 * chapter, block within it, and character offset within that block.
 */
export interface Anchor {
  chapter: number
  block: number
  offset: number
}

export const START: Anchor = { chapter: 0, block: 0, offset: 0 }

export function compareAnchors(a: Anchor, b: Anchor) {
  return a.chapter - b.chapter || a.block - b.block || a.offset - b.offset
}

export function blockText(block: Block) {
  return 'runs' in block ? block.runs.map((r) => r.text).join('') : ''
}

/** Length of every chapter in characters, used to turn an anchor into a 0..1 progress figure. */
export function chapterLengths(content: BookContent) {
  return content.chapters.map((c) => c.blocks.reduce((n, b) => n + blockText(b).length + 1, 0))
}

export function progressOf(content: BookContent, anchor: Anchor, lengths = chapterLengths(content)) {
  const total = lengths.reduce((a, b) => a + b, 0)
  if (!total) return 0
  let before = 0
  for (let c = 0; c < anchor.chapter && c < lengths.length; c++) before += lengths[c]
  const chapter = content.chapters[anchor.chapter]
  if (chapter) {
    for (let b = 0; b < anchor.block && b < chapter.blocks.length; b++) before += blockText(chapter.blocks[b]).length + 1
    before += anchor.offset
  }
  return Math.min(1, before / total)
}

/** Tidies imported content: trims, merges adjacent runs, drops empty blocks and chapters. */
export function normalizeContent(content: BookContent): BookContent {
  const chapters: Chapter[] = []
  for (const chapter of content.chapters) {
    const blocks: Block[] = []
    for (const block of chapter.blocks) {
      if (!('runs' in block)) {
        if (block.type === 'break' && (blocks.length === 0 || blocks[blocks.length - 1].type === 'break')) continue
        blocks.push(block)
        continue
      }
      const runs: Run[] = []
      for (const run of block.runs) {
        const text = run.text.replace(/\s+/g, ' ')
        if (!text) continue
        const last = runs[runs.length - 1]
        if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic) last.text = (last.text + text).replace(/ {2,}/g, ' ')
        else runs.push({ ...run, text })
      }
      if (runs.length) {
        runs[0].text = runs[0].text.trimStart()
        runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd()
      }
      const kept = runs.filter((r) => r.text)
      if (kept.length) blocks.push({ ...block, runs: kept })
    }
    while (blocks.length && blocks[blocks.length - 1].type === 'break') blocks.pop()
    if (blocks.length) chapters.push({ title: chapter.title.replace(/\s+/g, ' ').trim(), blocks })
  }
  return { chapters }
}

/** The place in the text that lies a given share (0..1) of the way through the book. */
export function anchorAtProgress(content: BookContent, progress: number, lengths = chapterLengths(content)): Anchor {
  const total = lengths.reduce((a, b) => a + b, 0)
  let left = Math.min(1, Math.max(0, progress)) * total
  for (let c = 0; c < content.chapters.length; c++) {
    if (left < lengths[c] || c === content.chapters.length - 1) {
      const blocks = content.chapters[c].blocks
      for (let b = 0; b < blocks.length; b++) {
        const len = blockText(blocks[b]).length + 1
        if (left < len || b === blocks.length - 1) return { chapter: c, block: b, offset: Math.max(0, Math.min(len - 1, Math.floor(left))) }
        left -= len
      }
    }
    left -= lengths[c]
  }
  return START
}
