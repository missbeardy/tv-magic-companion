import { describe, it, expect } from 'vitest'
import { filterNavLinks, NAV_LINKS } from '../src/lib/navConfig'

describe('filterNavLinks', () => {
  const allowAll = () => true
  const denyAll = () => false

  it('employee gets primary tabs and profile, not manager routes', () => {
    const links = filterNavLinks('employee', allowAll)
    const labels = links.map((l) => l.label)
    expect(labels).toContain('Dashboard')
    expect(labels).toContain('Leads')
    expect(labels).toContain('Profile')
    expect(labels).not.toContain('Reports')
    expect(labels).not.toContain('Franchise Settings')
    expect(labels).not.toContain('Platform')
  })

  it('manager gets franchise settings when features allowed', () => {
    const links = filterNavLinks('manager', allowAll)
    expect(links.map((l) => l.label)).toContain('Franchise Settings')
    expect(links.map((l) => l.label)).toContain('Reports')
  })

  it('platform_admin gets platform link', () => {
    const links = filterNavLinks('platform_admin', allowAll)
    expect(links.map((l) => l.label)).toContain('Platform')
  })

  it('hides tier-gated social when feature denied', () => {
    const links = filterNavLinks('manager', denyAll)
    expect(links.map((l) => l.label)).not.toContain('Social')
    expect(links.map((l) => l.label)).not.toContain('Tasks')
    expect(links.map((l) => l.label)).not.toContain('Reports')
  })

  it('normalizes role with spaces', () => {
    const links = filterNavLinks('platform admin', allowAll)
    expect(links.map((l) => l.label)).toContain('Platform')
  })

  it('marks exactly three primary mobile tabs', () => {
    expect(NAV_LINKS.filter((l) => l.primaryMobile)).toHaveLength(3)
  })
})
