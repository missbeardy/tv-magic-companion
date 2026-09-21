import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneCandidates } from './phone.js'

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000
const THREAD_WINDOW_DAYS = 14
const CLOSED_THREAD_STATUSES = ['completed', 'lost', 'booking_cancelled'] as const
/** New Messenger agent retries — not used by the live structured bot (no conversation_id). */
const MESSENGER_DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000

/** Find an existing lead for the same phone + org within the last 24 hours. */
export async function findRecentLeadByPhone(
  supabase: SupabaseClient,
  phone: string,
  orgId: string | null
): Promise<{ id: string; name: string | null; extraction_status: string | null } | null> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const { data } = await supabase
    .from('leads')
    .select('id, name, extraction_status')
    .eq('phone', phone)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('created_at', since)
    .maybeSingle()

  return data ?? null
}

export async function findRecentLeadByEmail(
  supabase: SupabaseClient,
  email: string,
  orgId: string | null
): Promise<{ id: string; name: string | null; extraction_status: string | null } | null> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const { data } = await supabase
    .from('leads')
    .select('id, name, extraction_status')
    .eq('email', email)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0] ?? null
}

export function isAutomatedInboundEmail(
  headers: Record<string, string> | undefined,
  subject: string
): boolean {
  const headerValue = (name: string): string => {
    if (!headers) return ''
    const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
    return found ? String(found[1]) : ''
  }
  const auto = headerValue('auto-submitted').toLowerCase()
  if (auto && auto !== 'no') return true
  const precedence = headerValue('precedence').toLowerCase()
  if (['bulk', 'auto_reply', 'junk'].includes(precedence)) return true
  return /^(automatic reply|out of office|ooo:|delivery status notification|undeliverable|mail delivery failed)/i.test(
    subject.trim()
  )
}

export interface OpenLeadByPhone {
  id: string
  assigned_to: string | null
}

/** Most recent open lead for this phone — used to thread inbound SMS replies. */
export async function findOpenLeadByPhone(
  supabase: SupabaseClient,
  phone: string,
  orgId: string,
  windowDays = THREAD_WINDOW_DAYS
): Promise<OpenLeadByPhone | null> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const candidates = phoneCandidates(phone)
  const { data } = await supabase
    .from('leads')
    .select('id, assigned_to')
    .eq('org_id', orgId)
    .in('phone', candidates.length ? candidates : [phone])
    .is('deleted_at', null)
    .not('status', 'in', `(${CLOSED_THREAD_STATUSES.join(',')})`)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0] ?? null
}

/** Botpress conversation ids are opaque; reject anything that could break a JSON/SQL filter. */
export function parseConversationId(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || raw.length > 128) return null
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) return null
  return raw
}

function conversationIdFromRawEmail(rawEmail: string | null | undefined, conversationId: string): boolean {
  if (!rawEmail) return false
  try {
    const parsed = JSON.parse(rawEmail) as { conversation_id?: unknown }
    return parseConversationId(parsed.conversation_id) === conversationId
  } catch {
    return false
  }
}

/**
 * Dedupe for the Gen-AI Messenger agent only.
 * Returns null when `conversationId` is missing so the live structured Botpress
 * payload is unchanged (no phone-window merge, no extra query).
 */
export async function findDuplicateFacebookMessengerLead(
  supabase: SupabaseClient,
  orgId: string,
  source: string,
  conversationId: string | null,
  phone: string
): Promise<{ id: string } | null> {
  if (!conversationId) return null

  const since = new Date(Date.now() - MESSENGER_DEDUP_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from('leads')
    .select('id, raw_email, phone')
    .eq('org_id', orgId)
    .eq('source', source)
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error || !data?.length) return null

  const byConversation = data.find((row) =>
    conversationIdFromRawEmail(row.raw_email, conversationId)
  )
  if (byConversation?.id) return { id: byConversation.id }

  const byPhone = data.find((row) => row.phone === phone)
  return byPhone?.id ? { id: byPhone.id } : null
}
