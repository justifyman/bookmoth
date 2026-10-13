import { useEffect, useState } from 'react'

// A book's cover image, or a drawn one when the file did not bring its own.

const PALETTES = [
  { bg: '#3b2a22', fg: '#e9cf9c' },
  { bg: '#243a34', fg: '#e6dcc0' },
  { bg: '#27324a', fg: '#e3d6b4' },
  { bg: '#5a2a2a', fg: '#f0dcb2' },
  { bg: '#d9cbb0', fg: '#3a2c1c' },
  { bg: '#4a3b57', fg: '#ead9bb' },
  { bg: '#2f3b2a', fg: '#e8dcb8' },
  { bg: '#1f2a30', fg: '#d8c9a3' },
]

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Cover({ title, author, image, className = '' }: { title: string; author: string; image: Blob | null; className?: string }) {
  const url = useBlobUrl(image)
  const base = `relative aspect-[2/3] w-full overflow-hidden rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,.25),0_8px_18px_-8px_rgba(0,0,0,.45)] ${className}`
  if (image && url) {
    return (
      <div className={base}>
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 to-transparent" />
      </div>
    )
  }
  const p = PALETTES[hash(title + author) % PALETTES.length]
  return (
    <div className={base} style={{ background: p.bg, color: p.fg, containerType: 'inline-size' }} aria-hidden="true">
      <div className="absolute inset-[6%] border" style={{ borderColor: `${p.fg}66` }} />
      <div className="absolute inset-[8.5%] border" style={{ borderColor: `${p.fg}33` }} />
      <div className="absolute inset-x-[14%] top-[18%] text-center font-display leading-[1.12] font-medium tracking-wide [overflow-wrap:anywhere]" style={{ fontSize: title.length > 40 ? '9cqw' : title.length > 18 ? '11.5cqw' : '14cqw' }}>
        <span className="line-clamp-5">{title}</span>
      </div>
      <div className="absolute inset-x-[14%] bottom-[13%] text-center font-display tracking-[0.12em] uppercase opacity-80" style={{ fontSize: '6cqw' }}>
        <span className="line-clamp-2">{author}</span>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/30 to-transparent" />
    </div>
  )
}
