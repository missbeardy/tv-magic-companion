import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ZERNIO_API_KEY
  const igAccountId = process.env.ZERNIO_IG_ACCOUNT_ID
  const fbAccountId = process.env.ZERNIO_FB_ACCOUNT_ID

  if (!apiKey) {
    return res.status(500).json({ error: 'Zernio API key not configured on server' })
  }

  const { caption, mediaUrl, mediaType = 'image', channels } = req.body

  if (!caption || !mediaUrl || !channels) {
    return res.status(400).json({ error: 'Missing required fields: caption, mediaUrl, channels' })
  }

  const platforms: object[] = []

  if (channels.igPost && igAccountId) {
    platforms.push({ platform: 'instagram', accountId: igAccountId })
  }
  if (channels.igStory && igAccountId) {
    platforms.push({ platform: 'instagram', accountId: igAccountId, platformSpecificData: { contentType: 'story' } })
  }
  if (channels.igReel && igAccountId) {
    platforms.push({ platform: 'instagram', accountId: igAccountId, platformSpecificData: { contentType: 'reel' } })
  }
  if (channels.fbPost && fbAccountId) {
    platforms.push({ platform: 'facebook', accountId: fbAccountId })
  }
  if (channels.fbStory && fbAccountId) {
    platforms.push({ platform: 'facebook', accountId: fbAccountId, platformSpecificData: { contentType: 'story' } })
  }

  if (platforms.length === 0) {
    return res.status(400).json({ error: 'No valid platforms selected' })
  }

  try {
    const response = await fetch('https://zernio.com/api/v1/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: caption,
        mediaItems: [{ type: mediaType, url: mediaUrl }],
        platforms,
        publishNow: true,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const message = (data as { message?: string }).message ?? `HTTP ${response.status}`
      return res.status(response.status).json({ error: `Zernio error: ${message}` })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Social post proxy error:', err)
    return res.status(500).json({ error: 'Network error contacting Zernio' })
  }
}