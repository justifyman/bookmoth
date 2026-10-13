import { useEffect, useMemo, useRef, useState } from 'react'
import { Choices } from '../appearance/AppearancePanel'
import { BookScene } from './Scene'
import type { CoverKind, DeskKind, SceneApi, SceneSettings } from './Scene'
import { PlaceholderBook } from './pageTexture'
import { PLACEHOLDER_AUTHOR, PLACEHOLDER_TITLE } from './placeholder'
import { QUALITY, detectQuality } from './quality'
import type { Quality } from './quality'
import { DEFAULT_DIMS } from './bookShape'
import { PAPER } from './textures'
import type { PaperStyle } from './textures'

// The 3D book on its own with stand-in text, for judging realism: open /?preview.
// Query options: cover, paper, desk, quality, open=1, spread, elev, zoom, bare.

const params = new URLSearchParams(location.search)
const pick = <T extends string>(key: string, fallback: T) => (params.get(key) as T | null) ?? fallback
const PAGES = 480 - 141

export default function Preview() {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<SceneSettings>({
    cover: pick<CoverKind>('cover', 'leather'),
    paper: pick<PaperStyle>('paper', 'aged'),
    desk: pick<DeskKind>('desk', 'wood'),
    quality: pick<Quality>('quality', detectQuality()),
    open: params.get('open') === '1',
  })
  const [spread, setSpread] = useState(Number(params.get('spread') ?? 84))
  const set = <K extends keyof SceneSettings>(key: K, value: SceneSettings[K]) => setSettings((s) => ({ ...s, [key]: value }))
  const api = useRef<SceneApi | null>(null)

  useEffect(() => {
    Promise.all([document.fonts.load('400 20px "EB Garamond"'), document.fonts.load('500 20px "EB Garamond"')]).finally(() => setReady(true))
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') api.current?.flip(1)
      else if (e.key === 'ArrowLeft') api.current?.flip(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const height = QUALITY[settings.quality].pageTextureHeight
  const source = useMemo(() => (ready ? new PlaceholderBook({ height, aspect: DEFAULT_DIMS.W / DEFAULT_DIMS.H, font: 'EB Garamond', fontScale: 1, ink: PAPER[settings.paper].ink }) : null), [ready, height, settings.paper])
  useEffect(() => () => source?.dispose(), [source])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {ready && (
        <BookScene
          settings={settings}
          apiRef={api}
          feed={{ title: PLACEHOLDER_TITLE, author: PLACEHOLDER_AUTHOR, source, totalPages: PAGES, spread, onSpread: setSpread, focus: 'both', onStep: (dir) => api.current?.flip(dir), onTapMiddle: () => {} }}
        />
      )}
      {!params.has('bare') && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
          <div className="flex w-[26rem] max-w-full flex-col gap-2 rounded-2xl bg-stone-950/80 p-3 text-stone-100 backdrop-blur">
            <button type="button" onClick={() => set('open', !settings.open)} className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-stone-900">
              {settings.open ? 'Close the book' : 'Open the book'}
            </button>
            <Choices label="Cover" value={settings.cover} onChange={(v) => set('cover', v)} options={[['leather', 'Leather'], ['cloth', 'Cloth'], ['linen', 'Linen']]} />
            <Choices label="Paper" value={settings.paper} onChange={(v) => set('paper', v)} options={[['modern', 'Bright'], ['aged', 'Aged'], ['manuscript', 'Manuscript']]} />
            <Choices label="Desk" value={settings.desk} onChange={(v) => set('desk', v)} options={[['wood', 'Wood'], ['worn', 'Worn wood'], ['hessian', 'Cloth']]} />
            <Choices label="Quality" value={settings.quality} onChange={(v) => set('quality', v)} options={[['high', 'High'], ['balanced', 'Balanced'], ['light', 'Light']]} />
          </div>
        </div>
      )}
    </div>
  )
}
