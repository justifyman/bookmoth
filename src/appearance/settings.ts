import type { CoverKind, DeskKind } from '../book3d/Scene'
import type { Quality } from '../book3d/quality'
import type { PaperStyle } from '../book3d/paper'

export type ReadingMode = 'plain' | 'book' | 'newspaper'
export type Theme = 'light' | 'sepia' | 'dark'

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
  quality: Quality | 'auto'
  // Newspaper
  columns: number
}

export type FontId = 'garamond' | 'literata' | 'lora' | 'atkinson' | 'inter' | 'dyslexic'

export const FONTS: Record<FontId, { label: string; family: string; note: string; scale: number }> = {
  garamond: { label: 'Garamond', family: 'EB Garamond', note: 'Classic book type', scale: 1.08 },
  literata: { label: 'Literata', family: 'Literata', note: 'Made for long reading', scale: 1 },
  lora: { label: 'Lora', family: 'Lora', note: 'Warm and bookish', scale: 1 },
  atkinson: { label: 'Atkinson', family: 'Atkinson Hyperlegible', note: 'Extra clear letter shapes', scale: 1 },
  inter: { label: 'Inter', family: 'Inter', note: 'Clean and modern', scale: 0.96 },
  dyslexic: { label: 'OpenDyslexic', family: 'OpenDyslexic', note: 'Dyslexia-friendly', scale: 0.9 },
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'plain',
  font: 'literata',
  fontSize: 19,
  lineSpacing: 1.5,
  margins: 0.08,
  justify: true,
  theme: 'sepia',
  paper: 'modern',
  cover: 'cloth',
  desk: 'wood',
  quality: 'auto',
  columns: 3,
}

export const THEMES: Record<Theme, { label: string; background: string; text: string; muted: string }> = {
  light: { label: 'Light', background: '#fbfaf7', text: '#1c1a17', muted: '#8a857c' },
  sepia: { label: 'Sepia', background: '#f3e9d5', text: '#3a2c1c', muted: '#9a8669' },
  dark: { label: 'Dark', background: '#16130f', text: '#d9cfbf', muted: '#7d7466' },
}

export interface Preset {
  id: string
  label: string
  description: string
  apply: Partial<Appearance>
}

export const PRESETS: Preset[] = [
  { id: 'old-library', label: 'Old Library', description: 'Leather, aged paper, a wooden desk', apply: { mode: 'book', cover: 'leather', paper: 'aged', desk: 'wood', font: 'garamond', theme: 'sepia' } },
  { id: 'midnight-study', label: 'Midnight Study', description: 'Dark, quiet and easy on the eyes', apply: { mode: 'plain', theme: 'dark', font: 'literata', lineSpacing: 1.6 } },
  { id: 'newsprint', label: 'Newsprint', description: 'Your book as the morning paper', apply: { mode: 'newspaper', font: 'lora', columns: 3 } },
  { id: 'linen-morning', label: 'Linen Morning', description: 'Bright paper in a linen binding', apply: { mode: 'book', cover: 'linen', paper: 'modern', desk: 'hessian', font: 'literata', theme: 'light' } },
]
