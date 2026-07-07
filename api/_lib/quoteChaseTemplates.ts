import { interpolateTemplate } from './smsTemplates.js'
import type { FollowUpStage } from './quoteChasePolicy.js'

export const QUOTE_CHASE_SMS_FALLBACKS: Record<FollowUpStage, string> = {
  1: "Hi {{firstName}}, {{org.name}} here — just checking you got the quote for {{jobService}}. View or accept it here: {{link}}. Any questions, reply and I'll sort it.",
  2: "Hi {{firstName}}, that quote for {{jobService}} is still open if you'd like it: {{link}}. If the timing's not right, no worries — reply and let me know either way.",
}

export const QUOTE_CHASE_EMAIL_SUBJECTS: Record<FollowUpStage, string> = {
  1: 'Your quote from {{org.name}} — {{jobService}}',
  2: 'Your quote is still open — {{org.name}}',
}

export const QUOTE_CHASE_EMAIL_BODIES: Record<FollowUpStage, string> = {
  1: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{firstName}},</p>
  <p>{{org.name}} here — just checking you got the quote for {{jobService}}.</p>
  <p><a href="{{link}}">View or accept your quote</a></p>
  <p>Any questions, reply and we'll sort it.</p>
</div>`,
  2: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <p>Hi {{firstName}},</p>
  <p>That quote for {{jobService}} is still open if you'd like it: <a href="{{link}}">{{link}}</a></p>
  <p>If the timing's not right, no worries — reply and let us know either way.</p>
</div>`,
}

export interface QuoteChaseMessageVars {
  firstName: string
  jobService: string
  link: string
  'org.name': string
}

export function buildQuoteChaseEmail(
  stage: FollowUpStage,
  vars: QuoteChaseMessageVars
): { subject: string; html: string } {
  return {
    subject: interpolateTemplate(QUOTE_CHASE_EMAIL_SUBJECTS[stage], vars),
    html: interpolateTemplate(QUOTE_CHASE_EMAIL_BODIES[stage], vars),
  }
}
