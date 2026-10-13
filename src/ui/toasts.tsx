import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Small messages at the bottom of the screen, optionally with one action (usually Undo).

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
  secondary?: { label: string; run: () => void }
  /** called when the toast goes away without its action being used */
  onExpire?: () => void
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function remove(id: number, expired: boolean) {
  const t = toasts.find((x) => x.id === id)
  if (!t) return
  toasts = toasts.filter((x) => x.id !== id)
  if (expired) t.onExpire?.()
  emit()
}

export function showToast(toast: Omit<Toast, 'id'>, ms = 6000) {
  const id = nextId++
  toasts = [...toasts, { ...toast, id }]
  emit()
  if (ms > 0) setTimeout(() => remove(id, true), ms)
  return id
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4" role="status" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  t.action!.run()
                  remove(t.id, false)
                }}
              >
                {t.action.label}
              </button>
            )}
            {t.secondary && (
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 opacity-80 hover:opacity-100"
                onClick={() => {
                  t.secondary!.run()
                  remove(t.id, false)
                }}
              >
                {t.secondary.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="shrink-0 px-1 opacity-60 hover:opacity-100" onClick={() => remove(t.id, true)}>
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
