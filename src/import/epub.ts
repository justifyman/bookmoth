import ePub from 'epubjs'
import type { Block, Chapter } from '../model/document'
import { firstHeading, htmlToBlocks } from './html'
import { ImportProblem, PROBLEMS } from './problems'
import { usable } from './metadata'
import type { Imported } from './index'

// epub.js unpacks the book and reads its manifest; the chapters are then converted
// to Lumen's own blocks rather than shown through epub.js's renderer.

interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

/** Font scrambling is allowed and harmless; anything else encrypted means the book is locked. */
const FONT_SCRAMBLING = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']

const stripFragment = (href: string) => decodeURIComponent(href.split('#')[0])

export async function importEpub(data: ArrayBuffer): Promise<Imported> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let book: any
  try {
    // opened by hand: given the file directly, epub.js hides a failure and never finishes
    book = ePub()
    await book.open(data, 'binary')
    await book.ready
  } catch {
    throw new ImportProblem(PROBLEMS.damaged())
  }

  try {
    const zip = book.archive?.zip
    const encryption = await zip?.file('META-INF/encryption.xml')?.async('string')
    if (encryption) {
      const algorithms = [...encryption.matchAll(/Algorithm="([^"]+)"/g)].map((m: RegExpMatchArray) => m[1])
      if (algorithms.some((a: string) => !FONT_SCRAMBLING.includes(a))) throw new ImportProblem(PROBLEMS.protected())
    }
    if (zip?.file('META-INF/sinf.xml')) throw new ImportProblem(PROBLEMS.protected())

    const meta = await book.loaded.metadata
    const nav = await book.loaded.navigation
    const labels = new Map<string, string>()
    const collect = (items: TocItem[]) => {
      for (const item of items ?? []) {
        const key = stripFragment(item.href).split('/').pop() ?? ''
        if (key && !labels.has(key)) labels.set(key, item.label.replace(/\s+/g, ' ').trim())
        if (item.subitems) collect(item.subitems)
      }
    }
    collect(nav?.toc ?? [])

    let cover: Blob | null = null
    try {
      const coverUrl: string | null = await book.coverUrl()
      if (coverUrl) cover = await (await fetch(coverUrl)).blob()
    } catch {
      // a missing cover is fine; the library draws one
    }

    const sections: { href: string; load: () => Promise<Element>; unload: () => void }[] = []
    book.spine.each((section: { href: string; linear: boolean; load: (r: unknown) => Promise<Element>; unload: () => void }) => {
      if (section.linear !== false) sections.push({ href: section.href, load: () => section.load(book.load.bind(book)), unload: () => section.unload() })
    })

    const chapters: Chapter[] = []
    for (const section of sections) {
      let root: Element
      try {
        root = await section.load()
      } catch {
        continue // one unreadable chapter should not lose the whole book
      }
      const base = `http://book${book.resolve(section.href)}`
      const loadImage = async (src: string) => {
        try {
          if (src.startsWith('data:')) return await (await fetch(src)).blob()
          const path = decodeURIComponent(new URL(src, base).pathname)
          return (await book.archive.getBlob(path)) as Blob
        } catch {
          return null
        }
      }
      const body = root.querySelector?.('body') ?? root
      const blocks: Block[] = await htmlToBlocks(body, loadImage)
      section.unload()
      if (!blocks.length) continue

      const label = labels.get(stripFragment(section.href).split('/').pop() ?? '')
      const heading = firstHeading(blocks)
      const previous = chapters[chapters.length - 1]
      // long chapters are often split across files: a part with no title of its own belongs to the one before
      if (!label && !heading && previous) previous.blocks.push(...blocks)
      else chapters.push({ title: label || heading, blocks })
    }

    if (!chapters.length) throw new ImportProblem(PROBLEMS.empty())
    return { title: usable(meta?.title), author: usable(meta?.creator), cover, content: { chapters } }
  } catch (e) {
    if (e instanceof ImportProblem) throw e
    throw new ImportProblem(PROBLEMS.damaged())
  } finally {
    try {
      book.destroy()
    } catch {
      // nothing to clean up
    }
  }
}
