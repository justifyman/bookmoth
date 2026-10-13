import type { Appearance } from '../appearance/settings'
import type { Anchor, BookContent } from '../model/document'

/** What the reader shell gives every reading mode. */
export interface ModeProps {
  content: BookContent
  title: string
  author: string
  appearance: Appearance
  /** where the reader is; the mode shows the page containing it */
  anchor: Anchor
  onAnchor: (anchor: Anchor) => void
  /** the middle of the page was tapped: show or hide the menus */
  onToggleChrome: () => void
  onLocation: (location: Location) => void
  /** lets a mode change the look itself (stepping the 3D quality down on a slow device) */
  onAppearance: (patch: Partial<Appearance>) => void
}

export interface Location {
  page: number
  pages: number
  /** size of body text on screen in CSS pixels, for the legibility check */
  textPx: number
  /** what a "page" is called in this mode */
  unit?: string
}

/** What every reading mode lets the shell do. */
export interface ModeHandle {
  next: () => void
  prev: () => void
  /** jumps to a page (or section) by number, counting from 0 */
  goTo: (page: number) => void
}
