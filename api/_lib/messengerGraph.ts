import { createHmac } from 'crypto'

export async function sendMessengerText(opts: {
  pageId: string
  psid: string
  text: string
  pageAccessToken: string
  appSecret?: string
}): Promise<void> {
  const token = opts.pageAccessToken.trim()
  if (!token || !opts.text.trim()) return

  const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(opts.pageId)}/messages`)
  url.searchParams.set('access_token', token)
  if (opts.appSecret) {
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', opts.appSecret).update(token).digest('hex')
    )
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: opts.psid },
      messaging_type: 'RESPONSE',
      message: { text: opts.text.slice(0, 2000) },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Messenger Send API ${res.status}: ${body.slice(0, 300)}`)
  }
}
