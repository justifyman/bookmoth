import type { CoverKind, DeskKind } from '../book3d/looks'
import type { Quality } from '../book3d/quality'
import type { PaperStyle } from '../book3d/paper'

export type ReadingMode = 'plain' | 'book' | 'newspaper'
export type Theme = 'amber' | 'midnight' | 'forest' | 'dark' | 'sepia' | 'light'

export interface Appearance {
  mode: ReadingMode
  // Text
  font: FontId
  /** body size in CSS pixels in plain mode; the other modes scale from it */
  fontSize: number
  lineSpacing: number
  /** side margins in plain mode, as a share of the screen width */
  margins: number
  justify: boolean
  // Page
  theme: Theme
  paper: PaperStyle
  // Book
  cover: CoverKind
  desk: DeskKind
  /** night light: the room goes dark and a lamp shines on the pages */
  night: boolean
  quality: Quality | 'auto'
  // Newspaper
  columns: number
}

export type FontId = 'garamond' | 'literata' | 'lora' | 'baskerville' | 'crimson' | 'merriweather' | 'fell' | 'atkinson' | 'inter' | 'lexend' | 'courier' | 'dyslexic'

export const FONTS: Record<FontId, { label: string; family: string; note: string; scale: number }> = {
  garamond: { label: 'Garamond', family: 'EB Garamond', note: 'Classic book type', scale: 1.08 },
  literata: { label: 'Literata', family: 'Literata', note: 'Made for long reading', scale: 1 },
  lora: { label: 'Lora', family: 'Lora', note: 'Warm and bookish', scale: 1 },
  baskerville: { label: 'Baskerville', family: 'Libre Baskerville', note: 'Crisp and traditional', scale: 0.9 },
  crimson: { label: 'Crimson', family: 'Crimson Pro', note: 'Elegant old-style', scale: 1.08 },
  merriweather: { label: 'Merriweather', family: 'Merriweather', note: 'Sturdy on screens', scale: 0.9 },
  fell: { label: 'Fell', family: 'IM Fell English', note: 'Seventeenth-century print', scale: 1.04 },
  atkinson: { label: 'Atkinson', family: 'Atkinson Hyperlegible', note: 'Extra clear letter shapes', scale: 1 },
  inter: { label: 'Inter', family: 'Inter', note: 'Clean and modern', scale: 0.96 },
  lexend: { label: 'Lexend', family: 'Lexend', note: 'Wide and easy to track', scale: 0.92 },
  courier: { label: 'Courier', family: 'Courier Prime', note: 'A typewritten manuscript', scale: 0.94 },
  dyslexic: { label: 'OpenDyslexic', family: 'OpenDyslexic', note: 'Dyslexia-friendly', scale: 0.9 },
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'book',
  font: 'literata',
  fontSize: 19,
  lineSpacing: 1.5,
  margins: 0.08,
  justify: true,
  theme: 'amber',
  paper: 'modern',
  cover: 'cloth',
  desk: 'wood',
  night: false,
  quality: 'auto',
  columns: 3,
}

export interface ThemeLook {
  label: string
  background: string
  text: string
  muted: string
  /** two shades of one colour that glow through the background */
  glows: [string, string]
  /** the frosted pane behind the text */
  pane: string
  /** the bright rim of the pane */
  edge: string
  dark: boolean
}

export const THEMES: Record<Theme, ThemeLook> = {
  amber: { label: 'Amber', background: '#130e08', text: '#eddcbd', muted: '#96825f', glows: ['#7a4a10', '#40220a'], pane: 'rgb(255 176 80 / 0.07)', edge: 'rgb(255 205 130 / 0.2)', dark: true },
  midnight: { label: 'Midnight', background: '#0a0e18', text: '#d8dfec', muted: '#778399', glows: ['#1f3f86', '#141f4a'], pane: 'rgb(130 165 255 / 0.07)', edge: 'rgb(170 198 255 / 0.18)', dark: true },
  forest: { label: 'Forest', background: '#0a110c', text: '#dbe5d6', muted: '#7f8f7c', glows: ['#1f5230', '#12301f'], pane: 'rgb(130 220 150 / 0.06)', edge: 'rgb(170 230 180 / 0.16)', dark: true },
  dark: { label: 'Charcoal', background: '#151413', text: '#d9d4cb', muted: '#85807a', glows: ['#34312d', '#232120'], pane: 'rgb(255 255 255 / 0.04)', edge: 'rgb(255 255 255 / 0.1)', dark: true },
  sepia: { label: 'Sepia', background: '#f1e6d0', text: '#3a2c1c', muted: '#8f7a5c', glows: ['#eeba7c', '#e9cf9a'], pane: 'rgb(255 248 232 / 0.5)', edge: 'rgb(255 250 238 / 0.8)', dark: false },
  light: { label: 'Light', background: '#f8f6f1', text: '#1c1a17', muted: '#8a857c', glows: ['#f1dcc0', '#e9e3d6'], pane: 'rgb(255 255 255 / 0.55)', edge: 'rgb(255 255 255 / 0.9)', dark: false },
}

export interface Preset {
  id: string
  label: string
  description: string
  apply: Partial<Appearance>
}

export const PRESETS: Preset[] = [
  { id: 'old-library', label: 'Old Library', description: 'Leather, aged paper, a wooden desk', apply: { mode: 'book', cover: 'leather', paper: 'aged', desk: 'wood', font: 'garamond', night: false } },
  { id: 'night-light', label: 'Night Light', description: 'A dark room and one warm lamp', apply: { mode: 'book', night: true, cover: 'oxblood', paper: 'cream', desk: 'dark', font: 'crimson' } },
  { id: 'linen-morning', label: 'Linen Morning', description: 'Bright paper in a linen binding', apply: { mode: 'book', cover: 'linen', paper: 'modern', desk: 'linen', font: 'literata', night: false } },
  { id: 'scriptorium', label: 'Scriptorium', description: 'Vellum, old type and cold stone', apply: { mode: 'book', cover: 'black', paper: 'manuscript', desk: 'stone', font: 'fell', night: false } },
  { id: 'midnight-study', label: 'Midnight Study', description: 'Dark, quiet and easy on the eyes', apply: { mode: 'plain', theme: 'midnight', font: 'literata', lineSpacing: 1.6 } },
  { id: 'newsprint', label: 'Newsprint', description: 'Your book as the morning paper', apply: { mode: 'newspaper', font: 'lora', columns: 3 } },
]
