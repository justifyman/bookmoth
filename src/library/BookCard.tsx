import { useEffect, useRef, useState } from 'react'
import type { BookRecord } from '../db/schema'
import { Cover } from './Cover'

interface Props {
  book: BookRecord
  onOpen: () => void
  onEdit: () => void
  onRemove: () => void
}

function CardMenu({ title, onEdit, onRemove }: { title: string; onEdit: () => void; onRemove: () => void }) {
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
  const item = 'block w-full px-3 py-2 text-left text-sm hover:bg-ink/5'
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`More options for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-mr-1 rounded-md px-1.5 py-0.5 text-lg leading-none text-muted hover:bg-ink/5 hover:text-ink">
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-raised shadow-lg">
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

export function BookCard({ book, onOpen, onEdit, onRemove }: Props) {
  const [showWhy, setShowWhy] = useState(false)

  if (book.status === 'importing') {
    return (
      <li className="flex flex-col gap-2" aria-busy="true">
        <div className="skeleton aspect-[2/3] w-full rounded-[3px]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{book.title}</p>
          <p className="text-xs text-muted">Adding to your library…</p>
        </div>
      </li>
    )
  }

  if (book.status === 'failed') {
    const p = book.problem
    return (
      <li className="flex flex-col gap-2">
        <div className="flex aspect-[2/3] w-full flex-col justify-between rounded-[3px] border border-dashed border-line bg-surface p-3 text-sm">
          <div>
            <p className="font-medium">{p?.title ?? 'This book couldn’t be added'}</p>
            {showWhy && <p className="mt-2 text-xs text-muted">{p?.detail}</p>}
            {showWhy && p?.hint && <p className="mt-2 text-xs">{p.hint}</p>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {!showWhy && (
              <button type="button" className="rounded-md bg-ink/5 px-2 py-1 hover:bg-ink/10" onClick={() => setShowWhy(true)}>
                What can I do?
              </button>
            )}
            <button type="button" className="rounded-md bg-ink/5 px-2 py-1 hover:bg-ink/10" onClick={onRemove}>
              Dismiss
            </button>
          </div>
        </div>
        <p className="truncate text-xs text-muted" title={book.fileName}>
          {book.fileName}
        </p>
      </li>
    )
  }

  const percent = Math.round(book.progress * 100)
  const status = book.status === 'pages-only' ? 'Scanned pages' : book.lastOpenedAt === 0 ? 'Not started' : percent >= 99 ? 'Finished' : `${percent}% read`
  return (
    <li className="group flex flex-col gap-2">
      <button type="button" onClick={onOpen} className="block rounded-[3px] text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5" aria-label={`Read ${book.title}${book.author ? ` by ${book.author}` : ''}. ${status}.`}>
        <Cover title={book.title} author={book.author} image={book.cover} />
      </button>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={book.title}>
            {book.title}
          </p>
          <p className="truncate text-xs text-muted">{book.author || 'Unknown author'}</p>
        </div>
        <CardMenu title={book.title} onEdit={onEdit} onRemove={onRemove} />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Reading progress">
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 text-[11px] text-muted tabular-nums">{status}</span>
      </div>
    </li>
  )
}
