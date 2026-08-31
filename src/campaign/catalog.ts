export type ProductKind = 'tv' | 'soundbar' | 'video-wall' | 'speaker' | 'art'

export interface CatalogItem {
  id: string
  kind: ProductKind
  label: string
  shortLabel: string
  widthMm: number
  heightMm: number
  depthMm: number
  cols?: number
  rows?: number
}

export const PRODUCT_KINDS: { id: ProductKind; label: string }[] = [
  { id: 'tv', label: 'TVs' },
  { id: 'soundbar', label: 'Soundbars' },
  { id: 'video-wall', label: 'Video walls' },
  { id: 'speaker', label: 'Speakers' },
  { id: 'art', label: 'Art' },
]

/** 16:9 panel from a diagonal in inches. */
export function tvFromDiagonalInches(inches: number): { widthMm: number; heightMm: number } {
  const diagMm = inches * 25.4
  const aspect = 16 / 9
  const heightMm = diagMm / Math.sqrt(aspect * aspect + 1)
  const widthMm = heightMm * aspect
  return { widthMm: Math.round(widthMm), heightMm: Math.round(heightMm) }
}

function tv(inches: number): CatalogItem {
  const size = tvFromDiagonalInches(inches)
  return {
    id: `tv-${inches}`,
    kind: 'tv',
    label: `${inches}" TV`,
    shortLabel: `${inches}"`,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    depthMm: 70,
  }
}

function videoWall(inches: number, cols: number, rows: number): CatalogItem {
  const cell = tvFromDiagonalInches(inches)
  const gap = 8
  return {
    id: `wall-${cols}x${rows}-${inches}`,
    kind: 'video-wall',
    label: `${cols}×${rows} video wall`,
    shortLabel: `${cols}×${rows}`,
    widthMm: cell.widthMm * cols + gap * (cols - 1),
    heightMm: cell.heightMm * rows + gap * (rows - 1),
    depthMm: 70,
    cols,
    rows,
  }
}

export const CATALOG: CatalogItem[] = [
  tv(43),
  tv(50),
  tv(55),
  tv(65),
  tv(75),
  tv(85),
  tv(98),
  {
    id: 'soundbar-compact',
    kind: 'soundbar',
    label: 'Compact soundbar',
    shortLabel: 'Compact',
    widthMm: 800,
    heightMm: 64,
    depthMm: 90,
  },
  {
    id: 'soundbar-cinema',
    kind: 'soundbar',
    label: 'Cinema soundbar',
    shortLabel: 'Cinema',
    widthMm: 1200,
    heightMm: 72,
    depthMm: 110,
  },
  videoWall(55, 2, 2),
  videoWall(55, 3, 3),
  {
    id: 'speaker-onwall',
    kind: 'speaker',
    label: 'On-wall speaker',
    shortLabel: 'On-wall',
    widthMm: 200,
    heightMm: 400,
    depthMm: 120,
  },
  {
    id: 'speaker-column',
    kind: 'speaker',
    label: 'Column speaker',
    shortLabel: 'Column',
    widthMm: 250,
    heightMm: 600,
    depthMm: 140,
  },
  {
    id: 'art-landscape',
    kind: 'art',
    label: 'Landscape frame',
    shortLabel: 'Landscape',
    widthMm: 900,
    heightMm: 600,
    depthMm: 40,
  },
  {
    id: 'art-portrait',
    kind: 'art',
    label: 'Portrait frame',
    shortLabel: 'Portrait',
    widthMm: 600,
    heightMm: 900,
    depthMm: 40,
  },
  {
    id: 'art-square',
    kind: 'art',
    label: 'Square frame',
    shortLabel: 'Square',
    widthMm: 800,
    heightMm: 800,
    depthMm: 40,
  },
]

export const DEFAULT_PRODUCT_ID = 'tv-65'

export function getCatalogItem(id: string): CatalogItem {
  return CATALOG.find((item) => item.id === id) ?? CATALOG.find((item) => item.id === DEFAULT_PRODUCT_ID)!
}
