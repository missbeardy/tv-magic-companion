import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getAuthHeaders } from '../../lib/apiAuth'

interface OrgRow {
  id: string
  name: string
}

interface MemberRow {
  id: string
  full_name: string
  email: string | null
  role: string
  is_hidden_test_profile: boolean
}

interface Props {
  orgs: OrgRow[]
  onMessage: (message: string, isError?: boolean) => void
}

export default function OrgMembersPanel({ orgs, onMessage }: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadMembers = useCallback(async (orgId: string) => {
    if (!orgId) {
      setMembers([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_hidden_test_profile')
      .eq('org_id', orgId)
      .order('full_name')

    if (error) {
      onMessage(error.message, true)
      setMembers([])
    } else {
      setMembers((data ?? []) as MemberRow[])
    }
    setLoading(false)
  }, [onMessage])

  useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id)
    }
  }, [orgs, selectedOrgId])

  useEffect(() => {
    if (selectedOrgId) void loadMembers(selectedOrgId)
  }, [selectedOrgId, loadMembers])

  async function toggleHidden(member: MemberRow) {
    setSavingId(member.id)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/create-user?action=set-test-profile', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: member.id, hidden: !member.is_hidden_test_profile }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onMessage(data.error ?? 'Failed to update profile', true)
        return
      }
      onMessage(
        data.hidden
          ? `${data.fullName ?? member.full_name} hidden from team views and auto-assign`
          : `${data.fullName ?? member.full_name} visible to team again`
      )
      await loadMembers(selectedOrgId)
    } catch {
      onMessage('Failed to update profile', true)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Hidden test profiles stay in the database for testing but are excluded from assign modals,
        auto-assign, and team roster views (visible only to you).
      </p>

      <div>
        <label htmlFor="org-members-select" className="block text-xs font-medium text-gray-500 mb-1">
          Organisation
        </label>
        <select
          id="org-members-select"
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-400">No members in this organisation.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Hidden test profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-3 py-2 text-gray-900">{member.full_name}</td>
                  <td className="px-3 py-2 text-gray-600">{member.email ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{member.role}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={savingId === member.id}
                      onClick={() => void toggleHidden(member)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        member.is_hidden_test_profile
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {savingId === member.id
                        ? 'Saving…'
                        : member.is_hidden_test_profile
                          ? 'Hidden'
                          : 'Visible'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
