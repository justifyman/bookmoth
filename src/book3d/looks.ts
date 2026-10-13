// The covers and the surfaces under the book as plain data, kept apart from the 3D
// scene so the menus can list them without loading the 3D engine.

export type CoverKind = 'leather' | 'oxblood' | 'black' | 'green' | 'navy' | 'cloth' | 'linen' | 'velvet' | 'damask'
export type DeskKind = 'wood' | 'worn' | 'dark' | 'oak' | 'walnut' | 'stone' | 'slate' | 'hessian' | 'wool' | 'linen' | 'baize' | 'velvet' | 'damask' | 'leather'

export interface CoverSpec {
  label: string
  /** scanned texture set in public/assets/textures; several covers can share one */
  folder: string
  /** texture repeats per scene unit */
  repeat: number
  /** multiplies the scanned colour */
  tint: string
  /** 0 keeps the scanned colour, 1 uses only its brightness (so `tint` sets the hue) */
  gray: number
  /** how strongly edges and corners are rubbed */
  wear: number
  normalScale: number
  /** 1 for metal foil in the stamped title, 0 for a blind stamp */
  foil: number
  /** colour laid over the texture in the menu's swatch, for tinted covers */
  swatch?: string
}

export const COVERS: Record<CoverKind, CoverSpec> = {
  leather: { label: 'Leather', folder: 'brown_leather', repeat: 0.62, tint: '#b98f7c', gray: 0, wear: 1, normalScale: 1.3, foil: 1 },
  oxblood: { label: 'Oxblood', folder: 'leather_white', repeat: 0.7, tint: '#c23a34', gray: 1, wear: 0.9, normalScale: 1.4, foil: 1, swatch: '#7a2420' },
  black: { label: 'Black leather', folder: 'leather_white', repeat: 0.7, tint: '#3b3835', gray: 1, wear: 1, normalScale: 1.5, foil: 1, swatch: '#22201e' },
  green: { label: 'Green leather', folder: 'leather_white', repeat: 0.7, tint: '#4f8a62', gray: 1, wear: 0.9, normalScale: 1.4, foil: 1, swatch: '#2f5a3d' },
  navy: { label: 'Navy leather', folder: 'leather_white', repeat: 0.7, tint: '#3f62a8', gray: 1, wear: 0.9, normalScale: 1.4, foil: 1, swatch: '#263c68' },
  cloth: { label: 'Cloth', folder: 'book_pattern', repeat: 0.5, tint: '#ffffff', gray: 0, wear: 0.8, normalScale: 1.6, foil: 1 },
  linen: { label: 'Linen', folder: 'rough_linen', repeat: 0.55, tint: '#f2cf9c', gray: 1, wear: 0.55, normalScale: 1.8, foil: 0, swatch: '#d9b98a' },
  velvet: { label: 'Velvet', folder: 'velour_velvet', repeat: 0.5, tint: '#d8c4c4', gray: 0, wear: 0.5, normalScale: 1.2, foil: 1 },
  damask: { label: 'Damask', folder: 'floral_jacquard', repeat: 0.42, tint: '#ffffff', gray: 0, wear: 0.6, normalScale: 1.5, foil: 1 },
}

export interface DeskSpec {
  label: string
  folder: string
  /** how many scene units one tile of the texture covers */
  tile: number
  roughness: number
  /** multiplies the scanned colour */
  color: string
  /** strength of the scanned surface relief */
  relief: number
}

export const DESKS: Record<DeskKind, DeskSpec> = {
  wood: { label: 'Wood desk', folder: 'wood_table_001', tile: 9, roughness: 0.5, color: '#b9b0aa', relief: 0.5 },
  worn: { label: 'Worn wood', folder: 'wood_table_worn', tile: 9, roughness: 0.68, color: '#b9b0aa', relief: 0.5 },
  dark: { label: 'Mahogany', folder: 'dark_wood', tile: 11, roughness: 0.42, color: '#a89c96', relief: 0.5 },
  oak: { label: 'Pale oak', folder: 'oak_veneer_01', tile: 10, roughness: 0.5, color: '#b5aca2', relief: 0.5 },
  walnut: { label: 'Walnut', folder: 'american_walnut_veneer', tile: 7, roughness: 0.46, color: '#b0a69e', relief: 0.5 },
  stone: { label: 'Limestone', folder: 'marble_01', tile: 9, roughness: 0.6, color: '#9c948a', relief: 0.6 },
  slate: { label: 'Slate', folder: 'slate_floor_03', tile: 6.5, roughness: 0.7, color: '#9a9a9c', relief: 0.8 },
  hessian: { label: 'Woven cloth', folder: 'hessian_230', tile: 2.3, roughness: 0.95, color: '#b9b0aa', relief: 0.5 },
  wool: { label: 'Wool blanket', folder: 'poly_wool_herringbone', tile: 2.4, roughness: 1, color: '#a9a39c', relief: 0.8 },
  linen: { label: 'Linen cloth', folder: 'rough_linen', tile: 2.6, roughness: 0.95, color: '#c9b79a', relief: 0.6 },
  baize: { label: 'Green baize', folder: 'book_pattern', tile: 2.2, roughness: 1, color: '#8fa890', relief: 0.5 },
  velvet: { label: 'Red velvet', folder: 'velour_velvet', tile: 2.6, roughness: 1, color: '#8a7a7a', relief: 0.6 },
  damask: { label: 'Damask cloth', folder: 'floral_jacquard', tile: 2.8, roughness: 0.9, color: '#b0acb4', relief: 0.7 },
  leather: { label: 'Leather mat', folder: 'brown_leather', tile: 3.6, roughness: 0.62, color: '#8a7468', relief: 0.7 },
}
