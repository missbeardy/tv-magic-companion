import { describe, it, expect } from 'vitest'
import { formatNavBadgeCount } from '../src/components/NavTabBadge'
import { isNavActive } from '../src/lib/navConfig'

describe('MobileBottomNav', () => {
  describe('formatNavBadgeCount', () => {
    it('hides badge at 0', () => {
      expect(formatNavBadgeCount(0)).toBeNull()
    })

    it('shows count up to 9', () => {
      expect(formatNavBadgeCount(3)).toBe('3')
    })

    it('caps display at 9+', () => {
      expect(formatNavBadgeCount(15)).toBe('9+')
    })
  })

  describe('isNavActive (aria-current)', () => {
    it('marks dashboard active on root path', () => {
      expect(isNavActive('/', '/')).toBe(true)
      expect(isNavActive('/leads', '/')).toBe(false)
    })

    it('marks leads active on /leads', () => {
      expect(isNavActive('/leads', '/leads')).toBe(true)
    })

    it('marks calendar active on /calendar', () => {
      expect(isNavActive('/calendar', '/calendar')).toBe(true)
    })
  })
})
