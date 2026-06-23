export interface Brand {
  id: string
  name: string
  slug: string
  vertical: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  sms_templates: Record<string, string>
  ai_config: Record<string, unknown>
  upsell_items: Array<{ id: string; label: string }>
  is_active: boolean
}

export interface ThemeTokens {
  primary: string
  secondary: string
  primaryDark: string
  displayName: string
  logoUrl: string | null
}

const DEFAULT_PRIMARY = '#004B93'
const DEFAULT_SECONDARY = '#00B4C5'

/** Darken hex color ~15% for hover/nav mobile menu */
export function darkenHex(hex: string, amount = 0.15): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return hex
  const num = parseInt(normalized, 16)
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount))
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount))
  const b = Math.max(0, (num & 0xff) * (1 - amount))
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export function resolveThemeTokens(
  org: {
    name: string
    logo_url?: string | null
    primary_color?: string | null
    secondary_color?: string | null
  } | null,
  brand: Brand | null
): ThemeTokens {
  const primary = org?.primary_color || brand?.primary_color || DEFAULT_PRIMARY
  const secondary = org?.secondary_color || brand?.secondary_color || DEFAULT_SECONDARY
  return {
    primary,
    secondary,
    primaryDark: darkenHex(primary),
    displayName: org?.name || brand?.name || 'Companion',
    logoUrl: org?.logo_url || brand?.logo_url || null,
  }
}

export function applyThemeToDocument(tokens: ThemeTokens): void {
  const vars: [string, string][] = [
    ['--color-primary', tokens.primary],
    ['--color-secondary', tokens.secondary],
    ['--color-primary-dark', tokens.primaryDark],
  ]
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue
    for (const [name, value] of vars) {
      el.style.setProperty(name, value)
    }
  }
}
