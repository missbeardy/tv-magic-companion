import { describe, expect, it } from 'vitest'
import { computeTargetDimensions, compressImage } from '../src/lib/imageCompression'

describe('computeTargetDimensions', () => {
  it('leaves images within bounds unchanged', () => {
    expect(computeTargetDimensions(1200, 900, 1600)).toEqual({ width: 1200, height: 900 })
    expect(computeTargetDimensions(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('scales a landscape image down by its longest edge', () => {
    expect(computeTargetDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('scales a portrait image down by its longest edge', () => {
    expect(computeTargetDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('guards against zero/negative dimensions', () => {
    expect(computeTargetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})

describe('compressImage (fallback behaviour)', () => {
  it('returns the original for non-raster types', async () => {
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })
    expect(await compressImage(svg)).toBe(svg)
    const gif = new File(['g'], 'x.gif', { type: 'image/gif' })
    expect(await compressImage(gif)).toBe(gif)
  })

  it('returns the original when no canvas is available (non-browser env)', async () => {
    // Test runs under the node environment: document/createImageBitmap are absent,
    // so compression must degrade gracefully rather than throw or lose the file.
    const jpg = new File(['\xff\xd8data'], 'photo.jpg', { type: 'image/jpeg' })
    expect(await compressImage(jpg)).toBe(jpg)
  })
})
