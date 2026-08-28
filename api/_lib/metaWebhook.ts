import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { handleMessengerUserMessage } from './messengerBot.js'
import { captureServerException } from './sentry.js'

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = signatureHeader.slice('sha256='.length)
  const digest = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function resolveOrgIdFromFacebookPageId(
  supabase: SupabaseClient,
  pageId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('org_facebook_pages')
    .select('org_id')
    .eq('page_id', pageId)
    .maybeSingle()

  return data?.org_id ?? null
}

interface MessagingEvent {
  sender?: { id?: string }
  recipient?: { id?: string }
  message?: { text?: string; mid?: string; is_echo?: boolean }
}

async function processMessagingEvents(
  supabase: SupabaseClient,
  entries: Array<{ id?: string; messaging?: MessagingEvent[] }>
): Promise<void> {
  for (const entry of entries) {
    const pageId = entry.id ?? ''
    if (!pageId) continue
    const orgId = await resolveOrgIdFromFacebookPageId(supabase, pageId)
    if (!orgId) {
      console.warn('Meta Messenger: no org mapped for page', pageId)
      continue
    }

    const enabled = await isFeatureEnabledForOrg(orgId, 'inbound_messenger')
    if (!enabled) {
      console.log('Native Messenger skipped — inbound_messenger off', orgId)
      continue
    }

    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) continue
      const text = event.message?.text?.trim()
      const senderId = event.sender?.id
      if (!text || !senderId || senderId === pageId) continue

      try {
        await handleMessengerUserMessage(supabase, orgId, pageId, senderId, text)
      } catch (err) {
        console.error('Native Messenger turn failed', { pageId, senderId, err })
        captureServerException(err, { route: '/api/meta-webhook', pageId })
      }
    }
  }
}

/** GET verify + POST events for the native Messenger receptionist. */
export async function handleMetaWebhook(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient,
  rawBody: string
): Promise<void> {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN

    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      res.status(200).send(challenge)
      return
    }

    res.status(403).json({ error: 'Verification failed' })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('META_APP_SECRET not configured; rejecting Meta webhook')
    res.status(503).json({ error: 'Server not configured' })
    return
  }

  const sig = req.headers['x-hub-signature-256'] as string | undefined
  if (!verifyMetaWebhookSignature(rawBody, sig, appSecret)) {
    console.warn('Invalid Meta webhook signature')
    res.status(401).json({ error: 'Invalid signature' })
    return
  }

  let body: {
    object?: string
    entry?: Array<{ id?: string; messaging?: MessagingEvent[] }>
  }
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    res.status(400).json({ error: 'Invalid JSON' })
    return
  }

  if (body.object !== 'page') {
    res.status(200).json({ received: true, skipped: 'not_page' })
    return
  }

  try {
    await processMessagingEvents(supabase, body.entry ?? [])
  } catch (err) {
    console.error('Native Messenger batch failed', err)
    captureServerException(err, { route: '/api/meta-webhook' })
  }
  res.status(200).json({ received: true })
}
