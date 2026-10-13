import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppearancePanel, Choices, MODES } from '../appearance/AppearancePanel'
import { DEFAULT_APPEARANCE } from '../appearance/settings'
import type { Appearance } from '../appearance/settings'
import { db, getSetting, setSetting } from '../db/schema'
import type { BookRecord } from '../db/schema'
import { blockText, compareAnchors, progressOf } from '../model/document'
import type { Anchor, BookContent } from '../model/document'
import { showToast } from '../ui/toasts'
import { Newspaper } from './Newspaper'
import { PdfPages } from './PdfPages'
import { PlainReader } from './PlainReader'
import type { Location, ModeHandle } from './modes'

// The reading screen: loads a book, shows it in the chosen mode, keeps the reader's
// place and this book's look saved, and brings the menus up when asked.

// the 3D scene is by far the heaviest part of Lumen, so it is fetched when first wanted
const BookReader = lazy(() => import('./BookReader').then((m) => ({ default: m.BookReader })))

const bar = 'bg-stone-950/85 text-stone-100 backdrop-blur'
const round = 'rounded-full px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-30'

function Loading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg" role="status" aria-label={label}>
      <div className="w-[min(34rem,84vw)]">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="skeleton mb-5 h-3 rounded" style={{ width: `${i % 4 === 3 ? 58 : 100}%` }} />
        ))}
      </div>
    </div>
  )
}

export function Reader({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [book, setBook] = useState<BookRecord | null | undefined>(undefined)
  const [content, setContent] = useState<BookContent | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [past, setPast] = useState<Appearance[]>([])
  const [anchor, setAnchor] = useState<Anchor>({ chapter: 0, block: 0, offset: 0 })
  const [location, setLocation] = useState<Location | null>(null)
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState(false)
  const [contents, setContents] = useState(false)
  const [hint, setHint] = useState(false)
  const mode = useRef<ModeHandle>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const b = await db.books.get(bookId)
      if (!alive) return
      if (!b || b.status === 'importing' || b.status === 'failed') return setBook(null)
      const last = await getSetting<Partial<Appearance>>('appearance.last', {})
      const c = b.status === 'ready' ? ((await db.contents.get(bookId))?.content ?? null) : null
      if (!alive) return
      if (b.status === 'ready' && !c) return setBook(null)
      // a book keeps its own look; a new one starts with the look used most recently
      setAppearance({ ...DEFAULT_APPEARANCE, ...(b.appearance ?? last) })
      setAnchor(b.anchor)
      setContent(c)
      setBook(b)
      void db.books.update(bookId, { lastOpenedAt: Date.now() })
      void getSetting('hint.reader', false).then((seen) => alive && setHint(!seen))
    })()
    return () => {
      alive = false
    }
  }, [bookId])

  // --- keeping the place -----------------------------------------------------

  const atEnd = !!location && location.pages > 1 && location.page >= location.pages - 1
  const progress = content ? (atEnd ? 1 : progressOf(content, anchor)) : 0
  const place = useRef<{ anchor: Anchor; progress: number } | null>(null)
  const savePlace = useCallback(() => {
    const p = place.current
    place.current = null
    if (p) void db.books.update(bookId, { anchor: p.anchor, progress: p.progress })
  }, [bookId])
  useEffect(() => {
    if (!content || !book) return
    if (compareAnchors(anchor, book.anchor) === 0 && progress === book.progress) return
    place.current = { anchor, progress }
    const t = setTimeout(savePlace, 400)
    return () => clearTimeout(t)
  }, [anchor, progress, content, book, savePlace])
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && savePlace()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', savePlace)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', savePlace)
      savePlace()
    }
  }, [savePlace])

  // --- the look --------------------------------------------------------------

  const lastChange = useRef({ keys: '', at: 0 })
  const persist = (next: Appearance) => {
    void db.books.update(bookId, { appearance: next })
    void setSetting('appearance.last', next)
  }
  const change = useCallback(
    (patch: Partial<Appearance>) => {
      setAppearance((current) => {
        const next = { ...current, ...patch }
        if ((Object.keys(patch) as (keyof Appearance)[]).every((k) => current[k] === next[k])) return current
        // dragging a slider is one step to undo, not fifty
        const keys = Object.keys(patch).join()
        const now = Date.now()
        const same = keys === lastChange.current.keys && now - lastChange.current.at < 900
        lastChange.current = { keys, at: now }
        if (!same) setPast((p) => [...p.slice(-30), current])
        persist(next)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookId],
  )
  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(past.slice(0, -1))
    lastChange.current = { keys: '', at: 0 }
    setAppearance(previous)
    persist(previous)
  }
  const isDefault = (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]).every((k) => k === 'mode' || appearance[k] === DEFAULT_APPEARANCE[k])

  // --- menus -----------------------------------------------------------------

  const toggleChrome = useCallback(() => {
    setChrome((c) => !c)
    setContents(false)
  }, [])
  // menus slip away after a few quiet seconds
  const [touched, setTouched] = useState(0)
  useEffect(() => {
    if (!chrome || panel || contents || !book || book.status !== 'ready') return
    const t = setTimeout(() => setChrome(false), touched ? 5000 : 3200)
    return () => clearTimeout(t)
  }, [chrome, panel, contents, touched, book])
  const touch = () => setTouched((n) => n + 1)

  const dismissHint = useCallback(() => {
    setHint((h) => {
      if (h) void setSetting('hint.reader', true)
      return false
    })
  }, [])

  const onAnchor = useCallback(
    (a: Anchor) => {
      setAnchor(a)
      dismissHint()
    },
    [dismissHint],
  )

  /** Moves somewhere far away, leaving a way back. */
  const jump = (to: Anchor | number, from = anchor) => {
    if (typeof to === 'number') mode.current?.goTo(to)
    else setAnchor(to)
    showToast({ message: 'Moved to a new place.', action: { label: 'Go back', run: () => setAnchor(from) } }, 7000)
  }
  const sliding = useRef<Anchor | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, select, textarea, [role="dialog"]') && e.key !== 'Escape') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !el.closest('button'))) {
        e.preventDefault()
        mode.current?.next()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        mode.current?.prev()
      } else if (e.key === 'Escape') {
        if (panel) setPanel(false)
        else if (contents) setContents(false)
        else setChrome((c) => !c)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [panel, contents])

  const sample = useMemo(() => {
    const blocks = content?.chapters[anchor.chapter]?.blocks ?? []
    let text = ''
    for (let b = anchor.block; b < blocks.length && text.length < 420; b++) text += `${blockText(blocks[b]).slice(b === anchor.block ? anchor.offset : 0)} `
    return text.slice(0, 420)
  }, [content, anchor])

  if (book === undefined) return <Loading label="Opening your book" />
  if (book === null) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <h1 className="font-display text-2xl">This book isn’t in your library any more</h1>
        <p className="max-w-sm text-muted">It may have been removed, or it didn’t finish being added.</p>
        <button type="button" className="rounded-full bg-accent px-5 py-2.5 font-medium text-accent-ink" onClick={onClose}>
          Back to your library
        </button>
      </div>
    )
  }
  if (book.status === 'pages-only') return <PdfPages book={book} onClose={onClose} />
  if (!content) return <Loading label="Opening your book" />

  const Mode = appearance.mode === 'book' ? BookReader : appearance.mode === 'newspaper' ? Newspaper : PlainReader
  const chapters = content.chapters
  const chapterTitle = chapters[anchor.chapter]?.title || (chapters.length > 1 ? `Part ${anchor.chapter + 1}` : '')
  const unit = location?.unit ?? 'Page'
  const shown = chrome || panel

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <Suspense fallback={<Loading label="Getting the book ready" />}>
        <Mode ref={mode} content={content} title={book.title} author={book.author} appearance={appearance} anchor={anchor} onAnchor={onAnchor} onToggleChrome={toggleChrome} onLocation={setLocation} onAppearance={change} />
      </Suspense>

      {/* keyboard and screen-reader users can always reach the menus */}
      {!shown && (
        <button type="button" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-40 focus:rounded-full focus:bg-stone-950 focus:px-4 focus:py-2 focus:text-sm focus:text-stone-100" onClick={() => setChrome(true)}>
          Show menus
        </button>
      )}

      <AnimatePresence>
        {shown && (
          <motion.header key="top" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.16 }} className={`absolute inset-x-0 top-0 z-20 flex items-center gap-1 px-2 py-2 sm:px-3 ${bar}`} onPointerDown={touch} onKeyDown={touch}>
            <button
              type="button"
              className={`${round} shrink-0`}
              onClick={() => {
                savePlace()
                onClose()
              }}
            >
              ‹ Library
            </button>
            <div className="min-w-0 flex-1 px-1 max-sm:hidden">
              <p className="truncate font-display text-[17px] leading-tight">{book.title}</p>
              {book.author && <p className="truncate text-[11px] text-stone-400">{book.author}</p>}
            </div>
            <div className="flex-1 sm:hidden" />
            <div className="w-[min(17.5rem,56vw)] shrink-0">
              <Choices label="Reading mode" value={appearance.mode} options={MODES} onChange={(m) => change({ mode: m })} />
            </div>
            <button type="button" aria-expanded={panel} className={`${round} shrink-0 ${panel ? 'bg-white/15' : ''}`} onClick={() => (setPanel((p) => !p), setContents(false))}>
              <span aria-hidden="true" className="font-display text-base">
                Aa
              </span>
              <span className="max-md:sr-only"> Appearance</span>
            </button>
          </motion.header>
        )}

        {chrome && !panel && (
          <motion.footer key="bottom" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.16 }} className={`absolute inset-x-0 bottom-0 z-20 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 ${bar}`} onPointerDown={touch} onKeyDown={touch}>
            <div className="mx-auto flex max-w-3xl items-center gap-1">
              <button type="button" aria-label={`Previous ${unit.toLowerCase()}`} className={`${round} text-lg`} disabled={!location || location.page <= 0} onClick={() => mode.current?.prev()}>
                ‹
              </button>
              <input
                type="range"
                aria-label="Place in the book"
                aria-valuetext={location ? `${unit} ${location.page + 1} of ${location.pages}` : undefined}
                min={0}
                max={Math.max(1, (location?.pages ?? 1) - 1)}
                value={location?.page ?? 0}
                disabled={!location || location.pages < 2}
                onPointerDown={() => (sliding.current = anchor)}
                onKeyDown={() => (sliding.current ??= anchor)}
                onChange={(e) => mode.current?.goTo(Number(e.target.value))}
                onPointerUp={() => {
                  const from = sliding.current
                  sliding.current = null
                  if (from && compareAnchors(from, anchor) !== 0) showToast({ message: 'Moved to a new place.', action: { label: 'Go back', run: () => setAnchor(from) } }, 7000)
                }}
                className="h-9 min-w-0 flex-1 accent-amber-200"
              />
              <button type="button" aria-label={`Next ${unit.toLowerCase()}`} className={`${round} text-lg`} disabled={!location || location.page >= location.pages - 1} onClick={() => mode.current?.next()}>
                ›
              </button>
            </div>
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-2 pb-1 text-[12px] text-stone-400">
              {chapters.length > 1 ? (
                <button type="button" aria-expanded={contents} className="min-w-0 truncate rounded-full px-2 py-1 text-stone-200 hover:bg-white/10" onClick={() => setContents((c) => !c)}>
                  ☰ {chapterTitle || 'Contents'}
                </button>
              ) : (
                <span className="min-w-0 truncate px-2">{chapterTitle}</span>
              )}
              <span className="flex-1" />
              <span className="shrink-0 tabular-nums" aria-live="polite">
                {location ? `${unit} ${location.page + 1} of ${location.pages}` : 'Counting pages…'} · {Math.round(progress * 100)}%
              </span>
            </div>
          </motion.footer>
        )}

        {contents && chrome && !panel && (
          <motion.nav key="contents" aria-label="Contents" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.14 }} className={`absolute bottom-24 left-2 z-30 max-h-[60%] w-[min(22rem,calc(100%-1rem))] overflow-y-auto rounded-2xl p-2 shadow-2xl sm:left-[max(1rem,calc(50%-24rem))] ${bar}`}>
            <ol>
              {chapters.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-current={i === anchor.chapter ? 'true' : undefined}
                    className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 ${i === anchor.chapter ? 'bg-white/10 text-amber-100' : ''}`}
                    onClick={() => {
                      setContents(false)
                      if (i !== anchor.chapter) jump({ chapter: i, block: 0, offset: 0 })
                    }}
                  >
                    {c.title || `Part ${i + 1}`}
                  </button>
                </li>
              ))}
            </ol>
          </motion.nav>
        )}

        {panel && <AppearancePanel key="panel" appearance={appearance} sample={sample} textPx={location?.textPx ?? 0} canUndo={past.length > 0} isDefault={isDefault} onChange={change} onUndo={undo} onReset={() => change({ ...DEFAULT_APPEARANCE, mode: appearance.mode })} onClose={() => setPanel(false)} />}

        {hint && !panel && (
          <motion.div key="hint" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.6, duration: 0.2 }} className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-4">
            <div className={`pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-5 text-sm shadow-xl ${bar}`}>
              <span>Tap or swipe the edges to turn pages. Tap the middle for menus.</span>
              <button type="button" className="shrink-0 rounded-full bg-amber-100 px-3 py-1 font-medium text-stone-900" onClick={dismissHint}>
                Got it
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
