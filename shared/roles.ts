export const ROLES = ['employee', 'manager', 'platform_admin'] as const

export type Role = (typeof ROLES)[number]
