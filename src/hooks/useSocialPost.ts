// src/hooks/useSocialPost.ts
const ZERNIO_API_KEY = import.meta.env.VITE_ZERNIO_API_KEY as string
const ZERNIO_IG_ACCOUNT_ID = import.meta.env.VITE_ZERNIO_IG_ACCOUNT_ID as string
const ZERNIO_FB_ACCOUNT_ID = import.meta.env.VITE_ZERNIO_FB_ACCOUNT_ID as string

interface ChannelSelection {
  igPost: boolean
  igStory: boolean
  igReel: boolean
  fbPost: boolean
  fbStory: boolean
}

interface PostInput {
  caption: string
  mediaUrl: string
  mediaType?: 'image' | 'video'
  channels: ChannelSelection
}

interface PostResult {
  success: boolean
  error?: string
}

export async function postToSocial({
  caption,
  mediaUrl,
  mediaType = 'image',
  channels,
}: PostInput): Promise<PostResult> {
  const platforms = []

  if (channels.igPost) {
    platforms.push({ platform: 'instagram', accountId: ZERNIO_IG_ACCOUNT_ID })
  }
  if (channels.igStory) {
    platforms.push({
      platform: 'instagram',
      accountId: ZERNIO_IG_ACCOUNT_ID,
      platformSpecificData: { contentType: 'story' },
    })
  }
  if (channels.igReel) {
    platforms.push({
      platform: 'instagram',
      accountId: ZERNIO_IG_ACCOUNT_ID,
      platformSpecificData: { contentType: 'reel' },
    })
  }
  if (channels.fbPost) {
    platforms.push({ platform: 'facebook', accountId: ZERNIO_FB_ACCOUNT_ID })
  }
  if (channels.fbStory) {
    platforms.push({
      platform: 'facebook',
      accountId: ZERNIO_FB_ACCOUNT_ID,
      platformSpecificData: { contentType: 'story' },
    })
  }

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
        platforms,
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