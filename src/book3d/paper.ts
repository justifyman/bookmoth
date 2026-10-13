// The paper styles as plain data, kept apart from the texture drawing so the menus
// can show them without loading the 3D engine.

export type PaperStyle = 'modern' | 'aged' | 'manuscript'

export interface PaperLook {
  label: string
  base: string
  ink: string
  /** light and dark tones of the page edges */
  edgeLight: string
  edgeDark: string
  /** 0..1 amounts */
  fibres: number
  foxing: number
  blotch: number
  edgeBurn: number
  burnColor: string
  roughness: number
}

export const PAPER: Record<PaperStyle, PaperLook> = {
  modern: {
    label: 'Bright paper',
    base: '#f3efe6',
    ink: '#16130f',
    edgeLight: '#f1ece1',
    edgeDark: '#cfc7b6',
    fibres: 0.25,
    foxing: 0,
    blotch: 0.15,
    edgeBurn: 0.05,
    burnColor: '#b9a888',
    roughness: 0.82,
  },
  aged: {
    label: 'Aged paper',
    base: '#e6d5ad',
    ink: '#2a1c10',
    edgeLight: '#d9c391',
    edgeDark: '#9c7f4c',
    fibres: 0.8,
    foxing: 0.8,
    blotch: 0.55,
    edgeBurn: 0.55,
    burnColor: '#8a5a24',
    roughness: 0.9,
  },
  manuscript: {
    label: 'Manuscript vellum',
    base: '#dcc79a',
    ink: '#2c180b',
    edgeLight: '#cdb27c',
    edgeDark: '#86683a',
    fibres: 0.3,
    foxing: 0.35,
    blotch: 0.6,
    edgeBurn: 0.75,
    burnColor: '#6e4a1f',
    roughness: 0.78,
  },
}
