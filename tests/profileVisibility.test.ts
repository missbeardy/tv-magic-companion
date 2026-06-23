import { describe, it, expect } from 'vitest'
import {
  isProfileVisibleToViewer,
  filterVisibleProfiles,
} from '../src/lib/profileVisibility'

describe('profileVisibility', () => {
  const ownerId = 'owner-uuid'
  const hiddenEmployee = {
    id: 'hidden-emp',
    is_hidden_test_profile: true,
    test_profile_owner_id: ownerId,
  }
  const normalEmployee = {
    id: 'normal-emp',
    is_hidden_test_profile: false,
  }

  it('shows normal profiles to everyone', () => {
    expect(isProfileVisibleToViewer(normalEmployee, 'anyone')).toBe(true)
  })

  it('hides test profiles from other org members', () => {
    expect(isProfileVisibleToViewer(hiddenEmployee, 'other-manager')).toBe(false)
  })

  it('shows test profiles to owner', () => {
    expect(isProfileVisibleToViewer(hiddenEmployee, ownerId)).toBe(true)
  })

  it('shows test profile to self', () => {
    expect(isProfileVisibleToViewer(hiddenEmployee, hiddenEmployee.id)).toBe(true)
  })

  it('filterVisibleProfiles removes hidden from roster', () => {
    const roster = [normalEmployee, hiddenEmployee]
    expect(filterVisibleProfiles(roster, 'other-manager')).toEqual([normalEmployee])
    expect(filterVisibleProfiles(roster, ownerId)).toHaveLength(2)
  })
})
