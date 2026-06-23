import type { Org } from '../context/OrgContext'
import type { Brand } from './theme'

type TemplateVars = Record<string, string | undefined>

/** Interpolate {{org.name}} style placeholders in brand SMS templates */
export function interpolateTemplate(
  template: string,
  vars: TemplateVars
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    if (key.startsWith('org.')) {
      const orgKey = key.slice(4)
      return vars[`org.${orgKey}`] ?? vars[orgKey] ?? ''
    }
    return vars[key] ?? ''
  })
}

export function getSmsTemplate(
  brand: Brand | null,
  key: string,
  org: Org | null,
  extra: TemplateVars = {}
): string | null {
  const template = brand?.sms_templates?.[key]
  if (!template) return null
  return interpolateTemplate(template, {
    'org.name': org?.name,
    'org.support_phone': org?.support_phone ?? undefined,
    ...extra,
  })
}

export function getDefaultSmsTemplates(orgName: string): Record<string, string> {
  return {
    tech_assignment: `${orgName}: You've been assigned {{leadName}} — {{serviceType}}`,
    customer_ontheway: `{{techName}} from ${orgName} is on their way to help with your {{serviceType}} enquiry.`,
    receipt_footer: `— ${orgName} Team`,
  }
}
