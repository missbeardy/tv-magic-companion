// src/components/TeamExclusionsPanel.tsx
// Manager-only roster of who cannot do what (T1.14). Until this shipped there was
// no list of existing team members anywhere in the app — only "invite".
import { useCallback, useEffect, useState } from 'react'
import { useOrgProfiles, type OrgProfile } from '../hooks/useOrgProfiles'
import TeamExclusionsModal from './TeamExclusionsModal'
import { Ban, Pencil } from 'lucide-react'

export default function TeamExclusionsPanel() {
  const { fetchOrgProfiles } = useOrgProfiles()
  const [team, setTeam] = useState<OrgProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<OrgProfile | null>(null)

  const load = useCallback(async () => {
    const rows = await fetchOrgProfiles({ roles: ['employee', 'manager'] })
    // Drop hidden profiles outright. fetchOrgProfiles keeps them visible to
    // whoever hid them (profileVisibility.ts), but auto-assign filters on
    // `is_hidden_test_profile = false` unconditionally — so a hidden person can
    // never be auto-assigned and an exclusion on them would do nothing. People
    // who have left are already excluded by fetchOrgProfiles.
    setTeam(rows.filter((p) => !p.is_hidden_test_profile))
    setLoading(false)
  }, [fetchOrgProfiles])

  useEffect(() => {
    void load()
  }, [load])

  function applySaved(profileId: string, keywords: string[]) {
    setTeam((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, excluded_service_keywords: keywords } : p))
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-1">
        <Ban size={13} className="text-gray-400" />
        <p className="text-sm font-semibold text-gray-700">Job Exclusions</p>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Auto-assign skips anyone flagged as unable to do the job type in the enquiry.
      </p>

      {loading && <p className="text-sm text-gray-400 py-2">Loading team…</p>}

      {!loading && team.length === 0 && (
        <p className="text-sm text-gray-400 py-2">No team members yet.</p>
      )}

      <div className="space-y-2">
        {team.map((member) => {
          const keywords = member.excluded_service_keywords ?? []
          return (
            <div
              key={member.id}
              className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-gray-800">{member.full_name}</p>
                  {member.role === 'manager' && <span className="badge badge-purple">Manager</span>}
                </div>
                {keywords.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">Can do any job</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditing(member)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-[#004B93] hover:bg-white transition-colors"
                aria-label={`Edit job exclusions for ${member.full_name}`}
              >
                <Pencil size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {editing && (
        <TeamExclusionsModal
          profileId={editing.id}
          fullName={editing.full_name}
          initialKeywords={editing.excluded_service_keywords ?? []}
          onClose={() => setEditing(null)}
          onSaved={(keywords) => applySaved(editing.id, keywords)}
        />
      )}
    </div>
  )
}
