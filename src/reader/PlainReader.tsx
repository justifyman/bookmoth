import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FONTS, THEMES } from '../appearance/settings'
import { anchorOfPage, pageOfAnchor } from '../pagination/paginate'
import type { PageGeometry, TypeSettings } from '../pagination/types'
import { legibleInk } from '../appearance/contrast'
import { useTapZones } from './gestures'
import { PageView } from './PageView'
import type { ModeHandle, ModeProps } from './modes'
import { usePagination, useSize } from './usePagination'

// The baseline: one clean page of text at a time.

export const PlainReader = forwardRef<ModeHandle, ModeProps>(function PlainReader({ content, appearance, anchor, onAnchor, onToggleChrome, onLocation }, ref) {
  const { ref: boxRef, size } = useSize<HTMLDivElement>()
  const reduce = useReducedMotion()
  const theme = THEMES[appearance.theme]
  const font = FONTS[appearance.font]

  const type: TypeSettings = useMemo(
    () => ({ fontFamily: font.family, fontSize: appearance.fontSize * font.scale, lineHeight: appearance.lineSpacing, justify: appearance.justify }),
    [font, appearance.fontSize, appearance.lineSpacing, appearance.justify],
  )
  const geometry: PageGeometry | null = useMemo(() => {
    if (!size) return null
    const side = Math.max(20, size.width * appearance.margins)
    const padY = size.height < 560 ? 36 : 64
    // a comfortable line is at most about 38 times the type size
    const width = Math.max(180, Math.min(size.width - side * 2, type.fontSize * 38))
    return { width, height: Math.max(160, size.height - padY * 2 - 8) }
  }, [size, appearance.margins, type.fontSize])

  const pagination = usePagination(content, type, geometry)
  const page = pagination ? pageOfAnchor(pagination, anchor) : 0
  const pages = pagination?.pages.length ?? 0

  const go = (to: number) => {
    if (!pagination) return
    const clamped = Math.min(pages - 1, Math.max(0, to))
    if (clamped !== page) {
      direction.current = clamped > page ? 1 : -1
      onAnchor(anchorOfPage(pagination, clamped))
    }
  }
  const direction = useRef(1)
  const goRef = useRef(go)
  goRef.current = go
  useImperativeHandle(ref, () => ({ next: () => goRef.current(pageRef.current + 1), prev: () => goRef.current(pageRef.current - 1), goTo: (p) => goRef.current(p) }), [])
  const pageRef = useRef(page)
  pageRef.current = page

  useEffect(() => {
    if (pagination) onLocation({ page, pages, textPx: pagination.type.fontSize })
  }, [pagination, page, pages, onLocation])

  // taps on the edges turn the page, a tap in the middle shows the menus, a sideways swipe turns too
  const gestures = useTapZones((dir) => go(page + dir), onToggleChrome)

  const current = pagination?.pages[page]
  const chapterTitle = current ? content.chapters[current.chapter]?.title : ''

  return (
    <div ref={boxRef} className="group/page absolute inset-0 touch-pan-y overflow-hidden select-none" style={{ background: theme.background, color: legibleInk(theme.text, theme.background) }} {...gestures}>
      {geometry && (
        <div className="absolute inset-0 flex items-center justify-center">
          {current && pagination ? (
            <AnimatePresence mode="popLayout" initial={false} custom={direction.current}>
              <motion.div
                key={page}
                custom={direction.current}
                variants={{ enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 14 }), show: { opacity: 1, x: 0 }, leave: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -14 }) }}
                initial="enter"
                animate="show"
                exit="leave"
                transition={{ duration: reduce ? 0 : 0.14, ease: 'easeOut' }}
              >
                <article aria-label={`Page ${page + 1} of ${pages}`}>
                  <PageView page={current} type={pagination.type} width={pagination.geometry.width} height={pagination.geometry.height} />
                </article>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ width: geometry.width, height: geometry.height }} aria-label="Preparing your book" role="status">
              {Array.from({ length: Math.floor(geometry.height / (type.fontSize * type.lineHeight) / 1.4) }, (_, i) => (
                <div key={i} className="skeleton rounded" style={{ height: type.fontSize * 0.6, marginBottom: type.fontSize * type.lineHeight * 1.4 - type.fontSize * 0.6, width: `${i % 5 === 4 ? 62 : 100}%`, opacity: 0.7 }} />
              ))}
            </div>
          )}
        </div>
      )}

      {pagination && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3 text-[11px]" style={{ color: theme.muted }}>
          <div className="flex justify-between gap-6" style={{ width: pagination.geometry.width }}>
            <span className="truncate">{chapterTitle}</span>
            <span className="shrink-0 tabular-nums">
              {page + 1} of {pages}
            </span>
          </div>
        </div>
      )}

      {/* quiet arrows at the edges: they show where to tap and give keyboard and screen-reader users real buttons */}
      {pagination && page > 0 && (
        <button type="button" aria-label="Previous page" onPointerUp={(e) => e.stopPropagation()} onClick={() => go(page - 1)} className="absolute top-1/2 left-1 -translate-y-1/2 rounded-full p-3 text-2xl opacity-0 transition-opacity group-hover/page:opacity-40 hover:opacity-90 focus-visible:opacity-90 max-sm:hidden" style={{ color: theme.text }}>
          ‹
        </button>
      )}
      {pagination && page < pages - 1 && (
        <button type="button" aria-label="Next page" onPointerUp={(e) => e.stopPropagation()} onClick={() => go(page + 1)} className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full p-3 text-2xl opacity-0 transition-opacity group-hover/page:opacity-40 hover:opacity-90 focus-visible:opacity-90 max-sm:hidden" style={{ color: theme.text }}>
          ›
        </button>
      )}
    </div>
  )
})
