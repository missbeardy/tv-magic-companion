import type { SupabaseClient } from '@supabase/supabase-js'
import {
  conversationIdForPageUser,
  type MessengerMessage,
  type MessengerSession,
  type MessengerSessionState,
} from './messengerTurn.js'

interface SessionRow {
  id: string
  org_id: string
  page_id: string
  psid: string
  conversation_id: string
  state: MessengerSessionState
  name: string | null
  phone: string | null
  suburb: string | null
  service_needed: string | null
  out_of_area: boolean
  phone_ask_count: number
  awaiting_suburb_until: string | null
  lead_id: string | null
  messages: MessengerMessage[] | null
}

function rowToSession(row: SessionRow): MessengerSession {
  return {
    ...row,
    messages: Array.isArray(row.messages) ? row.messages : [],
  }
}

export async function loadOrCreateMessengerSession(
  supabase: SupabaseClient,
  orgId: string,
  pageId: string,
  psid: string
): Promise<MessengerSession> {
  const { data: existing, error } = await supabase
    .from('messenger_sessions')
    .select(
      'id, org_id, page_id, psid, conversation_id, state, name, phone, suburb, service_needed, out_of_area, phone_ask_count, awaiting_suburb_until, lead_id, messages'
    )
    .eq('page_id', pageId)
    .eq('psid', psid)
    .maybeSingle()

  if (error) throw error
  if (existing) return rowToSession(existing as SessionRow)

  const conversationId = conversationIdForPageUser(pageId, psid)
  const insert = {
    org_id: orgId,
    page_id: pageId,
    psid,
    conversation_id: conversationId,
    state: 'open' as const,
    messages: [] as MessengerMessage[],
  }
  const { data: created, error: insertError } = await supabase
    .from('messenger_sessions')
    .insert(insert)
    .select(
      'id, org_id, page_id, psid, conversation_id, state, name, phone, suburb, service_needed, out_of_area, phone_ask_count, awaiting_suburb_until, lead_id, messages'
    )
    .single()

  if (insertError) throw insertError
  return rowToSession(created as SessionRow)
}

export async function saveMessengerSession(
  supabase: SupabaseClient,
  session: MessengerSession
): Promise<void> {
  const { error } = await supabase
    .from('messenger_sessions')
    .update({
      state: session.state,
      name: session.name,
      phone: session.phone,
      suburb: session.suburb,
      service_needed: session.service_needed,
      out_of_area: session.out_of_area,
      phone_ask_count: session.phone_ask_count,
      awaiting_suburb_until: session.awaiting_suburb_until,
      lead_id: session.lead_id,
      messages: session.messages,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  if (error) throw error
}

export async function listExpiredSuburbSessions(
  supabase: SupabaseClient,
  nowIso: string
): Promise<MessengerSession[]> {
  const { data, error } = await supabase
    .from('messenger_sessions')
    .select(
      'id, org_id, page_id, psid, conversation_id, state, name, phone, suburb, service_needed, out_of_area, phone_ask_count, awaiting_suburb_until, lead_id, messages'
    )
    .eq('state', 'awaiting_suburb')
    .lt('awaiting_suburb_until', nowIso)
    .limit(50)

  if (error) throw error
  return (data ?? []).map((row) => rowToSession(row as SessionRow))
}
