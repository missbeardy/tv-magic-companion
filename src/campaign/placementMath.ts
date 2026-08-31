export const DEFAULT_CEILING_MM = 2400
export const DEFAULT_WALL_WIDTH_MM = 4200
export const DEFAULT_VIEWING_DISTANCE_MM = 3200
export const SEATED_EYE_MM = 1100
export const ZONE_HALF_MM = 150
export const EDGE_MARGIN_MM = 20

export type ZoneRelation = 'above' | 'in' | 'below'

export function floorToBottomMm(centreMm: number, productHeightMm: number): number {
  return centreMm - productHeightMm / 2
}

export function ceilingToTopMm(
  ceilingMm: number,
  centreMm: number,
  productHeightMm: number
): number {
  return ceilingMm - (centreMm + productHeightMm / 2)
}

export function clampCentreMm(
  centreMm: number,
  ceilingMm: number,
  productHeightMm: number,
  marginMm = EDGE_MARGIN_MM
): number {
  const min = productHeightMm / 2 + marginMm
  const max = ceilingMm - productHeightMm / 2 - marginMm
  if (max <= min) return ceilingMm / 2
  return Math.min(max, Math.max(min, centreMm))
}

export function zoneRelation(centreMm: number): ZoneRelation {
  if (centreMm < SEATED_EYE_MM - ZONE_HALF_MM) return 'below'
  if (centreMm > SEATED_EYE_MM + ZONE_HALF_MM) return 'above'
  return 'in'
}

export function zoneLabel(relation: ZoneRelation): string {
  if (relation === 'in') return 'On the ideal spot'
  if (relation === 'above') return 'Too high — drag down'
  return 'Too low — drag up'
}

export function formatMm(mm: number): string {
  return `${new Intl.NumberFormat('en-AU').format(Math.round(mm))} mm`
}

/** Image Y fraction (0 = top) for a height measured from the floor. */
export function yFracFromFloor(
  mmFromFloor: number,
  ceilingHeightMm: number,
  ceilingY: number,
  floorY: number
): number {
  if (ceilingHeightMm <= 0) return ceilingY
  const fromCeiling = ceilingHeightMm - mmFromFloor
  return ceilingY + (fromCeiling / ceilingHeightMm) * (floorY - ceilingY)
}

export function pxPerMm(
  displayHeightPx: number,
  ceilingY: number,
  floorY: number,
  ceilingHeightMm: number
): number {
  if (ceilingHeightMm <= 0) return 0
  return (displayHeightPx * (floorY - ceilingY)) / ceilingHeightMm
}
