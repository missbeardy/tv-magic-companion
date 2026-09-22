import { ROLES, type Role } from '../../shared/roles'

export { ROLES }
export type AppRole = Role

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
  return (ROLES as readonly string[]).includes(r) ? (r as AppRole) : null
}
