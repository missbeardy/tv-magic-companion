import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  Share2,
  BarChart3,
  Settings,
  User,
  HelpCircle,
  Building2,
  Radio,
} from 'lucide-react'
import { normalizeRole, type AppRole } from './roles'

export interface NavLinkItem {
  to: string
  label: string
  icon: LucideIcon
  roles: AppRole[]
  feature: string | null
  primaryMobile: boolean
}

const allRoles: AppRole[] = ['manager', 'employee', 'platform_admin']
const managerRoles: AppRole[] = ['manager', 'platform_admin']

export const NAV_LINKS: NavLinkItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: allRoles, feature: null, primaryMobile: true },
  { to: '/leads', label: 'Leads', icon: Kanban, roles: allRoles, feature: 'leads', primaryMobile: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: allRoles, feature: 'calendar', primaryMobile: true },
  { to: '/activity', label: 'Team Activity', icon: Radio, roles: allRoles, feature: 'leads', primaryMobile: true },
  { to: '/social', label: 'Social', icon: Share2, roles: managerRoles, feature: 'social', primaryMobile: false },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: managerRoles, feature: 'reports', primaryMobile: false },
  { to: '/org-settings', label: 'Franchise Settings', icon: Settings, roles: managerRoles, feature: null, primaryMobile: false },
  { to: '/platform', label: 'Platform', icon: Building2, roles: ['platform_admin'], feature: null, primaryMobile: false },
  { to: '/support', label: 'Support', icon: HelpCircle, roles: allRoles, feature: null, primaryMobile: false },
  { to: '/profile', label: 'Profile', icon: User, roles: allRoles, feature: null, primaryMobile: false },
]

export function filterNavLinks(
  profileRole: string | undefined,
  canAccessFeature: (feature: string) => boolean,
  isSoloMode = false
): NavLinkItem[] {
  const role = normalizeRole(profileRole)
  if (!role) return []

  return NAV_LINKS.filter((link) => {
    if (isSoloMode && link.to === '/activity') return false
    if (!link.roles.includes(role)) return false
    if (link.feature && !canAccessFeature(link.feature)) return false
    return true
  })
}

export function isNavActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname.startsWith(to)
}

export function isDrawerRoute(pathname: string, links: NavLinkItem[]): boolean {
  return links.some((l) => !l.primaryMobile && isNavActive(pathname, l.to))
}
