import { createContext, useContext } from 'react'
import type { CatalogItem } from './catalog'
import type { ZoneRelation } from './placementMath'

export type ViewMode = 'photo' | '3d'

export interface Calibration {
  ceilingY: number
  floorY: number
}

export interface PlacementSnapshot {
  product: CatalogItem
  ceilingHeightMm: number
  wallWidthMm: number
  viewingDistanceMm: number
  centreHeightMm: number
  floorToBottom: number
  ceilingToTop: number
  zone: ZoneRelation
}

export interface PlacementContextValue {
  product: CatalogItem
  productId: string
  setProductId: (id: string) => void
  kindFilter: CatalogItem['kind'] | 'all'
  setKindFilter: (kind: CatalogItem['kind'] | 'all') => void
  visibleCatalog: CatalogItem[]
  ceilingHeightMm: number
  setCeilingHeightMm: (mm: number) => void
  wallWidthMm: number
  setWallWidthMm: (mm: number) => void
  viewingDistanceMm: number
  setViewingDistanceMm: (mm: number) => void
  centreHeightMm: number
  setCentreHeightMm: (mm: number) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  photoUrl: string | null
  setPhoto: (url: string | null, autoCalibrate?: boolean) => void
  calibration: Calibration | null
  setCalibration: (cal: Calibration | null) => void
  snapshot: PlacementSnapshot
}

export const PlacementContext = createContext<PlacementContextValue | null>(null)

export function usePlacement(): PlacementContextValue {
  const ctx = useContext(PlacementContext)
  if (!ctx) throw new Error('usePlacement must be used inside PlacementProvider')
  return ctx
}
