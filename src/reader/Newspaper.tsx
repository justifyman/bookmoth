import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { legibleInk } from '../appearance/contrast'
import { FONTS } from '../appearance/settings'
import { anchorOfPage, pageOfAnchor } from '../pagination/paginate'
import type { Pagination } from '../pagination/paginate'
import type { PageGeometry, TypeSettings } from '../pagination/types'
import { useTapZones } from './gestures'
import { PageView } from './PageView'
import type { ModeHandle, ModeProps } from './modes'
import { usePagination, useSize } from './usePagination'

// The book as a newspaper. Each column is one "page" from the shared pagination
// engine; a screenful of columns is a section, and every chapter opens a new one
// under the masthead with its title as the headline.

const PAPER = '#e9e3d4'
const INK = legibleInk('#1d1b18', PAPER)
const GAP = 26

/** A small repeating picture made once in the browser: paper grain, or patches where the ink took less well. */
function noiseUrl(kind: 'grain' | 'ink') {
  const size = kind === 'grain' ? 160 : 320
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  if (kind === 'grain') {
    const img = ctx.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random()
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 60
      img.data[i + 3] = Math.random() * 14
    }
    ctx.putImageData(img, 0, 0)
  } else {
    // soft paper-coloured blotches laid over the text: where they fall the ink looks thinner
    const cells = 20
    const small = document.createElement('canvas')
    small.width = small.height = cells
    const sctx = small.getContext('2d')!
    const img = sctx.createImageData(cells, cells)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 0xe9
      img.data[i + 1] = 0xe3
      img.data[i + 2] = 0xd4
      img.data[i + 3] = Math.random() ** 2 * 62
    }
    sctx.putImageData(img, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    // drawn four times with wrap-around so the tile repeats without seams
    for (const [dx, dy] of [[0, 0], [-size, 0], [0, -size], [-size, -size]]) ctx.drawImage(small, dx + size / 2, dy + size / 2, size, size)
  }
  return `url(${c.toDataURL()})`
}
let textures: { grain: string; ink: string } | null = null

interface Frame {
  padX: number
  padY: number
  inner: number
  columns: number
  column: number
  masthead: number
  headlineSize: number
  headline: number
  running: number
  footer: number
  tall: number
  short: number
}
type NewsGeometry = PageGeometry & { frame: Frame }

interface Section {
  chapter: number
  /** index of the first column's page */
  first: number
  count: number
  opening: boolean
}

function sectionsOf(p: Pagination, columns: number) {
  const sections: Section[] = []
  const sectionOfPage: number[] = []
  p.chapterFirstPage.forEach((start, chapter) => {
    const end = p.chapterFirstPage[chapter + 1] ?? p.pages.length
    for (let first = start; first < end; first += columns) {
      const count = Math.min(columns, end - first)
      for (let k = 0; k < count; k++) sectionOfPage.push(sections.length)
      sections.push({ chapter, first, count, opening: first === start })
    }
  })
  return { sections, sectionOfPage }
}

export const Newspaper = forwardRef<ModeHandle, ModeProps>(function Newspaper({ content, title, author, appearance, anchor, onAnchor, onToggleChrome, onLocation }, ref) {
  const { ref: boxRef, size } = useSize<HTMLDivElement>()
  const reduce = useReducedMotion()
  const font = FONTS[appearance.font]
  textures ??= { grain: noiseUrl('grain'), ink: noiseUrl('ink') }

  const type: TypeSettings = useMemo(
    () => ({ fontFamily: font.family, fontSize: Math.max(11, appearance.fontSize * font.scale * 0.8), lineHeight: Math.max(1.2, appearance.lineSpacing * 0.88), justify: true }),
    [font, appearance.fontSize, appearance.lineSpacing],
  )

  const frame: Frame | null = useMemo(() => {
    if (!size) return null
    const narrow = size.width < 560
    const padX = narrow ? 16 : Math.min(56, size.width * 0.04)
    const padY = narrow ? 14 : 24
    const inner = Math.min(1500, size.width - padX * 2)
    // never squeeze a column below a readable measure
    const columns = Math.max(1, Math.min(appearance.columns, Math.floor((inner + GAP) / (type.fontSize * 11 + GAP))))
    const column = (inner - GAP * (columns - 1)) / columns
    const masthead = narrow ? 86 : 124
    const headlineSize = narrow ? 25 : Math.min(44, 26 + inner / 60)
    const headline = Math.round(headlineSize * 1.12 * 2 + 46)
    const running = 34
    const footer = 26
    const body = size.height - padY * 2 - footer
    const line = type.fontSize * type.lineHeight
    const tall = Math.max(line * 4, body - running)
    const short = Math.max(line * 3, body - masthead - headline)
    return { padX, padY, inner, columns, column, masthead, headlineSize, headline, running, footer, tall, short }
  }, [size, appearance.columns, type])

  // the frame travels with the geometry, so a layout is always drawn in the frame it was made for
  const geometry: NewsGeometry | null = useMemo(
    () => (frame ? { width: frame.column, height: frame.tall, heightFor: (i) => (i < frame.columns ? frame.short : frame.tall), chapterDrop: 0, omitChapterHeading: true, frame } : null),
    [frame],
  )
  const pagination = usePagination(content, type, geometry, frame ? `news|${frame.columns}|${Math.round(frame.short)}` : '')
  const f = (pagination?.geometry as NewsGeometry | undefined)?.frame

  const { sections, sectionOfPage } = useMemo(() => (pagination && f ? sectionsOf(pagination, f.columns) : { sections: [], sectionOfPage: [] }), [pagination, f])
  const current = pagination ? (sectionOfPage[pageOfAnchor(pagination, anchor)] ?? 0) : 0
  const section = sections[current]

  const direction = useRef(1)
  const go = (dir: 1 | -1) => {
    const next = sections[current + dir]
    if (!pagination || !next) return
    direction.current = dir
    onAnchor(anchorOfPage(pagination, next.first))
  }
  const jump = (n: number) => pagination && sections[n] && onAnchor(anchorOfPage(pagination, sections[n].first))
  const goRef = useRef(go)
  const jumpRef = useRef(jump)
  useEffect(() => {
    goRef.current = go
    jumpRef.current = jump
  })
  useImperativeHandle(ref, () => ({ next: () => goRef.current(1), prev: () => goRef.current(-1), goTo: (n) => jumpRef.current(n) }), [])
  const gestures = useTapZones(go, onToggleChrome)

  useEffect(() => {
    if (pagination && sections.length) onLocation({ page: current, pages: sections.length, textPx: pagination.type.fontSize, unit: 'Section' })
  }, [pagination, current, sections.length, onLocation])

  const chapter = section ? content.chapters[section.chapter] : null
  const headline = chapter?.title || (content.chapters.length > 1 && section ? `Part ${section.chapter + 1}` : title)
  const today = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), [])
  const display = '"EB Garamond", Georgia, serif'

  return (
    <div ref={boxRef} className="absolute inset-0 touch-pan-y overflow-hidden select-none" style={{ backgroundColor: PAPER, backgroundImage: textures.grain, color: INK }} {...gestures}>
      {f && pagination && section ? (
        <AnimatePresence mode="popLayout" initial={false} custom={direction.current}>
          <motion.div
            key={current}
            custom={direction.current}
            variants={{ enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 18 }), show: { opacity: 1, x: 0 }, leave: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -18 }) }}
            initial="enter"
            animate="show"
            exit="leave"
            transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
            className="absolute inset-0"
            style={{ padding: `${f.padY}px ${f.padX}px` }}
          >
            <article className="mx-auto flex h-full flex-col" style={{ width: f.inner }} aria-label={`${headline}, section ${current + 1} of ${sections.length}`}>
              {section.opening ? (
                <>
                  <header style={{ height: f.masthead }} className="flex shrink-0 flex-col">
                    <div className="flex items-center justify-between border-b pb-1 text-[10px] tracking-[0.14em] uppercase" style={{ borderColor: INK }}>
                      <span>No. {section.chapter + 1}</span>
                      <span className="max-sm:hidden">{today}</span>
                      <span>{content.chapters.length} parts</span>
                    </div>
                    <p className="flex-1 truncate text-center font-bold" style={{ fontFamily: display, fontSize: Math.min((f.masthead - 30) * 0.74, (f.inner / Math.max(10, title.length)) * 1.75), lineHeight: `${f.masthead - 30}px`, letterSpacing: '0.01em' }}>
                      {title}
                    </p>
                    <div className="border-t-[3px] border-b pt-[2px]" style={{ borderColor: INK }} />
                  </header>
                  <div style={{ height: f.headline }} className="flex shrink-0 flex-col justify-center text-center">
                    <h2 className="line-clamp-2 font-bold" style={{ fontFamily: display, fontSize: f.headlineSize, lineHeight: 1.12 }}>
                      {headline}
                    </h2>
                    <p className="mt-2 truncate text-[11px] tracking-[0.16em] uppercase">{author ? `By ${author}` : 'From the Lumen library'}</p>
                  </div>
                </>
              ) : (
                <header style={{ height: f.running }} className="flex shrink-0 items-start justify-between gap-4 text-[11px] tracking-[0.12em] uppercase">
                  <span className="truncate border-b pb-1 font-bold" style={{ borderColor: INK, fontFamily: display }}>
                    {title}
                  </span>
                  <span className="truncate border-b pb-1" style={{ borderColor: INK }}>
                    {headline} · continued
                  </span>
                </header>
              )}

              <div className="relative flex-1">
                {Array.from({ length: section.count }, (_, k) => {
                  const page = pagination.pages[section.first + k]
                  const x = k * (pagination.geometry.width + GAP)
                  return (
                    <div key={k} className="absolute top-0" style={{ left: x }}>
                      {k > 0 && <div className="absolute top-0 w-px opacity-45" style={{ left: -GAP / 2, height: section.opening ? f.short : f.tall, background: INK }} />}
                      <PageView page={page} type={pagination.type} width={pagination.geometry.width} height={section.opening ? f.short : f.tall} />
                    </div>
                  )
                })}
                {/* uneven inking */}
                <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: textures!.ink }} />
              </div>

              <footer style={{ height: f.footer, borderTop: `1px solid ${INK}` }} className="flex shrink-0 items-end justify-between text-[10px] tracking-[0.14em] uppercase">
                <span>Section {current + 1} of {sections.length}</span>
                <span>{current < sections.length - 1 ? 'Continued overleaf' : 'The end'}</span>
              </footer>
            </article>
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="absolute inset-0 p-8" role="status" aria-label="Setting the type">
          <div className="skeleton mx-auto h-16 max-w-2xl rounded" />
          <div className="mt-8 grid h-2/3 grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton rounded opacity-60" />
            ))}
          </div>
        </div>
      )}

      {pagination && current > 0 && (
        <button type="button" aria-label="Previous section" onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onClick={() => go(-1)} className="absolute top-1/2 left-0 -translate-y-1/2 rounded-full p-2 text-2xl opacity-30 hover:opacity-90 focus-visible:opacity-90 max-sm:hidden" style={{ color: INK }}>
          ‹
        </button>
      )}
      {pagination && current < sections.length - 1 && (
        <button type="button" aria-label="Next section" onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onClick={() => go(1)} className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full p-2 text-2xl opacity-30 hover:opacity-90 focus-visible:opacity-90 max-sm:hidden" style={{ color: INK }}>
          ›
        </button>
      )}
    </div>
  )
})
