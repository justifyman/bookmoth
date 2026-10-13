import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { db } from '../db/schema'
import type { BookRecord } from '../db/schema'
import { useTapZones } from './gestures'
import { useSize } from './usePagination'

// A simple viewer for PDFs that are pictures of pages (scans): one page at a time,
// exactly as it was scanned. Fonts, themes and the 3D book need real text, so they
// are not offered here.

export function PdfPages({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  const { ref: boxRef, size } = useSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  const [page, setPage] = useState(book.pdfPage ?? 1)
  const [drawn, setDrawn] = useState(0)
  const [why, setWhy] = useState(!!book.problem)
  const pages = doc?.numPages ?? 0

  useEffect(() => {
    let alive = true
    let opened: PDFDocumentProxy | null = null
    void (async () => {
      try {
        const file = (await db.files.get(book.id))?.file
        if (!file) throw new Error('missing file')
        const { openPdf } = await import('../import/pdf')
        opened = await openPdf(await file.arrayBuffer())
        if (alive) setDoc(opened)
        else void opened.loadingTask.destroy()
      } catch {
        if (alive) setFailed(true)
      }
    })()
    void db.books.update(book.id, { lastOpenedAt: Date.now() })
    return () => {
      alive = false
      void opened?.loadingTask.destroy()
    }
  }, [book.id])

  useEffect(() => {
    if (!doc || !size) return
    let alive = true
    let task: { cancel: () => void } | null = null
    void (async () => {
      const p = await doc.getPage(page)
      if (!alive) return
      const base = p.getViewport({ scale: 1 })
      // leave room for the bars at the top and bottom
      const fit = Math.min((size.width - 16) / base.width, (size.height - 132) / base.height)
      const viewport = p.getViewport({ scale: fit * Math.min(2, window.devicePixelRatio || 1) })
      // draw off screen first so the page on show never flashes empty
      const buffer = document.createElement('canvas')
      buffer.width = Math.round(viewport.width)
      buffer.height = Math.round(viewport.height)
      const render = p.render({ canvas: buffer, viewport })
      task = render
      try {
        await render.promise
      } catch {
        return
      }
      const canvas = canvasRef.current
      if (!alive || !canvas) return
      canvas.width = buffer.width
      canvas.height = buffer.height
      canvas.style.width = `${base.width * fit}px`
      canvas.style.height = `${base.height * fit}px`
      canvas.getContext('2d')!.drawImage(buffer, 0, 0)
      setDrawn(page)
    })()
    return () => {
      alive = false
      task?.cancel()
    }
  }, [doc, page, size])

  useEffect(() => {
    if (!pages) return
    const t = setTimeout(() => void db.books.update(book.id, { pdfPage: page, progress: pages > 1 ? (page - 1) / (pages - 1) : 1 }), 300)
    return () => clearTimeout(t)
  }, [book.id, page, pages])

  const go = (dir: number) => setPage((p) => Math.min(Math.max(1, pages || 1), Math.max(1, p + dir)))
  const [chrome, setChrome] = useState(true)
  const gestures = useTapZones(go, () => setChrome((c) => !c))
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
      else if (e.key === 'Escape') setChrome((c) => !c)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const dismissWhy = () => {
    setWhy(false)
    void db.books.update(book.id, { problem: undefined })
  }
  const bar = 'bg-stone-950/85 text-stone-100 backdrop-blur'
  const round = 'rounded-full px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-30'

  return (
    <div className="absolute inset-0 overflow-hidden bg-stone-800">
      <div ref={boxRef} className="absolute inset-0 flex touch-pan-y items-center justify-center select-none" {...gestures}>
        {failed ? (
          <div className="max-w-sm p-6 text-center text-stone-100">
            <h1 className="font-display text-2xl">These pages couldn’t be opened</h1>
            <p className="mt-2 text-stone-300">The saved copy of this file seems to be missing or damaged. Try removing the book and adding it again.</p>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} role="img" aria-label={`Page ${page} of ${pages || '…'}, shown as a picture`} className={`bg-white shadow-2xl transition-opacity duration-150 ${drawn ? 'opacity-100' : 'opacity-0'}`} />
            {!drawn && <div className="skeleton absolute aspect-[3/4] h-[80%] rounded-sm" role="status" aria-label="Opening the pages" />}
          </>
        )}
      </div>

      {chrome && (
        <>
          <header className={`absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2 py-2 ${bar}`}>
            <button type="button" className={`${round} shrink-0`} onClick={onClose}>
              ‹ Library
            </button>
            <p className="min-w-0 flex-1 truncate font-display text-[17px]">{book.title}</p>
            <button type="button" className={`${round} shrink-0`} aria-expanded={why} onClick={() => setWhy((w) => !w)}>
              Why page by page?
            </button>
          </header>
          <footer className={`absolute inset-x-0 bottom-0 z-20 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${bar}`}>
            <div className="mx-auto flex max-w-3xl items-center gap-1">
              <button type="button" aria-label="Previous page" className={`${round} text-lg`} disabled={page <= 1} onClick={() => go(-1)}>
                ‹
              </button>
              <input type="range" aria-label="Page" aria-valuetext={`Page ${page} of ${pages}`} min={1} max={Math.max(2, pages)} value={page} disabled={pages < 2} onChange={(e) => setPage(Number(e.target.value))} className="h-9 min-w-0 flex-1 accent-amber-200" />
              <button type="button" aria-label="Next page" className={`${round} text-lg`} disabled={!pages || page >= pages} onClick={() => go(1)}>
                ›
              </button>
              <span className="w-24 shrink-0 text-right text-[12px] text-stone-400 tabular-nums">{pages ? `Page ${page} of ${pages}` : ''}</span>
            </div>
          </footer>
        </>
      )}

      {why && (
        <div role="dialog" aria-label="About this book" className={`absolute inset-x-3 top-16 z-30 mx-auto max-w-md rounded-2xl p-5 shadow-2xl ${bar}`}>
          <h2 className="font-display text-xl">This PDF is made of pictures of pages</h2>
          <p className="mt-2 text-sm text-stone-300">It looks like a scan, so there is no text inside for Bookmoth to lay out afresh. That is why fonts, themes, the 3D book and the newspaper aren’t available for it.</p>
          <p className="mt-2 text-sm text-stone-300">You can still read it here page by page, just as it was scanned, and Bookmoth will remember your page.</p>
          <div className="mt-4 flex justify-end">
            <button type="button" className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-stone-900" onClick={dismissWhy}>
              Read page by page
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
