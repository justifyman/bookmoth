import mammoth from 'mammoth/mammoth.browser'
import type { Block, Chapter } from '../model/document'
import { htmlToBlocks } from './html'
import { ImportProblem, PROBLEMS } from './problems'
import type { Imported } from './index'

export async function importDocx(data: ArrayBuffer): Promise<Imported> {
  let html: string
  try {
    html = (await mammoth.convertToHtml({ arrayBuffer: data })).value
  } catch {
    throw new ImportProblem(PROBLEMS.damaged())
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = await htmlToBlocks(doc.body, async (src) => {
    try {
      return src.startsWith('data:') ? await (await fetch(src)).blob() : null
    } catch {
      return null
    }
  })
  if (!blocks.length) throw new ImportProblem(PROBLEMS.empty())

  // chapters start at the document's top-level headings
  const levels = blocks.filter((b) => b.type === 'heading').map((b) => (b as { level: number }).level)
  const top = levels.length ? Math.min(...levels) : 0
  const chapters: Chapter[] = []
  let current: Chapter = { title: '', blocks: [] }
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === top) {
      if (current.blocks.length) chapters.push(current)
      const lifted: Block = { ...block, level: 1 }
      current = { title: block.runs.map((r) => r.text).join(''), blocks: [lifted] }
    } else current.blocks.push(block)
  }
  if (current.blocks.length) chapters.push(current)
  return { title: '', author: '', cover: null, content: { chapters } }
}
