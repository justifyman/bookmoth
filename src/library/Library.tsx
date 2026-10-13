import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteBook, getSetting, setSetting } from '../db/schema'
import type { BookRecord } from '../db/schema'
import { ACCEPT, importFiles } from '../import'
import type { Duplicate } from '../import'
import { showToast } from '../ui/toasts'
import { BookCard } from './BookCard'
import { Cover } from './Cover'
import { EditBook } from './EditBook'

const SAMPLE = "Alice's Adventures in Wonderland by Lewis Carroll.txt"

type Sort = 'recent' | 'title' | 'author' | 'progress'
const SORTS: [Sort, string][] = [
  ['recent', 'Recent'],
  ['title', 'Title'],
  ['author', 'Author'],
  ['progress', 'Progress'],
]

function sortBooks(books: BookRecord[], sort: Sort) {
  const by = [...books]
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  if (sort === 'title') by.sort((a, b) => text(a.title, b.title))
  else if (sort === 'author') by.sort((a, b) => text(a.author || '￿', b.author || '￿') || text(a.title, b.title))
  else if (sort === 'progress') by.sort((a, b) => b.progress - a.progress)
  else by.sort((a, b) => Math.max(b.lastOpenedAt, b.addedAt) - Math.max(a.lastOpenedAt, a.addedAt))
  return by
}

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const books = useLiveQuery(() => db.books.toArray(), [])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState<BookRecord | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hint, setHint] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getSetting('sort', 'recent' as Sort).then(setSort)
    void getSetting('hint.library', false).then((seen) => setHint(!seen))
  }, [])

  const onDuplicate = useCallback(
    ({ file, existing }: Duplicate) => {
      showToast(
        {
          message: `“${existing.title}” is already in your library.`,
          action: { label: 'Open it', run: () => onOpen(existing.id) },
          secondary: { label: 'Add again', run: () => void importFiles([file], () => {}, true) },
        },
        9000,
      )
    },
    [onOpen],
  )

  const add = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = [...(list ?? [])]
      if (files.length) void importFiles(files, onDuplicate)
    },
    [onDuplicate],
  )

  // a public-domain book (from Project Gutenberg) for trying Lumen without a file of your own
  const [fetchingSample, setFetchingSample] = useState(false)
  const addSample = async () => {
    setFetchingSample(true)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${encodeURIComponent(SAMPLE)}`)
      if (!res.ok) throw new Error(String(res.status))
      add([new File([await res.blob()], SAMPLE, { type: 'text/plain' })])
    } catch {
      showToast({ message: 'The sample book couldn’t be fetched. Check your connection and try again.' })
    } finally {
      setFetchingSample(false)
    }
  }

  // drop a file anywhere on the screen
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      add(e.dataTransfer?.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [add])

  const remove = (book: BookRecord) => {
    if (book.status === 'failed') return void deleteBook(book.id)
    setHidden((h) => new Set(h).add(book.id))
    showToast({
      message: `Removed “${book.title}”.`,
      action: {
        label: 'Undo',
        run: () =>
          setHidden((h) => {
            const next = new Set(h)
            next.delete(book.id)
            return next
          }),
      },
      onExpire: () => void deleteBook(book.id),
    })
  }

  const visible = useMemo(() => (books ?? []).filter((b) => !hidden.has(b.id)), [books, hidden])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? visible.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q)) : visible
    return sortBooks(list, sort)
  }, [visible, query, sort])
  const continuing = useMemo(
    () =>
      visible
        .filter((b) => b.lastOpenedAt > 0 && b.progress < 0.99 && b.status !== 'failed' && b.status !== 'importing')
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, 1)[0],
    [visible],
  )
  const readable = visible.some((b) => b.status === 'ready' || b.status === 'pages-only')

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        add(e.target.files)
        e.target.value = ''
      }}
    />
  )
  const addButton = (big = false) => (
    <button type="button" onClick={() => inputRef.current?.click()} className={`shrink-0 rounded-full bg-accent font-medium text-accent-ink shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] ${big ? 'px-7 py-3 text-base' : 'px-4 py-2 text-sm'}`}>
      Add a book
    </button>
  )

  return (
    <div className="min-h-full">
      {picker}
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <h1 className="font-display text-2xl tracking-wide">Lumen</h1>
          <div className="flex-1" />
          {visible.length > 0 && (
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your books" aria-label="Search your books" className="hidden w-56 rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-accent sm:block" />
          )}
          {addButton()}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {books === undefined ? (
          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="skeleton aspect-[2/3] rounded-[3px]" />
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <section className="flex min-h-[70vh] flex-col items-center justify-center text-center">
            <div className="mb-8 w-28 -rotate-3 opacity-90">
              <Cover title="Your first book" author="" image={null} />
            </div>
            <h2 className="font-display text-3xl">Your library is empty</h2>
            <p className="mt-3 max-w-md text-muted">Lumen turns your own e-books into something that feels like a real book on a desk. Everything stays on this device.</p>
            <div className="mt-7">{addButton(true)}</div>
            <p className="mt-4 text-sm text-muted">or drop a file anywhere on this page · EPUB, PDF, Word or plain text</p>
            <button type="button" className="mt-6 text-sm text-accent underline-offset-4 hover:underline disabled:opacity-50" disabled={fetchingSample} onClick={() => void addSample()}>
              {fetchingSample ? 'Fetching the sample…' : 'No book to hand? Try Alice’s Adventures in Wonderland'}
            </button>
          </section>
        ) : (
          <>
            {continuing && !query && (
              <section aria-label="Continue reading" className="mt-6">
                <button type="button" onClick={() => onOpen(continuing.id)} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/60 sm:gap-6 sm:p-5">
                  <div className="w-16 shrink-0 sm:w-20">
                    <Cover title={continuing.title} author={continuing.author} image={continuing.cover} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs tracking-wide text-muted uppercase">Continue reading</p>
                    <p className="mt-1 truncate font-display text-2xl">{continuing.title}</p>
                    <p className="truncate text-sm text-muted">{continuing.author || 'Unknown author'}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1 max-w-xs flex-1 overflow-hidden rounded-full bg-ink/10">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(continuing.progress * 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums">{Math.round(continuing.progress * 100)}%</span>
                    </div>
                  </div>
                  <span aria-hidden="true" className="hidden rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink sm:block">
                    Resume
                  </span>
                </button>
              </section>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your books" aria-label="Search your books" className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-accent sm:hidden" />
              <h2 className="hidden text-sm text-muted sm:block">
                {visible.length} {visible.length === 1 ? 'book' : 'books'}
              </h2>
              <div className="flex-1 max-sm:hidden" />
              <label className="flex items-center gap-2 text-sm text-muted">
                Sort by
                <select
                  value={sort}
                  onChange={(e) => {
                    const s = e.target.value as Sort
                    setSort(s)
                    void setSetting('sort', s)
                  }}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                >
                  {SORTS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {hint && readable && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-accent/10 px-4 py-2.5 text-sm">
                <span>Tap a book to start reading. Lumen remembers your place.</span>
                <button
                  type="button"
                  className="shrink-0 font-medium text-accent"
                  onClick={() => {
                    setHint(false)
                    void setSetting('hint.library', true)
                  }}
                >
                  Got it
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="mt-16 text-center text-muted">
                No books match “{query}”.{' '}
                <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </p>
            ) : (
              <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {filtered.map((book) => (
                  <BookCard key={book.id} book={book} onOpen={() => onOpen(book.id)} onEdit={() => setEditing(book)} onRemove={() => remove(book)} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {dragging && (
          <motion.div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-bg/85 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <div className="rounded-3xl border-2 border-dashed border-accent px-12 py-10 text-center">
              <p className="font-display text-3xl">Drop to add to your library</p>
              <p className="mt-2 text-sm text-muted">EPUB, PDF, Word or plain text</p>
            </div>
          </motion.div>
        )}
        {editing && <EditBook key={editing.id} book={editing} onClose={() => setEditing(null)} />}
      </AnimatePresence>
    </div>
  )
}
