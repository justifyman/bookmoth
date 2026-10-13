import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { Library } from './library/Library'
import { Reader } from './reader/Reader'
import { Toasts } from './ui/toasts'

const Preview = lazy(() => import('./book3d/Preview'))

// The address remembers which book is open, so the browser's Back button returns
// to the library and a reload carries on with the same book.
const bookInAddress = () => /^#\/read\/(.+)$/.exec(location.hash)?.[1] ?? null

export default function App() {
  const [bookId, setBookId] = useState(bookInAddress)

  useEffect(() => {
    const sync = () => setBookId(bookInAddress())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const open = useCallback((id: string) => {
    location.hash = `#/read/${id}`
  }, [])
  const close = useCallback(() => {
    // go back when the library is the previous entry, so Back does not bounce into the book again
    if (history.state?.fromLibrary) history.back()
    else location.hash = ''
  }, [])
  const openFromLibrary = useCallback(
    (id: string) => {
      open(id)
      history.replaceState({ fromLibrary: true }, '')
    },
    [open],
  )

  if (new URLSearchParams(location.search).has('preview')) {
    return (
      <Suspense fallback={null}>
        <Preview />
      </Suspense>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      {bookId ? <Reader key={bookId} bookId={bookId} onClose={close} /> : <Library onOpen={openFromLibrary} />}
      <Toasts />
    </MotionConfig>
  )
}
