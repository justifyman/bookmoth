import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Anchor, BookContent, Opening } from '../model/document'
import type { Appearance } from '../appearance/settings'

// Everything Bookmoth remembers lives in the browser's IndexedDB on this device.

export type BookFormat = 'epub' | 'pdf' | 'txt' | 'docx'

/**
 * importing: still being read. ready: readable in every mode.
 * pages-only: a PDF with no usable text, shown page by page as pictures.
 * failed: could not be read; `problem` says why in plain words.
 */
export type BookStatus = 'importing' | 'ready' | 'pages-only' | 'failed'

export interface Problem {
  title: string
  detail: string
  /** what the reader can try next */
  hint?: string
}

export interface BookRecord {
  id: string
  title: string
  author: string
  format: BookFormat
  fileName: string
  /** fingerprint of the file's bytes, for spotting duplicates */
  hash: string
  size: number
  cover: Blob | null
  status: BookStatus
  problem?: Problem
  addedAt: number
  lastOpenedAt: number
  /** 0..1 through the book */
  progress: number
  anchor: Anchor
  /** page number for pages-only PDFs */
  pdfPage?: number
  /** this book's own look; missing until the reader changes something */
  appearance?: Appearance
  /** the book's first page, shown when the book is opened on the shelf */
  opening?: Opening
  /** a few lines from where the reader stopped, shown on the library's "continue reading" card */
  excerpt?: string
  /** the reader picked a reading mode for this book themselves */
  modeChosen?: boolean
}

export interface ContentRecord {
  bookId: string
  content: BookContent
}

export interface FileRecord {
  bookId: string
  file: Blob
}

export interface SettingRecord {
  key: string
  value: unknown
}

// the database keeps the app's working name from before it was called Bookmoth, so existing libraries carry over
export const db = new Dexie('lumen') as Dexie & {
  books: EntityTable<BookRecord, 'id'>
  contents: EntityTable<ContentRecord, 'bookId'>
  files: EntityTable<FileRecord, 'bookId'>
  settings: EntityTable<SettingRecord, 'key'>
}

db.version(1).stores({
  books: 'id, hash, lastOpenedAt, addedAt, title, author',
  contents: 'bookId',
  files: 'bookId',
  settings: 'key',
})

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value })
}

export async function deleteBook(id: string) {
  await db.transaction('rw', db.books, db.contents, db.files, async () => {
    await db.books.delete(id)
    await db.contents.delete(id)
    await db.files.delete(id)
  })
}
