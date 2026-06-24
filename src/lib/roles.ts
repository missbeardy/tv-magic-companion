export type AppRole = 'manager' | 'employee' | 'platform_admin'

/** Manager-level permissions (franchise ops + platform admin). */
export function isManagerRole(role: string | undefined | null): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'manager' || normalized === 'platform_admin'
}

export function isPlatformAdminRole(role: string | undefined | null): boolean {
  return normalizeRole(role) === 'platform_admin'
}

/** Normalize role strings from DB / Table Editor (trim, lowercase, spaces → underscores). */
export function normalizeRole(role: string | undefined | null): AppRole | null {
  if (!role) return null
  const r = role.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (r === 'manager' || r === 'employee' || r === 'platform_admin') return r
  return null
}
