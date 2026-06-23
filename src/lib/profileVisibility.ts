export interface ProfileVisibilityFields {
  id: string
  is_hidden_test_profile?: boolean | null
  test_profile_owner_id?: string | null
}

export function isProfileVisibleToViewer(
  target: ProfileVisibilityFields,
  viewerId: string | undefined
): boolean {
  if (!target.is_hidden_test_profile) return true
  if (!viewerId) return false
  if (target.id === viewerId) return true
  if (target.test_profile_owner_id === viewerId) return true
  return false
}

export function filterVisibleProfiles<T extends ProfileVisibilityFields>(
  profiles: T[],
  viewerId: string | undefined
): T[] {
  return profiles.filter((p) => isProfileVisibleToViewer(p, viewerId))
}
