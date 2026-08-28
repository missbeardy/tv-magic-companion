import type { SupabaseClient } from '@supabase/supabase-js'
import { ingestParsedFacebookLead } from './handleInboundFacebookLead.js'
import { deliverMessengerReplies } from './messengerBot.js'
import { listExpiredSuburbSessions, saveMessengerSession } from './messengerSession.js'
import { appendMessages, reduceSuburbTimeout } from './messengerTurn.js'

async function orgSlugForId(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase.from('orgs').select('slug').eq('id', orgId).maybeSingle()
  return data?.slug ?? null
}

export async function runMessengerSuburbTimeout(
  supabase: SupabaseClient,
  now = new Date()
): Promise<{ checked: number; submitted: number; errors: number }> {
  const expired = await listExpiredSuburbSessions(supabase, now.toISOString())
  let submitted = 0
  let errors = 0

  for (const session of expired) {
    try {
      const turned = reduceSuburbTimeout(session)
      if (!turned.submit) {
        await saveMessengerSession(supabase, turned.session)
        continue
      }

      const slug = await orgSlugForId(supabase, session.org_id)
      if (!slug || !turned.session.name || !turned.session.phone) {
        await saveMessengerSession(supabase, { ...turned.session, state: 'closed' })
        continue
      }

      const result = await ingestParsedFacebookLead(
        supabase,
        {
          org: slug,
          name: turned.session.name,
          phone: turned.session.phone,
          message: '',
          city: turned.session.suburb,
          email: null,
          website: null,
          channel: 'messenger',
          conversation_id: turned.session.conversation_id,
          suburb: turned.session.suburb,
          service_needed: turned.session.service_needed,
          out_of_area: turned.session.out_of_area,
        },
        {
          source: 'native_messenger_timeout',
          conversation_id: turned.session.conversation_id,
          page_id: session.page_id,
          psid: session.psid,
        }
      )

      const leadId = 'success' in result && result.success ? result.lead_id : null
      const next = appendMessages(
        { ...turned.session, lead_id: leadId ?? turned.session.lead_id },
        '(timeout)',
        turned.replies
      )
      await saveMessengerSession(supabase, next)
      if (turned.replies.length > 0) {
        await deliverMessengerReplies({
          supabase,
          pageId: session.page_id,
          psid: session.psid,
          replies: turned.replies,
        })
      }
      if (leadId) submitted += 1
    } catch (err) {
      errors += 1
      console.error('Messenger suburb timeout failed', session.id, err)
    }
  }

  return { checked: expired.length, submitted, errors }
}
