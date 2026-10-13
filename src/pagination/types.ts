import type { Anchor } from '../model/document'

export interface TypeSettings {
  /** CSS font family name */
  fontFamily: string
  /** body size in layout pixels */
  fontSize: number
  /** line height as a multiple of the font size */
  lineHeight: number
  justify: boolean
}

export interface PageGeometry {
  /** size of the text area in layout pixels */
  width: number
  height: number
  /**
   * Height available on a given page of a chapter, when it differs from `height`
   * (the newspaper's first columns sit under a headline, for example).
   */
  heightFor?: (indexInChapter: number) => number
  /** blank space above a chapter's opening heading, in body lines */
  chapterDrop?: number
  /** leave out a heading that opens a chapter, for modes that show the chapter title themselves */
  omitChapterHeading?: boolean
}

export interface Segment {
  text: string
  x: number
  width: number
  bold?: boolean
  italic?: boolean
}

interface ItemBase {
  /** top of the item within the text area */
  y: number
  height: number
  /** where in the book this item starts */
  block: number
  offset: number
}

export interface LineItem extends ItemBase {
  kind: 'line'
  /** font size of this line */
  size: number
  segments: Segment[]
  /** 0 for body text, otherwise the heading level */
  heading: 0 | 1 | 2 | 3
}

export interface ImageItem extends ItemBase {
  kind: 'image'
  x: number
  width: number
  blob: Blob
  alt: string
}

export interface OrnamentItem extends ItemBase {
  kind: 'ornament'
}

export type PageItem = LineItem | ImageItem | OrnamentItem

export interface Page {
  chapter: number
  indexInChapter: number
  start: Anchor
  items: PageItem[]
}
