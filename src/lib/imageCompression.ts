export interface CompressOptions {
  /** Longest edge in pixels. Larger images are scaled down to this. */
  maxDim?: number
  /** JPEG quality 0–1. */
  quality?: number
}

const DEFAULTS: Required<CompressOptions> = { maxDim: 1600, quality: 0.8 }

/**
 * Target dimensions that fit within a `maxDim` square while preserving aspect
 * ratio. Images already within bounds are returned unchanged. Pure/testable.
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height }
  const longest = Math.max(width, height)
  if (longest <= maxDim) return { width, height }
  const scale = maxDim / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Downscale + re-encode a photo to JPEG before upload so field phones don't push
 * ~10 MB originals over 3G. Falls back to the original file on any failure, for
 * non-raster types (gif/svg), or when the result isn't actually smaller — so the
 * user never loses the photo to a compression edge case.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDim, quality } = { ...DEFAULTS, ...opts }

  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file
  }
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, maxDim)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob || blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
