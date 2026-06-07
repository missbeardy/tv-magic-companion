// src/hooks/useSocialPost.ts

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
  try {
    const response = await fetch('/api/social-post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ caption, mediaUrl, mediaType, channels }),
    })

    const data = await response.json()

    if (!response.ok) {
      const message = (data as { error?: string }).error ?? `HTTP ${response.status}`
      return { success: false, error: message }
    }

    return { success: true }
  } catch {
    return {
      success: false,
      error: 'Network error — could not reach posting service.',
    }
  }
}