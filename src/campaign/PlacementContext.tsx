import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { CATALOG, DEFAULT_PRODUCT_ID, getCatalogItem, type CatalogItem } from './catalog'
import {
  DEFAULT_CEILING_MM,
  DEFAULT_VIEWING_DISTANCE_MM,
  DEFAULT_WALL_WIDTH_MM,
  SEATED_EYE_MM,
  clampCentreMm,
  ceilingToTopMm,
  floorToBottomMm,
  zoneRelation,
} from './placementMath'
import {
  PlacementContext,
  type Calibration,
  type PlacementSnapshot,
  type ViewMode,
} from './usePlacement'

export function PlacementProvider({ children }: { children: ReactNode }) {
  const [productId, setProductIdState] = useState(DEFAULT_PRODUCT_ID)
  const [kindFilter, setKindFilter] = useState<CatalogItem['kind'] | 'all'>('tv')
  const [ceilingHeightMm, setCeilingRaw] = useState(DEFAULT_CEILING_MM)
  const [wallWidthMm, setWallWidthMm] = useState(DEFAULT_WALL_WIDTH_MM)
  const [viewingDistanceMm, setViewingDistanceMm] = useState(DEFAULT_VIEWING_DISTANCE_MM)
  const [centreRaw, setCentreRaw] = useState(SEATED_EYE_MM)
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [calibration, setCalibration] = useState<Calibration | null>(null)

  const product = getCatalogItem(productId)
  const centreHeightMm = clampCentreMm(centreRaw, ceilingHeightMm, product.heightMm)

  const setProductId = useCallback((id: string) => {
    setProductIdState(id)
    setKindFilter(getCatalogItem(id).kind)
  }, [])

  const setCeilingHeightMm = useCallback((mm: number) => {
    setCeilingRaw(Math.min(4000, Math.max(2100, Math.round(mm))))
  }, [])

  const setCentreHeightMm = useCallback((mm: number) => {
    setCentreRaw(mm)
  }, [])

  const setPhoto = useCallback((url: string | null, autoCalibrate = false) => {
    setPhotoUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
      return url
    })
    if (!url) {
      setCalibration(null)
      return
    }
    if (autoCalibrate) setCalibration({ ceilingY: 0.02, floorY: 0.98 })
  }, [])

  const visibleCatalog = useMemo(
    () => (kindFilter === 'all' ? CATALOG : CATALOG.filter((item) => item.kind === kindFilter)),
    [kindFilter]
  )

  const snapshot = useMemo<PlacementSnapshot>(
    () => ({
      product,
      ceilingHeightMm,
      wallWidthMm,
      viewingDistanceMm,
      centreHeightMm,
      floorToBottom: floorToBottomMm(centreHeightMm, product.heightMm),
      ceilingToTop: ceilingToTopMm(ceilingHeightMm, centreHeightMm, product.heightMm),
      zone: zoneRelation(centreHeightMm),
    }),
    [product, ceilingHeightMm, wallWidthMm, viewingDistanceMm, centreHeightMm]
  )

  const value = useMemo(
    () => ({
      product,
      productId,
      setProductId,
      kindFilter,
      setKindFilter,
      visibleCatalog,
      ceilingHeightMm,
      setCeilingHeightMm,
      wallWidthMm,
      setWallWidthMm,
      viewingDistanceMm,
      setViewingDistanceMm,
      centreHeightMm,
      setCentreHeightMm,
      viewMode,
      setViewMode,
      photoUrl,
      setPhoto,
      calibration,
      setCalibration,
      snapshot,
    }),
    [
      product,
      productId,
      setProductId,
      kindFilter,
      visibleCatalog,
      ceilingHeightMm,
      setCeilingHeightMm,
      wallWidthMm,
      viewingDistanceMm,
      centreHeightMm,
      setCentreHeightMm,
      viewMode,
      photoUrl,
      setPhoto,
      calibration,
      snapshot,
    ]
  )

  return <PlacementContext.Provider value={value}>{children}</PlacementContext.Provider>
}
