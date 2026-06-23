type TemplateVars = Record<string, string | undefined>

export function interpolateTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    if (key.startsWith('org.')) {
      const orgKey = key.slice(4)
      return vars[`org.${orgKey}`] ?? vars[orgKey] ?? ''
    }
    return vars[key] ?? ''
  })
}

export function buildSmsFromBrand(
  templates: Record<string, string> | null | undefined,
  key: string,
  vars: TemplateVars,
  fallback: string
): string {
  const template = templates?.[key]
  if (!template) return interpolateTemplate(fallback, vars)
  return interpolateTemplate(template, vars)
}
