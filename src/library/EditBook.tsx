import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { db } from '../db/schema'
import type { BookRecord } from '../db/schema'
import { Cover } from './Cover'

/** Change a book's title, author or cover. Saves when "Save" is pressed; Cancel leaves it untouched. */
export function EditBook({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [cover, setCover] = useState<Blob | null>(book.cover)
  const fileRef = useRef<HTMLInputElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstRef.current?.select()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  const save = async () => {
    await db.books.update(book.id, { title: title.trim() || book.title, author: author.trim(), cover })
    onClose()
  }
  const field = 'mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent'

  return (
    <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-label="Edit book details"
        className="w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl"
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        exit={{ y: 24 }}
        transition={{ duration: 0.18 }}
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2 className="font-display text-xl">Edit details</h2>
        <div className="mt-4 flex gap-4">
          <div className="w-28 shrink-0">
            <Cover title={title || 'Untitled'} author={author} image={cover} />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setCover(f)
                e.target.value = ''
              }}
            />
            <button type="button" className="mt-2 w-full rounded-md bg-ink/5 px-2 py-1.5 text-xs hover:bg-ink/10" onClick={() => fileRef.current?.click()}>
              Choose a picture
            </button>
            {cover && (
              <button type="button" className="mt-1 w-full rounded-md px-2 py-1 text-xs text-muted hover:text-ink" onClick={() => setCover(null)}>
                Use a drawn cover
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-xs text-muted">
              Title
              <input ref={firstRef} className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="mt-3 block text-xs text-muted">
              Author
              <input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Unknown author" />
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
            Save
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}
