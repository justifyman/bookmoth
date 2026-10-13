import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { COVERS, DESKS } from '../book3d/looks'
import type { CoverKind, DeskKind } from '../book3d/looks'
import { PAPER } from '../book3d/paper'
import { MIN_TEXT_PX, legibleInk } from './contrast'
import { FONTS, PRESETS, THEMES } from './settings'
import type { Appearance, FontId, ReadingMode } from './settings'

// The one place where the look of a book is changed. Every control applies straight
// away to the book behind the panel, and to the small sample at the top.

interface Props {
  appearance: Appearance
  /** a few lines from the page being read */
  sample: string
  /** size of body text on screen right now */
  textPx: number
  canUndo: boolean
  isDefault: boolean
  onChange: (patch: Partial<Appearance>) => void
  onUndo: () => void
  onReset: () => void
  onClose: () => void
}

export const MODES: [ReadingMode, string][] = [
  ['plain', 'Plain'],
  ['book', '3D book'],
  ['newspaper', 'Newspaper'],
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 px-4 py-4">
      <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-stone-400 uppercase">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-stone-300">{label}</p>
      {children}
    </div>
  )
}

export function Choices<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-white/[0.07] p-1">
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)} className={`flex-1 rounded-full px-2 py-1.5 text-[13px] whitespace-nowrap transition-colors ${v === value ? 'bg-amber-100 font-medium text-stone-900' : 'text-stone-200 hover:bg-white/10'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

function Swatches<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; background: string; color?: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)} className={`rounded-lg p-1 text-left text-[12px] text-stone-200 ring-1 transition-shadow ${o.id === value ? 'ring-2 ring-amber-200' : 'ring-white/15 hover:ring-white/40'}`}>
          <span className="flex h-9 items-center justify-center rounded-md bg-cover bg-center font-display text-base" style={{ background: o.background, color: o.color }}>
            {o.color ? 'Aa' : ''}
          </span>
          <span className="mt-1 block truncate px-0.5">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const nudge = 'h-8 w-8 shrink-0 rounded-full bg-white/[0.07] text-lg leading-none text-stone-100 hover:bg-white/15 disabled:opacity-30'
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Less ${label.toLowerCase()}`} className={nudge} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <input type="range" aria-label={label} aria-valuetext={format(value)} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 min-w-0 flex-1 accent-amber-200" />
      <button type="button" aria-label={`More ${label.toLowerCase()}`} className={nudge} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        +
      </button>
      <span className="w-10 shrink-0 text-right text-xs text-stone-400 tabular-nums">{format(value)}</span>
    </div>
  )
}

const asset = (path: string) => `url(${import.meta.env.BASE_URL}assets/textures/${path}/1k/albedo.jpg) center/160%`

function Sample({ appearance, text }: { appearance: Appearance; text: string }) {
  const font = FONTS[appearance.font]
  const paper = PAPER[appearance.paper]
  const theme = THEMES[appearance.theme]
  const [background, ink] = appearance.mode === 'plain' ? [theme.background, theme.text] : appearance.mode === 'book' ? [paper.base, paper.ink] : ['#e9e3d4', '#1d1b18']
  const scale = appearance.mode === 'newspaper' ? 0.8 : appearance.mode === 'book' ? 0.92 : 1
  return (
    <div aria-hidden="true" className="mx-4 mb-4 h-28 overflow-hidden rounded-lg px-4 py-3 ring-1 ring-white/10" style={{ background, color: legibleInk(ink, background), fontFamily: `"${font.family}", Georgia, serif`, fontSize: appearance.fontSize * font.scale * scale, lineHeight: appearance.lineSpacing, textAlign: appearance.justify || appearance.mode === 'newspaper' ? 'justify' : 'left', columnCount: appearance.mode === 'newspaper' ? Math.min(2, appearance.columns) : 1, columnGap: 18, columnRule: '1px solid rgba(0,0,0,.3)' }}>
      {text || 'The quick brown fox jumps over the lazy dog, and the page looks just like this.'}
    </div>
  )
}

export function AppearancePanel({ appearance: a, sample, textPx, canUndo, isDefault, onChange, onUndo, onReset, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const tooSmall = textPx > 0 && textPx < MIN_TEXT_PX
  const quiet = 'rounded-full px-3 py-1.5 text-sm text-stone-200 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent'

  return (
    <motion.aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Appearance"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.16 }}
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[62%] flex-col rounded-t-2xl bg-stone-950/95 text-stone-100 shadow-2xl outline-none backdrop-blur sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-3 sm:max-h-none sm:w-[340px] sm:rounded-2xl"
    >
      <header className="flex shrink-0 items-center gap-1 px-4 py-3">
        <h2 className="flex-1 font-display text-xl">Appearance</h2>
        <button type="button" className={quiet} disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className={quiet} disabled={isDefault} onClick={onReset}>
          Reset
        </button>
        <button type="button" aria-label="Close appearance" className="rounded-full px-2.5 py-1.5 text-stone-200 hover:bg-white/10" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        <Sample appearance={a} text={sample} />

        {tooSmall && (
          <div role="alert" className="mx-4 mb-4 flex items-center gap-3 rounded-lg bg-amber-200/15 px-3 py-2 text-[13px] text-amber-100">
            <span className="flex-1">Text this small is hard to read on this screen.</span>
            <button type="button" className="shrink-0 rounded-full bg-amber-100 px-3 py-1 font-medium text-stone-900" onClick={() => onChange({ fontSize: Math.min(34, Math.ceil((a.fontSize * (MIN_TEXT_PX + 0.5)) / textPx)) })}>
              Make it larger
            </button>
          </div>
        )}

        <div className="px-4 pb-4">
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-stone-400 uppercase">Ready-made looks</h3>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => {
              const active = (Object.keys(p.apply) as (keyof Appearance)[]).every((k) => a[k] === p.apply[k])
              return (
                <button key={p.id} type="button" aria-pressed={active} onClick={() => onChange(p.apply)} className={`rounded-xl p-3 text-left ring-1 transition-shadow ${active ? 'bg-amber-100/10 ring-2 ring-amber-200' : 'bg-white/[0.05] ring-white/10 hover:ring-white/40'}`}>
                  <span className="block font-display text-[17px] leading-tight">{p.label}</span>
                  <span className="mt-1 block text-[11.5px] leading-snug text-stone-400">{p.description}</span>
                </button>
              )
            })}
          </div>
        </div>

        <Group title="Reading as">
          <Choices label="Reading mode" value={a.mode} options={MODES} onChange={(mode) => onChange({ mode })} />
        </Group>

        <Group title="Text">
          <Row label="Typeface">
            <div role="radiogroup" aria-label="Typeface" className="grid grid-cols-2 gap-2">
              {(Object.keys(FONTS) as FontId[]).map((id) => (
                <button key={id} type="button" role="radio" aria-checked={a.font === id} onClick={() => onChange({ font: id })} className={`rounded-lg px-3 py-2 text-left ring-1 transition-shadow ${a.font === id ? 'bg-amber-100/10 ring-2 ring-amber-200' : 'bg-white/[0.05] ring-white/10 hover:ring-white/40'}`}>
                  <span className="block truncate text-[17px] leading-tight" style={{ fontFamily: `"${FONTS[id].family}", Georgia, serif`, fontSize: 17 * FONTS[id].scale }}>
                    {FONTS[id].label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-stone-400">{FONTS[id].note}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Text size">
            <Slider label="Text size" value={a.fontSize} min={13} max={34} step={1} onChange={(fontSize) => onChange({ fontSize })} format={(v) => `${v}`} />
          </Row>
          <Row label="Line spacing">
            <Slider label="Line spacing" value={a.lineSpacing} min={1.2} max={2} step={0.05} onChange={(lineSpacing) => onChange({ lineSpacing: Math.round(lineSpacing * 100) / 100 })} format={(v) => v.toFixed(2)} />
          </Row>
          {a.mode !== 'newspaper' && (
            <Row label="Line endings">
              <Choices label="Line endings" value={a.justify ? 'even' : 'ragged'} options={[['even', 'Even edges'], ['ragged', 'Natural']]} onChange={(v) => onChange({ justify: v === 'even' })} />
            </Row>
          )}
        </Group>

        <Group title="Page">
          {a.mode === 'plain' && (
            <>
              <Row label="Colours">
                <Swatches label="Colours" value={a.theme} onChange={(theme) => onChange({ theme })} options={(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((id) => ({ id, label: THEMES[id].label, background: `radial-gradient(circle at 15% 0%, ${THEMES[id].glows[0]}, transparent 75%), ${THEMES[id].background}`, color: THEMES[id].text }))} />
              </Row>
              <Row label="Margins">
                <Choices label="Margins" value={a.margins <= 0.05 ? 'narrow' : a.margins >= 0.12 ? 'wide' : 'medium'} options={[['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide']]} onChange={(v) => onChange({ margins: v === 'narrow' ? 0.04 : v === 'wide' ? 0.16 : 0.08 })} />
              </Row>
            </>
          )}
          {a.mode === 'book' && (
            <Row label="Paper">
              <Swatches label="Paper" value={a.paper} onChange={(paper) => onChange({ paper })} options={(Object.keys(PAPER) as (keyof typeof PAPER)[]).map((id) => ({ id, label: PAPER[id].label.replace(/ (paper|vellum)$/, ''), background: `radial-gradient(ellipse at center, transparent 50%, ${PAPER[id].burnColor}55 100%), ${PAPER[id].base}`, color: PAPER[id].ink }))} />
            </Row>
          )}
          {a.mode === 'newspaper' && (
            <Row label="Columns">
              <Choices label="Columns" value={a.columns} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} onChange={(columns) => onChange({ columns })} />
              <p className="mt-1.5 text-[11px] text-stone-400">Narrow screens show fewer, so each column stays readable.</p>
            </Row>
          )}
        </Group>

        <Group title="Book">
          {a.mode === 'book' ? (
            <>
              <Row label="Light">
                <Choices label="Light" value={a.night ? 'night' : 'day'} options={[['day', 'Daylight'], ['night', 'Night light']]} onChange={(v) => onChange({ night: v === 'night' })} />
                <p className="mt-1.5 text-[11px] text-stone-400">Night light darkens the room and leaves one lamp on the pages.</p>
              </Row>
              <Row label="Cover">
                <Swatches label="Cover" value={a.cover} onChange={(cover) => onChange({ cover })} options={(Object.keys(COVERS) as CoverKind[]).map((id) => ({ id, label: COVERS[id].label, background: COVERS[id].swatch ? `linear-gradient(${COVERS[id].swatch}d9, ${COVERS[id].swatch}d9), ${asset(COVERS[id].folder)}` : asset(COVERS[id].folder) }))} />
              </Row>
              <Row label="Underneath">
                <Swatches label="Surface under the book" value={a.desk} onChange={(desk) => onChange({ desk })} options={(Object.keys(DESKS) as DeskKind[]).map((id) => ({ id, label: DESKS[id].label, background: asset(DESKS[id].folder) }))} />
              </Row>
              <Row label="Detail">
                <Choices label="Detail" value={a.quality} options={[['auto', 'Auto'], ['high', 'High'], ['balanced', 'Balanced'], ['light', 'Light']]} onChange={(quality) => onChange({ quality })} />
                <p className="mt-1.5 text-[11px] text-stone-400">Auto picks what this device can draw smoothly.</p>
              </Row>
            </>
          ) : (
            <button type="button" className="rounded-lg bg-white/[0.05] px-3 py-2.5 text-left text-[13px] text-stone-200 ring-1 ring-white/10 hover:ring-white/40" onClick={() => onChange({ mode: 'book' })}>
              Read it as a 3D book to choose a cover, paper and desk →
            </button>
          )}
        </Group>
      </div>
    </motion.aside>
  )
}
