interface SocialPostPayload {
  caption: string
  mediaUrl: string
}

interface SocialPostResult {
  success: boolean
  error?: string
}

export async function postToSocial(
  payload: SocialPostPayload
): Promise<SocialPostResult> {
  try {
    const platforms = []

    // Add Instagram if account ID is configured
    if (import.meta.env.VITE_ZERNIO_IG_ACCOUNT_ID) {
      platforms.push({
        platform: 'instagram',
        accountId: import.meta.env.VITE_ZERNIO_IG_ACCOUNT_ID,
      })
    }

    // Add Facebook if account ID is configured
    if (import.meta.env.VITE_ZERNIO_FB_ACCOUNT_ID) {
      platforms.push({
        platform: 'facebook',
        accountId: import.meta.env.VITE_ZERNIO_FB_ACCOUNT_ID,
      })
    }

    if (platforms.length === 0) {
      return {
        success: false,
        error: 'No social accounts configured. Add account IDs to .env.local',
      }
    }

    const response = await fetch('https://zernio.com/api/v1/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_ZERNIO_API_KEY}`,
      },
      body: JSON.stringify({
        content: payload.caption,
        platforms,
        mediaItems: [
          {
            type: 'image',
            url: payload.mediaUrl,
          },
        ],
        publishNow: true,
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return {
        success: false,
        error: err.error ?? `Posting failed (${response.status})`,
      }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: 'Network error — please try again.' }
  }
}