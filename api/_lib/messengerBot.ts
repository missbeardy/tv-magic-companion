import type { SupabaseClient } from '@supabase/supabase-js'
import { ingestParsedFacebookLead } from './handleInboundFacebookLead.js'
import { interpretMessengerWithClaude } from './messengerClaude.js'
import { sendMessengerText } from './messengerGraph.js'
import {
  loadOrCreateMessengerSession,
  saveMessengerSession,
} from './messengerSession.js'
import {
  appendMessages,
  extractCaptureFromText,
  reduceMessengerTurn,
  type MessengerCapture,
  type MessengerSession,
} from './messengerTurn.js'

async function orgSlugForId(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase.from('orgs').select('slug').eq('id', orgId).maybeSingle()
  return data?.slug ?? null
}

export async function pageAccessTokenFor(
  supabase: SupabaseClient,
  pageId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('org_facebook_pages')
    .select('page_access_token')
    .eq('page_id', pageId)
    .maybeSingle()
  const fromRow = typeof data?.page_access_token === 'string' ? data.page_access_token.trim() : ''
  return fromRow || process.env.META_PAGE_ACCESS_TOKEN?.trim() || null
}

async function submitSessionLead(
  supabase: SupabaseClient,
  session: MessengerSession
): Promise<string | null> {
  const slug = await orgSlugForId(supabase, session.org_id)
  if (!slug || !session.name || !session.phone) return null

  const result = await ingestParsedFacebookLead(
    supabase,
    {
      org: slug,
      name: session.name,
      phone: session.phone,
      message: '',
      city: session.suburb,
      email: null,
      website: null,
      channel: 'messenger',
      conversation_id: session.conversation_id,
      suburb: session.suburb,
      service_needed: session.service_needed,
      out_of_area: session.out_of_area,
    },
    {
      source: 'native_messenger',
      conversation_id: session.conversation_id,
      page_id: session.page_id,
      psid: session.psid,
    }
  )

  if ('success' in result && result.success) return result.lead_id
  console.error('Native Messenger lead ingest did not succeed', result)
  return null
}

export async function deliverMessengerReplies(opts: {
  supabase: SupabaseClient
  pageId: string
  psid: string
  replies: string[]
}): Promise<void> {
  const token = await pageAccessTokenFor(opts.supabase, opts.pageId)
  if (!token) {
    console.error('No page access token for Messenger send', opts.pageId)
    return
  }
  const appSecret = process.env.META_APP_SECRET
  for (const text of opts.replies) {
    await sendMessengerText({
      pageId: opts.pageId,
      psid: opts.psid,
      text,
      pageAccessToken: token,
      appSecret,
    })
  }
}

export async function handleMessengerUserMessage(
  supabase: SupabaseClient,
  orgId: string,
  pageId: string,
  psid: string,
  userText: string,
  nowMs = Date.now()
): Promise<{ replies: string[]; submitted: boolean; leadId: string | null }> {
  let session = await loadOrCreateMessengerSession(supabase, orgId, pageId, psid)
  const regexCapture = extractCaptureFromText(userText)
  let capture: MessengerCapture = regexCapture
  let conversationalReply: string | null = null

  if (session.state === 'open') {
    const interpreted = await interpretMessengerWithClaude({ session, userText })
    if (interpreted) {
      conversationalReply = interpreted.reply
      capture = {
        name: interpreted.capture.name || regexCapture.name,
        phone: interpreted.capture.phone || regexCapture.phone,
        suburb: interpreted.capture.suburb || regexCapture.suburb,
        service_needed: interpreted.capture.service_needed || regexCapture.service_needed,
        out_of_area: interpreted.capture.out_of_area || regexCapture.out_of_area,
      }
    }
  }

  const turned = reduceMessengerTurn(session, userText, nowMs, capture, conversationalReply)
  session = appendMessages(turned.session, userText, turned.replies)

  let leadId: string | null = session.lead_id
  if (turned.submit) {
    leadId = await submitSessionLead(supabase, session)
    session = { ...session, lead_id: leadId }
  }

  await saveMessengerSession(supabase, session)

  if (turned.replies.length > 0) {
    await deliverMessengerReplies({
      supabase,
      pageId,
      psid,
      replies: turned.replies,
    })
  }

  return { replies: turned.replies, submitted: turned.submit, leadId }
}
