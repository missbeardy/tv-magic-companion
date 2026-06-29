import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractCloudmailinRecipients,
  extractPlusTagsFromRecipients,
  type CloudmailinInboundPayload,
} from '../../shared/inboundEmailRouting.js'

export type InboundEmailOrgResolution =
  | { orgId: string; tag: string | null; source: 'plus_tag' | 'default_org' }
  | { orgId: null; tag: string | null; source: 'unresolved'; reason: string }

/** Resolve target org from CloudMailin envelope plus-tag, with DEFAULT_ORG_ID fallback. */
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

  const fallback = process.env.DEFAULT_ORG_ID
  if (fallback) {
    console.log('Inbound email: no plus-tag — using DEFAULT_ORG_ID')
    return { orgId: fallback, tag: null, source: 'default_org' }
  }

  return { orgId: null, tag: null, source: 'unresolved', reason: 'no_tag_or_default' }
}
