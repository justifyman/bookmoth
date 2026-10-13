import { db } from '../db/schema'
import type { BookFormat, BookRecord } from '../db/schema'
import { START, normalizeContent } from '../model/document'
import type { BookContent } from '../model/document'
import { showToast } from '../ui/toasts'
import { fromFileName } from './metadata'
import { ImportProblem, PROBLEMS } from './problems'

/** What every importer hands back. Empty title or author means "not found in the file". */
export interface Imported {
  title: string
  author: string
  cover: Blob | null
  content: BookContent
}

const EXTENSIONS: Record<string, BookFormat> = { epub: 'epub', pdf: 'pdf', txt: 'txt', text: 'txt', docx: 'docx' }
export const ACCEPT = '.epub,.pdf,.txt,.docx,application/epub+zip,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const GIVE_UP_AFTER = 4 * 60 * 1000

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? ''

async function sniff(file: File): Promise<BookFormat | null> {
  const known = EXTENSIONS[extensionOf(file.name)]
  if (known) return known
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'pdf'
  if (file.type === 'application/epub+zip') return 'epub'
  if (file.type.startsWith('text/')) return 'txt'
  return null
}

async function fingerprint(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface Duplicate {
  file: File
  existing: BookRecord
}

// Books are read one at a time so a big batch does not exhaust memory.
let queue: Promise<unknown> = Promise.resolve()

/**
 * Adds files to the library. A card appears for each straight away and fills in as
 * the file is read. Files already in the library are handed to `onDuplicate`
 * instead of being added twice.
 */
export function importFiles(files: File[], onDuplicate: (d: Duplicate) => void, allowDuplicates = false) {
  for (const file of files) {
    const id = crypto.randomUUID()
    const guess = fromFileName(file.name)
    const now = Date.now()
    const placeholder: BookRecord = {
      id,
      title: guess.title,
      author: guess.author,
      format: EXTENSIONS[extensionOf(file.name)] ?? 'txt',
      fileName: file.name,
      hash: '',
      size: file.size,
      cover: null,
      status: 'importing',
      addedAt: now,
      lastOpenedAt: 0,
      progress: 0,
      anchor: START,
    }
    const created = db.books.add(placeholder)
    queue = queue.then(() => created).then(() => importOne(file, placeholder, onDuplicate, allowDuplicates))
  }
  return queue
}

async function importOne(file: File, record: BookRecord, onDuplicate: (d: Duplicate) => void, allowDuplicates: boolean) {
  const { id } = record
  try {
    const format = await sniff(file)
    if (!format) throw new ImportProblem(PROBLEMS.unsupported(extensionOf(file.name)))
    let data: ArrayBuffer
    try {
      data = await file.arrayBuffer()
    } catch {
      throw new ImportProblem(PROBLEMS.damaged())
    }
    if (!data.byteLength) throw new ImportProblem(PROBLEMS.empty())

    const hash = await fingerprint(data)
    if (!allowDuplicates) {
      const existing = await db.books.where('hash').equals(hash).first()
      if (existing && existing.id !== id) {
        await db.books.delete(id)
        onDuplicate({ file, existing })
        return
      }
    }
    await db.books.update(id, { hash, format })

    const read = async (): Promise<Imported & { scanned?: boolean }> => {
      if (format === 'epub') return (await import('./epub')).importEpub(data)
      if (format === 'docx') return (await import('./docx')).importDocx(data)
      if (format === 'txt') return (await import('./txt')).importTxt(data)
      return (await import('./pdf')).importPdf(data)
    }
    // a file that never finishes must not hold up the ones waiting behind it
    let timer = 0
    const imported = await Promise.race([read(), new Promise<never>((_, reject) => (timer = window.setTimeout(() => reject(new ImportProblem(PROBLEMS.tooSlow())), GIVE_UP_AFTER)))]).finally(() => clearTimeout(timer))
    const scanned = !!imported.scanned

    const content = normalizeContent(imported.content)
    const guess = fromFileName(file.name)
    const common = { title: imported.title || guess.title, author: imported.author || guess.author, cover: imported.cover }

    if (scanned) {
      await db.transaction('rw', db.books, db.files, async () => {
        await db.files.put({ bookId: id, file })
        await db.books.update(id, { ...common, status: 'pages-only', problem: PROBLEMS.scannedPdf(), pdfPage: 1 })
      })
      showToast({ message: `“${common.title}” is a scan, so there is no text to restyle. You can still read it page by page.` }, 9000)
      return
    }
    if (!content.chapters.length) throw new ImportProblem(PROBLEMS.empty())

    await db.transaction('rw', db.books, db.contents, async () => {
      await db.contents.put({ bookId: id, content })
      await db.books.update(id, { ...common, status: 'ready' })
    })
  } catch (e) {
    const problem = e instanceof ImportProblem ? e.problem : PROBLEMS.unknown()
    if (!(e instanceof ImportProblem)) console.error('Import failed', e)
    await db.books.update(id, { status: 'failed', problem })
  }
}
