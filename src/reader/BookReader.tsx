import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { legibleInk } from '../appearance/contrast'
import { FONTS } from '../appearance/settings'
import { BookPages, pageLayout, rigIndexOfPage } from '../book3d/bookPages'
import { BookScene, pageHeightOnScreen } from '../book3d/Scene'
import type { BookFeed, Focus, SceneApi } from '../book3d/Scene'
import { QUALITY, detectQuality, lighter, webglAvailable } from '../book3d/quality'
import type { Quality } from '../book3d/quality'
import { PAPER } from '../book3d/textures'
import { anchorOfPage, pageOfAnchor } from '../pagination/paginate'
import type { TypeSettings } from '../pagination/types'
import { showToast } from '../ui/toasts'
import { Book2D } from './Book2D'
import type { ModeHandle, ModeProps } from './modes'
import { usePagination, useSize } from './usePagination'

// The 3D book: the shared pagination engine lays the text out for the printed page,
// and the scene shows those pages in a book on a desk.

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

// remembered for the visit, so a slow device is not asked to try the 3D scene for every book
let measuredQuality: Quality | null = null
let useFlat = false

export const BookReader = forwardRef<ModeHandle, ModeProps>(function BookReader({ content, title, author, appearance, anchor, onAnchor, onToggleChrome, onLocation, onAppearance }, ref) {
  const { ref: boxRef, size } = useSize<HTMLDivElement>()
  const reduce = !!useReducedMotion()
  const font = FONTS[appearance.font]
  const single = !!size && size.width < size.height * 0.95

  const [autoQuality, setAutoQuality] = useState<Quality>(() => measuredQuality ?? detectQuality())
  const quality = appearance.quality === 'auto' ? autoQuality : appearance.quality
  const [flat, setFlat] = useState(() => useFlat || !webglAvailable())
  const [sceneReady, setSceneReady] = useState(false)

  const screenPage = size ? pageHeightOnScreen(size.width, size.height, single) : 0
  const layout = useMemo(() => (screenPage ? pageLayout(screenPage) : null), [screenPage])
  const type: TypeSettings = useMemo(
    () => ({ fontFamily: font.family, fontSize: appearance.fontSize * font.scale * 0.92, lineHeight: Math.max(1.2, appearance.lineSpacing * 0.94), justify: appearance.justify }),
    [font, appearance.fontSize, appearance.lineSpacing, appearance.justify],
  )
  const pagination = usePagination(content, type, layout?.geometry ?? null)

  const look = PAPER[appearance.paper]
  const ink = legibleInk(look.ink, look.base)
  const textureHeight = QUALITY[quality].pageTextureHeight
  const source = useMemo(() => (pagination && layout && !flat ? new BookPages({ pagination, content, layout, title, ink, textureHeight }) : null), [pagination, content, layout, title, ink, textureHeight, flat])
  useEffect(() => () => source?.dispose(), [source])

  const pages = pagination?.pages.length ?? 0
  const page = pagination ? pageOfAnchor(pagination, anchor) : 0
  const index = rigIndexOfPage(page)
  const spread = index >> 1
  const focus: Focus = single ? (index % 2 === 0 ? 'left' : 'right') : 'both'

  useEffect(() => {
    if (pagination && layout) onLocation({ page, pages, textPx: (pagination.type.fontSize * Math.min(screenPage, 1150)) / layout.height })
  }, [pagination, layout, page, pages, screenPage, onLocation])

  // draw the neighbouring pages while the reader is busy with this one
  useEffect(() => {
    if (!source) return
    const t = setTimeout(() => source.warm(spread), 350)
    return () => clearTimeout(t)
  }, [source, spread])

  const api = useRef<SceneApi | null>(null)
  const goToPage = (p: number) => pagination && p >= 0 && p < pages && onAnchor(anchorOfPage(pagination, p))
  const step = (dir: 1 | -1) => {
    if (!pagination) return
    // on a narrow screen the camera first moves across to the other page of the spread
    if (single && dir === 1 && focus === 'left') return goToPage(page + 1)
    if (single && dir === -1 && focus === 'right') return goToPage(page - 1)
    if (flat) {
      const next = single ? page + dir : dir === 1 ? 2 * spread + 1 : 2 * spread - 3
      return goToPage(Math.max(0, next))
    }
    api.current?.flip(dir)
  }
  const stepRef = useRef(step)
  const goToRef = useRef(goToPage)
  useEffect(() => {
    stepRef.current = step
    goToRef.current = goToPage
  })
  useImperativeHandle(ref, () => ({ next: () => stepRef.current(1), prev: () => stepRef.current(-1), goTo: (p) => goToRef.current(p) }), [])

  const onSpread = (s: number, dir: 1 | -1) => {
    if (!pagination) return
    // the place kept is the first page of the spread; on a narrow screen, the page the turn lands on
    const landed = single && dir === -1 ? 2 * s : 2 * s - 1
    onAnchor(anchorOfPage(pagination, Math.min(pages - 1, Math.max(0, landed))))
  }

  const goFlat = useCallback((message: string) => {
    useFlat = true
    setFlat(true)
    showToast(
      {
        message,
        action: {
          label: 'Try 3D again',
          run: () => {
            useFlat = false
            setFlat(false)
          },
        },
      },
      9000,
    )
  }, [])

  // two slow readings in a row step the quality down; a slow one at the lightest setting switches to the flat book
  const slow = useRef(0)
  const onFrameRate = (fps: number) => {
    if (fps >= 40) return void (slow.current = 0)
    if (++slow.current < 2) return
    slow.current = 0
    const next = lighter(quality)
    if (appearance.quality === 'auto' && next) {
      measuredQuality = next
      setAutoQuality(next)
    } else if (!next && fps < 24) goFlat('Switched to a simpler book so page turns stay smooth.')
    else if (next && fps < 30) {
      showToast({ message: 'Page turns look slow on this device.', action: { label: `Use ${QUALITY[next].label} quality`, run: () => onAppearance({ quality: next }) } }, 9000)
    }
  }

  const feed: BookFeed = { title, author, source, totalPages: pages + 1, spread, onSpread, focus, onStep: step, onTapMiddle: onToggleChrome }
  const waiting = !pagination || (!flat && !sceneReady)

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden bg-[#0d0907]">
      {size && !flat && (
        <SceneBoundary onError={() => goFlat('The 3D book isn’t available on this device, so here is a simpler one.')}>
          <BookScene
            settings={{ cover: appearance.cover, paper: appearance.paper, desk: appearance.desk, quality, open: !!pagination, night: appearance.night }}
            feed={feed}
            apiRef={api}
            instantOpen={reduce || sceneReady}
            onReady={() => setSceneReady(true)}
            onFrameRate={onFrameRate}
          />
        </SceneBoundary>
      )}
      {size && flat && pagination && layout && (
        <Book2D pagination={pagination} content={content} layout={layout} title={title} paper={appearance.paper} night={appearance.night} spread={spread} focus={focus} size={size} reducedMotion={reduce} onStep={step} onToggleChrome={onToggleChrome} />
      )}
      {waiting && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5" role="status">
          <div className="skeleton aspect-[2/3] w-[min(34vw,22vh)] rounded-sm opacity-40" />
          <p className="text-sm text-stone-400">Setting your book on the desk…</p>
        </div>
      )}
      {/* the pages are pictures inside the 3D scene, so screen readers get the same text here */}
      {pagination && (
        <div className="sr-only" aria-live="polite">
          {pagination.pages[page]?.items.map((item, i) => (item.kind === 'line' ? <span key={i}>{item.segments.map((s) => s.text).join(' ')} </span> : null))}
        </div>
      )}
    </div>
  )
})
