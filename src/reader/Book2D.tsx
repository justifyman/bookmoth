import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { legibleInk } from '../appearance/contrast'
import { PAGE_MARGIN, furnitureFor, pageOfRigIndex } from '../book3d/bookPages'
import type { PageLayout } from '../book3d/bookPages'
import { PAPER } from '../book3d/paper'
import type { PaperStyle } from '../book3d/paper'
import type { BookContent } from '../model/document'
import type { Pagination } from '../pagination/paginate'
import { useTapZones } from './gestures'
import { PageView } from './PageView'

// The lighter book: the same pages as the 3D book, drawn flat with a simple page
// flip. Used when the device cannot draw the 3D scene smoothly, or at all.

interface Props {
  pagination: Pagination
  content: BookContent
  layout: PageLayout
  title: string
  paper: PaperStyle
  /** the spread to show, and which page of it on narrow screens */
  spread: number
  focus: 'both' | 'left' | 'right'
  size: { width: number; height: number }
  reducedMotion: boolean
  onStep: (dir: 1 | -1) => void
  onToggleChrome: () => void
}

function Sheet({ index, p }: { index: number; p: Omit<Props, 'spread' | 'focus' | 'size' | 'onStep' | 'onToggleChrome' | 'reducedMotion'> }) {
  const look = PAPER[p.paper]
  const ink = legibleInk(look.ink, look.base)
  const left = index % 2 === 0
  const pageNo = pageOfRigIndex(index)
  const page = p.pagination.pages[pageNo]
  const { width, height, geometry } = p.layout
  const x = width * (left ? PAGE_MARGIN.outer : PAGE_MARGIN.inner)
  const y = height * PAGE_MARGIN.top
  const type = p.pagination.type
  const furniture = page ? furnitureFor(p.pagination, p.content, p.title, pageNo) : null
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        color: ink,
        background: `linear-gradient(${left ? 'to left' : 'to right'}, rgba(0,0,0,.2), rgba(0,0,0,.05) 5%, transparent 14%), radial-gradient(ellipse at center, transparent 62%, ${look.burnColor}${Math.round(look.edgeBurn * 90).toString(16).padStart(2, '0')} 100%), ${look.base}`,
        fontFamily: `"${type.fontFamily}", Georgia, serif`,
      }}
    >
      {page && furniture && (
        <>
          {furniture.head && (
            <div className="absolute truncate text-center uppercase" style={{ left: x, width: geometry.width, top: y * 0.6 - type.fontSize * 0.7, fontSize: type.fontSize * 0.7, letterSpacing: '0.09em', lineHeight: 1 }}>
              {furniture.head}
            </div>
          )}
          <div className="absolute" style={{ left: x, top: y }}>
            <PageView page={page} type={type} width={geometry.width} height={geometry.height} />
          </div>
          <div className="absolute text-center" style={{ left: x, width: geometry.width, top: height * (1 - PAGE_MARGIN.bottom * 0.42) - type.fontSize * 0.82, fontSize: type.fontSize * 0.82, lineHeight: 1 }}>
            {furniture.number}
          </div>
        </>
      )}
    </div>
  )
}

export function Book2D({ spread, focus, size, reducedMotion, onStep, onToggleChrome, ...p }: Props) {
  const single = focus !== 'both'
  const { width, height } = p.layout
  const total = p.pagination.pages.length + 1
  const scale = Math.min((size.width - 24) / (width * (single ? 1 : 2)), (size.height - 48) / height)
  const gestures = useTapZones(onStep, onToggleChrome)

  // the spread on show lags the wanted one by the length of a page flip
  const [shown, setShown] = useState(spread)
  const [flip, setFlip] = useState<{ from: number; dir: 1 | -1 } | null>(null)
  useEffect(() => {
    if (spread === shown) return
    if (flip && flip.from + flip.dir === spread) return
    if (!flip && Math.abs(spread - shown) === 1 && !reducedMotion && !single) setFlip({ from: shown, dir: spread > shown ? 1 : -1 })
    else {
      setFlip(null)
      setShown(spread)
    }
  }, [spread, shown, flip, reducedMotion, single])

  const k = flip ? Math.min(flip.from, flip.from + flip.dir) : shown
  const leftIndex = 2 * k
  const rightIndex = flip ? 2 * k + 3 : 2 * k + 1
  const has = (i: number) => i >= 0 && i < total
  const half = 'absolute top-0 h-full w-1/2'

  return (
    <div className="absolute inset-0 flex touch-pan-y items-center justify-center overflow-hidden select-none" style={{ background: 'radial-gradient(ellipse at 40% 30%, #3a2a1d, #120c08 75%)' }} {...gestures}>
      <div style={{ width: width * (single ? 1 : 2) * scale, height: height * scale }}>
        <div className="relative origin-top-left shadow-[0_18px_50px_rgba(0,0,0,.6)]" style={{ width: width * (single ? 1 : 2), height, transform: `scale(${scale})`, perspective: width * 5 }}>
          {single ? (
            <motion.div key={2 * shown + (focus === 'left' ? 0 : 1)} className="absolute inset-0" initial={{ opacity: reducedMotion ? 1 : 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
              <Sheet index={2 * shown + (focus === 'left' ? 0 : 1)} p={p} />
            </motion.div>
          ) : (
            <>
              <div className={`${half} left-0`}>{has(leftIndex) && <Sheet index={leftIndex} p={p} />}</div>
              <div className={`${half} left-1/2`}>{has(rightIndex) && <Sheet index={rightIndex} p={p} />}</div>
              {flip && (
                <motion.div
                  className={`${half} left-1/2`}
                  style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
                  initial={{ rotateY: flip.dir === 1 ? 0 : -180 }}
                  animate={{ rotateY: flip.dir === 1 ? -180 : 0 }}
                  transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
                  onAnimationComplete={() => {
                    setShown(flip.from + flip.dir)
                    setFlip(null)
                  }}
                >
                  <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                    <Sheet index={2 * k + 1} p={p} />
                  </div>
                  <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <Sheet index={2 * k + 2} p={p} />
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
