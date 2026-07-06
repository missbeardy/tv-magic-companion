import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractCloudmailinRecipients,
  extractPlusTagsFromRecipients,
  type CloudmailinInboundPayload,
} from '../../shared/inboundEmailRouting.js'
import { resolveOrgIdFromDid } from './resolveOrgFromDid.js'

export type InboundEmailOrgResolution =
  | { orgId: string; tag: string | null; source: 'plus_tag' }
  | { orgId: null; tag: string | null; source: 'unresolved'; reason: 'unknown_tag' | 'no_tag' }

export type CloudmailinOrgResolution =
  | { orgId: string; tag: string | null; source: 'plus_tag' }
  | { orgId: string; tag: string | null; source: 'phone_mapping' }
  | { orgId: null; tag: string | null; source: 'unresolved'; reason: 'unknown_tag' | 'no_tag' | 'no_mapping' }

/** 3CX extensions (e.g. "166") are not E.164 — skip DID lookup for short numeric values. */
export function looksLikePhoneNumber(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10
}

/** Plus-tag first (CloudMailin forward), then optional DID when value looks like a real number. */
export async function resolveOrgIdFromCloudmailinWebhook(
  supabase: SupabaseClient,
  body: CloudmailinInboundPayload,
  didFallback?: string | null
): Promise<CloudmailinOrgResolution> {
  const emailRes = await resolveOrgIdFromInboundEmail(supabase, body)
  if (emailRes.source === 'plus_tag') {
    return emailRes
  }

  if (didFallback?.trim() && looksLikePhoneNumber(didFallback)) {
    const didRes = await resolveOrgIdFromDid(supabase, didFallback)
    if (didRes.orgId) {
      return { orgId: didRes.orgId, tag: emailRes.tag, source: 'phone_mapping' }
    }
  }

  return emailRes
}

/** Resolve target org from CloudMailin envelope plus-tag. */
export async function resolveOrgIdFromInboundEmail(
  supabase: SupabaseClient,
  body: CloudmailinInboundPayload
): Promise<InboundEmailOrgResolution> {
  const recipients = extractCloudmailinRecipients(body)
  const tags = extractPlusTagsFromRecipients(recipients)

  if (tags.length > 1) {
    console.warn(`Inbound email: multiple plus-tags in recipients: ${tags.join(', ')}`)
  }

  const tag = tags[0] ?? null

  if (tag) {
    const { data } = await supabase
      .from('orgs')
      .select('id')
      .eq('inbound_email_tag', tag)
      .maybeSingle()

    if (data?.id) {
      return { orgId: data.id, tag, source: 'plus_tag' }
    }

    console.error(`Inbound email: unknown plus-tag "${tag}"`)
    return { orgId: null, tag, source: 'unresolved', reason: 'unknown_tag' }
  }

  return { orgId: null, tag: null, source: 'unresolved', reason: 'no_tag' }
}
