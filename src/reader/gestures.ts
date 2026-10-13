import { useRef } from 'react'

/**
 * The gestures every flat reading mode shares: a tap on either edge or a sideways
 * swipe turns the page, a tap in the middle shows or hides the menus.
 */
export function useTapZones(step: (dir: 1 | -1) => void, onMiddle: () => void) {
  const press = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button === 0) press.current = { x: e.clientX, y: e.clientY }
    },
    onPointerCancel: () => {
      press.current = null
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = press.current
      press.current = null
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) return step(dx < 0 ? 1 : -1)
      if (Math.hypot(dx, dy) > 10) return
      const rect = e.currentTarget.getBoundingClientRect()
      const rel = (e.clientX - rect.left) / rect.width
      if (rel < 0.28) step(-1)
      else if (rel > 0.72) step(1)
      else onMiddle()
    },
  }
}
