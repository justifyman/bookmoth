import { useEffect, useRef, useState } from 'react'
import { DEFAULT_APPEARANCE, FONTS } from '../appearance/settings'
import { PAPER } from '../book3d/paper'
import { db } from '../db/schema'
import type { BookRecord } from '../db/schema'
import { openingOf } from '../model/document'
import { Cover, useBlobUrl } from './Cover'

// A book standing on the shelf, and the label on the shelf edge beneath it. The book
// is a small 3D object built in CSS (see .sbook in index.css): pointing at it turns
// it to face you and swings the cover open on its first page.

const statusOf = (book: BookRecord) => {
  const percent = Math.round(book.progress * 100)
  return book.status === 'pages-only' ? 'Scanned pages' : book.lastOpenedAt === 0 ? 'Not started' : percent >= 99 ? 'Finished' : `${percent}% read`
}

// books added before first pages were recorded get theirs the first time they are pointed at
const asked = new Set<string>()
function ensureOpening(book: BookRecord) {
  if (book.opening || book.status !== 'ready' || asked.has(book.id)) return
  asked.add(book.id)
  void db.contents.get(book.id).then((row) => row && db.books.update(book.id, { opening: openingOf(row.content) }))
}

function FirstPage({ book }: { book: BookRecord }) {
  const paper = PAPER[book.appearance?.paper ?? DEFAULT_APPEARANCE.paper] ?? PAPER.modern
  const font = FONTS[book.appearance?.font ?? DEFAULT_APPEARANCE.font] ?? FONTS.literata
  const scan = useBlobUrl(book.status === 'pages-only' ? book.cover : null)
  const style = { background: paper.base, color: paper.ink, fontFamily: `"${font.family}", Georgia, serif` }
  if (scan) return <img src={scan} alt="" className="sbook-page !p-0 object-cover" draggable={false} />
  const opening = book.opening
  if (!opening || (!opening.heading && !opening.paragraphs.length)) {
    return (
      <div className="sbook-page flex flex-col items-center justify-center text-center" style={style}>
        <p className="text-[1.6em] leading-tight">{book.title}</p>
        {book.author && <p className="mt-[1.2em] tracking-[0.12em] uppercase opacity-80">{book.author}</p>}
      </div>
    )
  }
  return (
    <div className="sbook-page" style={style}>
      {opening.heading && <p className="mb-[0.9em] line-clamp-3 text-center text-[1.3em] leading-tight">{opening.heading}</p>}
      {opening.paragraphs.map((text, i) => (
        <p key={i} className="[overflow-wrap:anywhere]" style={{ textAlign: 'justify', textIndent: i ? '1.3em' : 0 }}>
          {text}
        </p>
      ))}
    </div>
  )
}

export function ShelfBook({ book, width, onOpen }: { book: BookRecord; width: number; onOpen: () => void }) {
  const size = { '--bw': `${width}px`, '--depth': `${Math.round(width * 0.17)}px` } as React.CSSProperties

  if (book.status === 'importing') {
    return (
      <div className="sbook" style={size} aria-busy="true" aria-label={`Adding ${book.title}`}>
        <div className="sbook-body">
          <div className="sbook-back" />
          <div className="sbook-edge" />
          <div className="sbook-cover">
            <div className="skeleton rounded-[2px] bg-[#6d6252]" />
          </div>
        </div>
      </div>
    )
  }

  const started = book.lastOpenedAt > 0 && book.progress > 0 && book.progress < 0.99
  return (
    <button type="button" className="sbook" style={size} onClick={onOpen} onPointerEnter={() => ensureOpening(book)} onFocus={() => ensureOpening(book)} aria-label={`Read ${book.title}${book.author ? ` by ${book.author}` : ''}. ${statusOf(book)}.`}>
      <div className="sbook-body">
        <div className="sbook-back" />
        <div className="sbook-edge" />
        <FirstPage book={book} />
        <div className="sbook-cover">
          <Cover title={book.title} author={book.author} image={book.cover} />
          <div className="sbook-inside" />
        </div>
        {started && <span className="ribbon" aria-hidden="true" />}
      </div>
    </button>
  )
}

/** A slip of paper standing where a book could not be added, saying why in plain words. */
export function ShelfNote({ book, width, onDismiss }: { book: BookRecord; width: number; onDismiss: () => void }) {
  const [why, setWhy] = useState(false)
  const p = book.problem
  return (
    <div className="relative flex -rotate-2 flex-col justify-between rounded-[2px] bg-[#f4ecd8] p-2.5 text-[#2a241c] shadow-[0_6px_14px_rgba(0,0,0,.45)]" style={{ width, minHeight: width * 1.25, fontSize: Math.max(10.5, width * 0.078) }}>
      <div>
        <p className="leading-snug font-semibold">{p?.title ?? 'This book couldn’t be added'}</p>
        {why && <p className="mt-1.5 leading-snug opacity-80">{p?.detail}</p>}
        {why && p?.hint && <p className="mt-1.5 leading-snug">{p.hint}</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {!why && (
          <button type="button" className="rounded bg-black/10 px-1.5 py-0.5 hover:bg-black/20" onClick={() => setWhy(true)}>
            What can I do?
          </button>
        )}
        <button type="button" className="rounded bg-black/10 px-1.5 py-0.5 hover:bg-black/20" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

function LabelMenu({ title, onEdit, onRemove }: { title: string; onEdit: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const item = 'block w-full px-3 py-2 text-left text-sm hover:bg-ink/10'
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label={`More options for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-md px-1 text-base leading-none opacity-60 hover:bg-black/20 hover:opacity-100">
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full z-30 mb-1 w-36 overflow-hidden rounded-lg border border-line bg-raised text-ink shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), onEdit())}>
            Edit details
          </button>
          <button type="button" role="menuitem" className={`${item} text-danger`} onClick={() => (setOpen(false), onRemove())}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

/** The label on the front edge of the shelf under a book: title, how far along, and its menu. */
export function ShelfLabel({ book, onEdit, onRemove }: { book: BookRecord; onEdit: () => void; onRemove: () => void }) {
  if (book.status === 'failed') {
    return (
      <p className="truncate px-1 text-center text-[10.5px] opacity-70" title={book.fileName}>
        {book.fileName}
      </p>
    )
  }
  const importing = book.status === 'importing'
  const percent = Math.round(book.progress * 100)
  return (
    <div className="flex min-w-0 items-center gap-0.5 px-1.5">
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate font-display text-[13.5px] leading-tight" title={book.title}>
          {book.title}
        </p>
        <p className="truncate text-[10px] leading-tight opacity-75">{importing ? 'Adding to your shelf…' : `${book.author || 'Unknown author'} · ${statusOf(book)}`}</p>
        {!importing && (
          <div className="mx-auto mt-1 h-[2px] w-3/5 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Reading progress">
            <div className="h-full bg-current" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      {!importing && <LabelMenu title={book.title} onEdit={onEdit} onRemove={onRemove} />}
    </div>
  )
}
