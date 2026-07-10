import { supabase } from './supabase'

export const LEAD_PHOTOS_BUCKET = 'lead-photos'

/** Default TTL for in-app display (1 hour). */
export const LEAD_PHOTO_DISPLAY_TTL = 3600

/** Longer TTL when an external service (e.g. Zernio) must fetch the file. */
export const LEAD_PHOTO_POST_TTL = 7200

export async function signLeadPhotoPath(
  storagePath: string,
  expiresIn = LEAD_PHOTO_DISPLAY_TTL,
): Promise<string | null> {
  if (!storagePath) return null

  const { data, error } = await supabase.storage
    .from(LEAD_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error || !data?.signedUrl) {
    console.warn('Failed to sign lead photo URL:', error?.message ?? storagePath)
    return null
  }

  return data.signedUrl
}

export async function signLeadPhotoPaths(
  storagePaths: string[],
  expiresIn = LEAD_PHOTO_DISPLAY_TTL,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(storagePaths.filter(Boolean))]
  if (unique.length === 0) return result

  const { data, error } = await supabase.storage
    .from(LEAD_PHOTOS_BUCKET)
    .createSignedUrls(unique, expiresIn)

  if (error || !data) {
    console.warn('Failed to batch-sign lead photo URLs:', error?.message)
    return result
  }

  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      result.set(item.path, item.signedUrl)
    }
  }

  return result
}
