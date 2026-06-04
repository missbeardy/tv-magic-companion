// src/hooks/useSocialPost.ts
const ZERNIO_API_KEY = import.meta.env.VITE_ZERNIO_API_KEY as string
const ZERNIO_IG_ACCOUNT_ID = import.meta.env.VITE_ZERNIO_IG_ACCOUNT_ID as string
const ZERNIO_FB_ACCOUNT_ID = import.meta.env.VITE_ZERNIO_FB_ACCOUNT_ID as string

interface PostInput {
  caption: string
  mediaUrl: string
  mediaType?: 'image' | 'video'
}

interface PostResult {
  success: boolean
  error?: string
}

export async function postToSocial({
  caption,
  mediaUrl,
  mediaType = 'image',
}: PostInput): Promise<PostResult> {
  try {
    const response = await fetch('https://zernio.com/api/v1/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZERNIO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: caption,
        mediaItems: [{ type: mediaType, url: mediaUrl }],
        platforms: [
          {
            platform: 'instagram',
            accountId: ZERNIO_IG_ACCOUNT_ID,
          },
          {
            platform: 'instagram',
            accountId: ZERNIO_IG_ACCOUNT_ID,
            platformSpecificData: { contentType: 'story' },
          },
          {
            platform: 'facebook',
            accountId: ZERNIO_FB_ACCOUNT_ID,
            platformSpecificData: { contentType: 'story' },
          },
        ],
        publishNow: true,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const message =
        (errorData as { message?: string }).message ?? `HTTP ${response.status}`
      return { success: false, error: `Zernio error: ${message}` }
    }

    return { success: true }
  } catch {
    return {
      success: false,
      error: 'Network error — check your API key and connection.',
    }
  }
}