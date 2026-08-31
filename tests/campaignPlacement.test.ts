import { describe, expect, it } from 'vitest'
import { tvFromDiagonalInches, getCatalogItem, DEFAULT_PRODUCT_ID, CATALOG } from '../src/campaign/catalog'
import {
  clampCentreMm,
  floorToBottomMm,
  ceilingToTopMm,
  zoneRelation,
  formatMm,
  yFracFromFloor,
  pxPerMm,
  SEATED_EYE_MM,
} from '../src/campaign/placementMath'

describe('tvFromDiagonalInches', () => {
  it('sizes a 65" 16:9 panel in millimetres', () => {
    const size = tvFromDiagonalInches(65)
    expect(size.widthMm).toBeGreaterThan(1400)
    expect(size.heightMm).toBeGreaterThan(800)
    expect(size.widthMm / size.heightMm).toBeCloseTo(16 / 9, 2)
  })
})

describe('catalog', () => {
  it('defaults to the 65 inch TV', () => {
    expect(getCatalogItem(DEFAULT_PRODUCT_ID).shortLabel).toBe('65"')
  })

  it('covers every product kind', () => {
    const kinds = new Set(CATALOG.map((item) => item.kind))
    expect([...kinds].sort()).toEqual(['art', 'soundbar', 'speaker', 'tv', 'video-wall'])
  })
})

describe('placement math', () => {
  it('computes floor and ceiling clearances from centre', () => {
    expect(floorToBottomMm(1100, 800)).toBe(700)
    expect(ceilingToTopMm(2400, 1100, 800)).toBe(900)
  })

  it('clamps a centre that would pass through the floor', () => {
    expect(clampCentreMm(100, 2400, 800)).toBe(420)
  })

  it('labels the seated-eye recommended zone', () => {
    expect(zoneRelation(SEATED_EYE_MM)).toBe('in')
    expect(zoneRelation(1400)).toBe('above')
    expect(zoneRelation(800)).toBe('below')
  })

  it('formats millimetres for en-AU', () => {
    expect(formatMm(1100)).toBe('1,100 mm')
  })

  it('maps floor millimetres onto a calibrated photo', () => {
    expect(yFracFromFloor(2400, 2400, 0, 1)).toBe(0)
    expect(yFracFromFloor(0, 2400, 0, 1)).toBe(1)
    expect(yFracFromFloor(1200, 2400, 0, 1)).toBe(0.5)
  })

  it('derives pixels per millimetre from the photo span', () => {
    expect(pxPerMm(2400, 0, 1, 2400)).toBe(1)
  })
})
