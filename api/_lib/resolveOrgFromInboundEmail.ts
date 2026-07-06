import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractCloudmailinRecipients,
  extractPlusTagsFromRecipients,
  type CloudmailinInboundPayload,
} from '../../shared/inboundEmailRouting.js'

export type InboundEmailOrgResolution =
  | { orgId: string; tag: string | null; source: 'plus_tag' }
  | { orgId: null; tag: string | null; source: 'unresolved'; reason: 'unknown_tag' | 'no_tag' }

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
