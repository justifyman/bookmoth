// The paper styles as plain data, kept apart from the texture drawing so the menus
// can show them without loading the 3D engine.

export type PaperStyle = 'modern' | 'cool' | 'cream' | 'blush' | 'sage' | 'recycled' | 'pulp' | 'kraft' | 'aged' | 'antique' | 'parchment' | 'manuscript'

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
  cool: {
    label: 'Cool white paper',
    base: '#eceeec',
    ink: '#121416',
    edgeLight: '#eaecea',
    edgeDark: '#c2c6c4',
    fibres: 0.15,
    foxing: 0,
    blotch: 0.1,
    edgeBurn: 0,
    burnColor: '#b0b4b2',
    roughness: 0.78,
  },
  cream: {
    label: 'Cream paper',
    base: '#eee3c8',
    ink: '#1d1711',
    edgeLight: '#e9dcbd',
    edgeDark: '#c4b48d',
    fibres: 0.35,
    foxing: 0,
    blotch: 0.2,
    edgeBurn: 0.12,
    burnColor: '#b39c6c',
    roughness: 0.85,
  },
  blush: {
    label: 'Blush paper',
    base: '#f0dcd2',
    ink: '#231614',
    edgeLight: '#ecd5ca',
    edgeDark: '#c9aa9d',
    fibres: 0.3,
    foxing: 0,
    blotch: 0.2,
    edgeBurn: 0.1,
    burnColor: '#b98e80',
    roughness: 0.84,
  },
  sage: {
    label: 'Sage paper',
    base: '#dde3d0',
    ink: '#141a12',
    edgeLight: '#d6ddc7',
    edgeDark: '#aab59a',
    fibres: 0.3,
    foxing: 0,
    blotch: 0.2,
    edgeBurn: 0.1,
    burnColor: '#93a180',
    roughness: 0.84,
  },
  recycled: {
    label: 'Recycled paper',
    base: '#d9d5c8',
    ink: '#1a1917',
    edgeLight: '#d2cdbe',
    edgeDark: '#a59f8e',
    fibres: 1,
    foxing: 0.45,
    blotch: 0.35,
    edgeBurn: 0.15,
    burnColor: '#8d8672',
    roughness: 0.97,
  },
  pulp: {
    label: 'Paperback paper',
    base: '#dccfae',
    ink: '#251d13',
    edgeLight: '#d3c298',
    edgeDark: '#a8935f',
    fibres: 1,
    foxing: 0.15,
    blotch: 0.4,
    edgeBurn: 0.38,
    burnColor: '#9c7f45',
    roughness: 0.96,
  },
  kraft: {
    label: 'Kraft paper',
    base: '#c2a078',
    ink: '#1f1208',
    edgeLight: '#b89469',
    edgeDark: '#86633a',
    fibres: 1,
    foxing: 0.1,
    blotch: 0.45,
    edgeBurn: 0.25,
    burnColor: '#7a5528',
    roughness: 0.98,
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
  antique: {
    label: 'Tea-stained paper',
    base: '#d3b57e',
    ink: '#27160a',
    edgeLight: '#c7a468',
    edgeDark: '#7d5c2c',
    fibres: 0.6,
    foxing: 1,
    blotch: 0.9,
    edgeBurn: 1,
    burnColor: '#5c3a14',
    roughness: 0.92,
  },
  parchment: {
    label: 'Parchment',
    base: '#e3cf9d',
    ink: '#2a190b',
    edgeLight: '#d9c188',
    edgeDark: '#a48545',
    fibres: 0.45,
    foxing: 0.25,
    blotch: 0.75,
    edgeBurn: 0.5,
    burnColor: '#946a2a',
    roughness: 0.8,
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
