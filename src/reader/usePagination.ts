import { useEffect, useRef, useState } from 'react'
import type { BookContent } from '../model/document'
import { paginate } from '../pagination/paginate'
import type { Pagination } from '../pagination/paginate'
import type { PageGeometry, TypeSettings } from '../pagination/types'

/**
 * Paginates a book for the given type and page size, and again whenever they
 * change. Returns null while the first layout is being worked out; later changes
 * keep showing the previous layout until the new one is ready.
 */
export function usePagination(content: BookContent | null, type: TypeSettings, geometry: PageGeometry | null, extraKey = '') {
  const [result, setResult] = useState<Pagination | null>(null)
  const key = geometry ? `${type.fontFamily}|${type.fontSize}|${type.lineHeight}|${type.justify}|${Math.round(geometry.width)}x${Math.round(geometry.height)}|${geometry.chapterDrop ?? ''}|${geometry.omitChapterHeading ? 1 : 0}|${extraKey}` : ''
  const latest = useRef({ type, geometry })
  latest.current = { type, geometry }

  useEffect(() => {
    if (!content || !key) return
    const abort = new AbortController()
    const { type, geometry } = latest.current
    // wait a moment so dragging a slider or resizing the window does not start dozens of layouts
    const timer = setTimeout(() => {
      paginate(content, type, geometry!, abort.signal).then(
        (p) => !abort.signal.aborted && setResult(p),
        () => {},
      )
    }, 60)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [content, key])

  return result
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, size }
}
