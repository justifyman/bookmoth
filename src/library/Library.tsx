import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteBook, getSetting, setSetting } from '../db/schema'
import type { BookRecord } from '../db/schema'
import { ACCEPT, importFiles } from '../import'
import type { Duplicate } from '../import'
import { Moth } from '../ui/Moth'
import { useSize } from '../reader/usePagination'
import { showToast } from '../ui/toasts'
import { ShelfBook, ShelfLabel, ShelfNote } from './ShelfBook'
import { EditBook } from './EditBook'

// dust in the light: a handful of specks, each with its own place and pace
const MOTES = Array.from({ length: 10 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1 + 1) % 1
  return { left: `${4 + r(1) * 92}%`, '--size': `${2 + r(2) * 3}px`, '--time': `${22 + r(3) * 26}s`, '--wait': `${-r(4) * 40}s`, '--sway': `${(r(5) - 0.5) * 18}vw`, '--glint': `${0.08 + r(6) * 0.2}` } as React.CSSProperties
})

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

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
  const { ref: caseRef, size: caseSize } = useSize<HTMLDivElement>()

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

  // a public-domain book (from Project Gutenberg) for trying Bookmoth without a file of your own
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
  const inProgress = visible.filter((b) => b.lastOpenedAt > 0 && b.progress > 0 && b.progress < 0.99).length
  const finished = visible.filter((b) => b.progress >= 0.99).length
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
      {/* the header is tight on a phone, so its button says less there */}
      Add{big ? ' a book' : <span className="max-[430px]:sr-only"> a book</span>}
    </button>
  )

  // how many books stand side by side depends on how wide the bookcase is
  const inner = (caseSize?.width ?? 1000) - 28
  const bookWidth = inner < 420 ? 92 : inner < 760 ? 120 : 150
  const columns = Math.max(2, Math.floor(inner / (bookWidth * 1.36)))
  const shelves: BookRecord[][] = []
  for (let i = 0; i < filtered.length; i += columns) shelves.push(filtered.slice(i, i + columns))
  // a bookcase has shelves whether or not there are books for them yet
  while (shelves.length < 2) shelves.push([])
  const grid = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }

  return (
    <div className="flex min-h-full flex-col">
      <div className="wall" aria-hidden="true">
        {MOTES.map((style, i) => (
          <span key={i} className="mote" style={style} />
        ))}
      </div>
      {picker}
      <header className="glass sticky top-0 z-20 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <h1 className="flex items-center gap-2 font-display text-2xl tracking-wide">
            <Moth className="h-6 w-7 text-accent" />
            <span className="max-[430px]:sr-only">Bookmoth</span>
          </h1>
          <div className="flex-1" />
          {visible.length > 0 && (
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your books" aria-label="Search your books" className="hidden w-52 rounded-full border border-ink/20 bg-black/10 px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-accent md:block" />
          )}
          {addButton()}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        {books !== undefined && visible.length === 0 && (
          <section className="rise mt-8 flex flex-col items-center text-center">
            <div className="glass flex flex-col items-center rounded-[2rem] px-6 py-8 sm:px-14 sm:py-10">
              <div className="bob mb-4">
                <Moth className="h-14 w-16 text-accent" />
              </div>
              <h2 className="font-display text-3xl">Your shelves are waiting</h2>
              <p className="mt-3 max-w-md text-muted">Bookmoth turns your own e-books into something that feels like a real book on a desk. Everything stays on this device.</p>
              <div className="mt-6">{addButton(true)}</div>
              <p className="mt-4 text-sm text-muted">or drop a file anywhere on this page · EPUB, PDF, Word or plain text</p>
              <button type="button" className="mt-5 text-sm text-accent underline-offset-4 hover:underline disabled:opacity-50" disabled={fetchingSample} onClick={() => void addSample()}>
                {fetchingSample ? 'Fetching the sample…' : 'No book to hand? Try Alice’s Adventures in Wonderland'}
              </button>
            </div>
          </section>
        )}

        {visible.length > 0 && !query && (
          <div className="rise mt-7 sm:mt-9">
            <p className="font-display text-3xl [text-shadow:0_1px_2px_rgb(0_0_0/0.25)] sm:text-4xl">{greeting()}</p>
            <p className="mt-1 text-sm text-muted">
              {visible.length} {visible.length === 1 ? 'book' : 'books'} on your shelves
              {inProgress > 0 && ` · ${inProgress} in progress`}
              {finished > 0 && ` · ${finished} finished`}
            </p>
          </div>
        )}

        {/* the book being read stands on its own little shelf on the wall */}
        {continuing && !query && (
          <section aria-label="Continue reading" className="rise mt-6 flex items-end gap-5 sm:gap-9" style={{ animationDelay: '80ms' }}>
            <div className="shrink-0" style={{ width: bookWidth * 1.5 }}>
              <div className="sbook-slot relative z-10 flex justify-center">
                <ShelfBook book={continuing} width={bookWidth} onOpen={() => onOpen(continuing.id)} />
              </div>
              <div className="wood ledge" />
            </div>
            <div className="min-w-0 flex-1 pb-5">
              <p className="text-[11px] tracking-[0.16em] text-accent uppercase">Continue reading</p>
              <p className="mt-1 truncate font-display text-2xl sm:text-3xl">{continuing.title}</p>
              <p className="truncate text-sm text-muted">{continuing.author || 'Unknown author'}</p>
              {continuing.excerpt && (
                <p className="mt-3 line-clamp-2 max-w-2xl font-display text-[17px] leading-snug text-ink/85 italic max-sm:hidden">“…{continuing.excerpt.replace(/^[“"‘']+/, '')}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => onOpen(continuing.id)} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink shadow-md transition-transform hover:translate-x-0.5">
                  Resume →
                </button>
                <span className="text-xs text-muted tabular-nums">{Math.round(continuing.progress * 100)}% read</span>
              </div>
            </div>
          </section>
        )}

        {visible.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your books" aria-label="Search your books" className="glass min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-accent md:hidden" />
            <h2 className="hidden font-display text-xl md:block">Your shelves</h2>
            <div className="flex-1 max-md:hidden" />
            <label className="flex items-center gap-2 text-sm text-muted">
              Sort by
              <select
                value={sort}
                onChange={(e) => {
                  const s = e.target.value as Sort
                  setSort(s)
                  void setSetting('sort', s)
                }}
                className="glass rounded-lg px-2 py-1.5 text-sm text-ink"
              >
                {SORTS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {hint && readable && (
          <div className="glass mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm">
            <span>Point at a book to peek inside. Tap it to start reading; Bookmoth remembers your place.</span>
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

        {query && filtered.length === 0 && (
          <p className="mt-8 text-center text-muted">
            No books match “{query}”.{' '}
            <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => setQuery('')}>
              Clear search
            </button>
          </p>
        )}

        <div className="bookcase mt-7" aria-busy={books === undefined}>
          <div className="wood bookcase-crown" />
          <div className="bookcase-body">
            <div className="wood bookcase-post" />
            <div ref={caseRef} className="bookcase-shelves">
              {shelves.map((row, n) => (
                <div key={n} className="shelf">
                  <div className="wood shelf-back" />
                  <ul className="shelf-row" style={{ ...grid, minHeight: bookWidth * 1.5 }} aria-label={`Shelf ${n + 1}`}>
                    {row.map((book, i) => (
                      <li key={book.id} className="sbook-slot rise relative" style={{ animationDelay: `${Math.min(n * columns + i, 14) * 45 + 120}ms` }}>
                        {book.status === 'failed' ? <ShelfNote book={book} width={bookWidth} onDismiss={() => remove(book)} /> : <ShelfBook book={book} width={bookWidth} onOpen={() => onOpen(book.id)} />}
                      </li>
                    ))}
                  </ul>
                  <div className="shelf-edge">
                    <div className="wood shelf-board" />
                    <div className="shelf-labels" style={grid}>
                      {row.map((book) => (
                        <ShelfLabel key={book.id} book={book} onEdit={() => setEditing(book)} onRemove={() => remove(book)} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="wood bookcase-post" />
          </div>
          <div className="wood bookcase-plinth" />
        </div>
      </main>
      <div className="wood floor" aria-hidden="true" />
      <footer className="bg-[#2b2118] text-[#d9cdb8]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-sm sm:px-6">
          <span className="flex items-center gap-2 font-display text-base">
            <Moth className="h-4 w-5" />
            Bookmoth
          </span>
          <span className="flex-1 text-xs opacity-70 max-sm:basis-full">Your books stay on this device.</span>
          <a href="https://github.com/justifyman/bookmoth" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M8 0a8 8 0 0 0-2.530 15.590c.400.070.550-.170.550-.380l-.010-1.490c-2.010.370-2.530-.490-2.690-.940-.090-.230-.480-.940-.820-1.130-.280-.150-.680-.520-.010-.530.630-.010 1.080.580 1.230.820.720 1.210 1.870.870 2.330.660.070-.520.280-.870.510-1.070-1.780-.200-3.640-.890-3.640-3.950 0-.870.310-1.590.820-2.150-.080-.200-.360-1.020.080-2.120 0 0 .670-.210 2.200.820a7.420 7.420 0 0 1 4 0c1.530-1.040 2.200-.820 2.200-.820.440 1.100.160 1.920.080 2.120.510.560.820 1.270.820 2.150 0 3.070-1.870 3.750-3.650 3.950.290.250.540.730.540 1.480l-.010 2.200c0 .210.150.460.550.380A8 8 0 0 0 8 0z" />
            </svg>
            GitHub
          </a>
          <a href="https://discord.com/users/644217281609596938" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M20.300 4.400A19.800 19.800 0 0 0 15.400 2.900l-.230.450c1.760.430 2.570 1.040 3.420 1.730a13.600 13.600 0 0 0-13.180 0c.850-.690 1.820-1.320 3.420-1.730L8.600 2.900a19.800 19.800 0 0 0-4.900 1.500C.600 9.100-.250 13.650.170 18.140a19.900 19.900 0 0 0 6.070 3.060l1.230-2a12.900 12.900 0 0 1-2.030-.980l.500-.390a14.200 14.200 0 0 0 12.120 0l.500.390c-.650.380-1.330.710-2.040.980l1.230 2a19.900 19.900 0 0 0 6.080-3.060c.500-5.200-.850-9.710-3.530-13.740zM8.020 15.330c-1.180 0-2.150-1.090-2.150-2.420s.950-2.420 2.150-2.420 2.170 1.090 2.150 2.420c0 1.330-.950 2.420-2.150 2.420zm7.960 0c-1.180 0-2.150-1.090-2.150-2.420s.950-2.420 2.150-2.420 2.170 1.090 2.150 2.420c0 1.330-.940 2.420-2.150 2.420z" />
            </svg>
            Discord
          </a>
        </div>
      </footer>

      <AnimatePresence>
        {dragging && (
          <motion.div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/50 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <div className="glass rounded-3xl border-2 border-dashed !border-accent px-12 py-10 text-center">
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
