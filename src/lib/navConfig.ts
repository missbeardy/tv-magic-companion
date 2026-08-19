import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  BarChart3,
  Settings,
  User,
  HelpCircle,
  Building2,
  Radio,
  Trophy,
} from 'lucide-react'
import { normalizeRole, type AppRole } from './roles'

export interface NavLinkItem {
  to: string
  label: string
  icon: LucideIcon
  roles: AppRole[]
  feature: string | null
  primaryMobile: boolean
  /** Hidden in solo mode — a one-person franchise has no team to compare or watch. */
  teamOnly: boolean
}

const allRoles: AppRole[] = ['manager', 'employee', 'platform_admin']
const managerRoles: AppRole[] = ['manager', 'platform_admin']

export const NAV_LINKS: NavLinkItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: allRoles, feature: null, primaryMobile: true, teamOnly: false },
  { to: '/leads', label: 'Leads', icon: Kanban, roles: allRoles, feature: 'leads', primaryMobile: true, teamOnly: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: allRoles, feature: 'calendar', primaryMobile: true, teamOnly: false },
  { to: '/activity', label: 'Team Activity', icon: Radio, roles: allRoles, feature: 'leads', primaryMobile: false, teamOnly: true },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, roles: allRoles, feature: null, primaryMobile: false, teamOnly: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: managerRoles, feature: 'reports', primaryMobile: false, teamOnly: false },
  { to: '/org-settings', label: 'Franchise Settings', icon: Settings, roles: managerRoles, feature: null, primaryMobile: false, teamOnly: false },
  { to: '/platform', label: 'Platform', icon: Building2, roles: ['platform_admin'], feature: null, primaryMobile: false, teamOnly: false },
  { to: '/support', label: 'Support', icon: HelpCircle, roles: allRoles, feature: null, primaryMobile: false, teamOnly: false },
  { to: '/profile', label: 'Profile', icon: User, roles: allRoles, feature: null, primaryMobile: false, teamOnly: false },
]

export function filterNavLinks(
  profileRole: string | undefined,
  canAccessFeature: (feature: string) => boolean,
  isSoloMode = false
): NavLinkItem[] {
  const role = normalizeRole(profileRole)
  if (!role) return []

  return NAV_LINKS.filter((link) => {
    if (isSoloMode && link.teamOnly) return false
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
