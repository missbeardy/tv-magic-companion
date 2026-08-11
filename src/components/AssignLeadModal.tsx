import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getExpiresAt } from '../lib/timer'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { geocodeAddress, rankTechsByDistance, type TechWithDistance } from '../lib/proximity'
import { sendNotification } from '../lib/notify'
import { getPlatformUrl } from '../lib/env'
import { getAuthHeaders } from '../lib/apiAuth'
import { useOrgProfiles } from '../hooks/useOrgProfiles'
import { logLeadEvent } from '../lib/leadEvents'
import { getSmartAssignDecision } from '../lib/smartAssign'
import { buildExclusionHaystack, matchedExclusions } from '../../shared/serviceExclusions'
import { X, MapPin, Zap, Navigation, Star, Ban } from 'lucide-react'

interface Lead {
  id: string
  name: string
  service_type: string
  address?: string
  /** Matched for job exclusions (T1.14) — service_type alone is too unreliable. */
  details?: string
}

interface Props {
  lead: Lead
  onClose: () => void
  onAssigned: () => void
}

export default function AssignLeadModal({ lead, onClose, onAssigned }: Props) {
  const { profile } = useAuth()
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg()
  const { fetchOrgProfiles } = useOrgProfiles()
  const [employees, setEmployees] = useState<TechWithDistance[]>([])
  const [countMap, setCountMap] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingProximity, setLoadingProximity] = useState(true)
  const [pendingExcludedId, setPendingExcludedId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const employeeData = await fetchOrgProfiles({ roles: ['employee', 'manager', 'platform_admin'] })
      if (!employeeData.length && !profile?.org_id) return

      const visibleEmployees = profile?.role === 'employee'
        ? employeeData.filter(emp => emp.id === profile.id)
        : employeeData

      const { data: activeCounts } = await supabase
        .from('leads')
        .select('assigned_to')
        .eq('org_id', profile?.org_id ?? '')
        .eq('status', 'assigned')
        .is('deleted_at', null)

      const counts: Record<string, number> = {}
      activeCounts?.forEach((l) => {
        if (l.assigned_to) counts[l.assigned_to] = (counts[l.assigned_to] ?? 0) + 1
      })
      setCountMap(counts)

      if (lead.address?.trim()) {
        const coords = await geocodeAddress(lead.address)
        if (coords) {
          const ranked = rankTechsByDistance(coords.lat, coords.lng, visibleEmployees)
          setEmployees(ranked)
          setLoadingProximity(false)
          return
        }
      }

      setEmployees(visibleEmployees.map((e) => ({
        ...e,
        distanceKm: null,
        distanceLabel: 'Location unknown',
      })))
      setLoadingProximity(false)
    }
    fetchData()
  }, [lead.id, lead.address, profile])

  const minCount = employees.length > 0
    ? Math.min(...employees.map((e) => countMap[e.id] ?? 0))
    : 0
  const smartAssignEnabled = !featureSwitchesLoading && isFeatureEnabled('smart_assign_badge')
  const exclusionsEnabled = !featureSwitchesLoading && isFeatureEnabled('assignment_exclusions')

  // Job exclusions (T1.14). Matched on the customer's own words as well as
  // service_type — a Starlink lead is filed as "Other", so service_type alone
  // would never match. Manual assign warns rather than blocks: the manager may
  // know the flag is stale.
  const exclusionHaystack = exclusionsEnabled
    ? buildExclusionHaystack([lead.service_type, lead.details])
    : ''
  const exclusionsFor = (employeeId: string): string[] => {
    if (!exclusionHaystack) return []
    const emp = employees.find((e) => e.id === employeeId)
    return matchedExclusions((emp as any)?.excluded_service_keywords, exclusionHaystack)
  }

  // Excluded people stay in the list but sink to the bottom, behind the distance rank.
  const orderedEmployees = exclusionHaystack
    ? [...employees].sort(
        (a, b) => Number(exclusionsFor(a.id).length > 0) - Number(exclusionsFor(b.id).length > 0)
      )
    : employees

  async function handleAssign(employeeId: string) {
    // Backend Guard Rule: Employees cannot assign leads to anyone else
    if (profile?.role === 'employee' && employeeId !== profile.id) {
      setError('Permission denied: Employees can only self-assign leads.')
      return
    }

    // Confirm once before overriding a job exclusion.
    if (pendingExcludedId !== employeeId && exclusionsFor(employeeId).length > 0) {
      setPendingExcludedId(employeeId)
      setError('')
      return
    }
    setPendingExcludedId(null)

    setSaving(true)
    setError('')
    const expiresAt = getExpiresAt()

    const { data, error: assignError, count } = await supabase
      .from('leads')
      .update({
        status: 'assigned',
        assigned_to: employeeId,
        assigned_at: new Date().toISOString(),
        timer_expires_at: expiresAt,
        contact_attempt_round: 0,
        last_contact_attempted_at: null,
        lost_reason: null,
      }, { count: 'exact' })
      .eq('id', lead.id)
      .eq('status', 'unassigned')
      .select('id')

    if (assignError) {
      setError('Failed to assign: ' + assignError.message)
      setSaving(false)
      return
    }

    const rowsUpdated = count ?? data?.length ?? 0
    if (rowsUpdated === 0) {
      setError('This lead was just assigned by another manager.')
      setSaving(false)
      return
    }

    void (async () => {
      try {
        const headers = await getAuthHeaders()
        const waRes = await fetch('/api/send-sms', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'tech_assignment',
            assigneeId: employeeId,
            leadName: lead.name,
            serviceType: lead.service_type,
          }),
        })
        const waData = await waRes.json().catch(() => ({}))
        if (!waRes.ok) {
          console.error('Assignment WhatsApp failed:', waData)
        } else if (!waData.sid) {
          console.warn('Assignment WhatsApp 200 but no Twilio sid:', waData)
        }
      } catch (smsErr) {
        console.error('Tech assignment WhatsApp failed:', smsErr)
      }
    })()

    onAssigned()
    onClose()

    void (async () => {
      try {
        await logLeadEvent({
          leadId: lead.id,
          orgId: profile?.org_id ?? null,
          eventType: 'assigned',
          note: `Lead assigned to ${employees.find((e) => e.id === employeeId)?.full_name ?? 'team member'}`,
          actorId: profile?.id ?? null,
          payload: {
            assigned_to: employeeId,
            timer_expires_at: expiresAt,
            source: profile?.role === 'employee' ? 'self_assign' : 'manager_assign',
          },
        })

        await sendNotification(
          employeeId,
          'New Lead Assigned',
          `You've been assigned: ${lead.name} — ${lead.service_type}`,
          `${getPlatformUrl()}/leads`
        )
      } catch (err) {
        console.error('Assignment side effects failed:', err)
      }
    })()
  }

  /** Dev-only: pre-assign as "another manager", then hit the status guard. */
  async function handleDevSimulateConflict() {
    if (!import.meta.env.DEV || employees.length === 0) return

    setSaving(true)
    setError('')

    const winnerId = employees[0].id
    const attemptId = employees[1]?.id ?? employees[0].id
    const expiresAt = getExpiresAt()

    const assignPayload = {
      status: 'assigned' as const,
      assigned_to: '',
      assigned_at: new Date().toISOString(),
      timer_expires_at: expiresAt,
      contact_attempt_round: 0,
      last_contact_attempted_at: null,
      lost_reason: null,
    }

    const { data: preData, count: preCount, error: preError } = await supabase
      .from('leads')
      .update({ ...assignPayload, assigned_to: winnerId }, { count: 'exact' })
      .eq('id', lead.id)
      .eq('status', 'unassigned')
      .select('id')

    if (preError) {
      setError('Dev simulate pre-assign failed: ' + preError.message)
      setSaving(false)
      return
    }

    if ((preCount ?? preData?.length ?? 0) === 0) {
      setError('Dev simulate: lead is not unassigned — reset it first.')
      setSaving(false)
      return
    }

    const { data, error: assignError, count } = await supabase
      .from('leads')
      .update({ ...assignPayload, assigned_to: attemptId }, { count: 'exact' })
      .eq('id', lead.id)
      .eq('status', 'unassigned')
      .select('id')

    if (assignError) {
      setError('Failed to assign: ' + assignError.message)
      setSaving(false)
      return
    }

    const rowsUpdated = count ?? data?.length ?? 0
    if (rowsUpdated === 0) {
      setError('This lead was just assigned by another manager.')
      setSaving(false)
      return
    }

    setError('Dev simulate: guard did not fire (unexpected success).')
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="font-display font-semibold text-gray-900 text-base">Assign Lead</h3>
            <p className="text-sm text-gray-500 mt-0.5">{lead.name} · {lead.service_type}</p>
            {lead.address && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin size={11} className="text-[#00B4C5] shrink-0" />
                <p className="text-xs text-[#00B4C5] font-medium">{lead.address}</p>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Job exclusion override confirm */}
          {pendingExcludedId && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl mb-4">
              <p className="text-sm text-amber-900">
                <span className="font-semibold">
                  {employees.find((e) => e.id === pendingExcludedId)?.full_name ?? 'This person'}
                </span>{' '}
                is flagged as unable to do{' '}
                <span className="font-semibold">{exclusionsFor(pendingExcludedId).join(', ')}</span>.
                Assign anyway?
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setPendingExcludedId(null)}
                  disabled={saving}
                  className="flex-1 py-2 min-h-[44px] rounded-lg border border-amber-300 text-amber-900 text-sm font-semibold hover:bg-amber-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAssign(pendingExcludedId)}
                  disabled={saving}
                  className="flex-1 py-2 min-h-[44px] rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60"
                >
                  Assign anyway
                </button>
              </div>
            </div>
          )}

          {/* Subheading */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">
              {profile?.role === 'employee' ? 'Confirm Assignment' : 'Select Technician'}
            </p>
            {lead.address && profile?.role !== 'employee' && (
              <p className="text-xs text-gray-400">
                {loadingProximity ? 'Finding nearest…' : 'Sorted by distance'}
              </p>
            )}
          </div>

          {/* Tech list */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mb-4">
            {employees.length === 0 && !loadingProximity && (
              <p className="text-sm text-gray-500 text-center py-6">
                No team members found. Add a profile row in Supabase for each auth user, or invite via Profile → Add Employee.
              </p>
            )}
            {employees.length === 0 && loadingProximity && (
              <p className="text-sm text-gray-400 text-center py-6">Loading team…</p>
            )}
            {orderedEmployees.map((emp, index) => {
              const activeCount = countMap[emp.id] ?? 0
              const isSelf = emp.id === profile?.id
              const excluded = exclusionsFor(emp.id)
              const isNearest =
                index === 0 &&
                emp.distanceKm != null &&
                profile?.role !== 'employee' &&
                excluded.length === 0
              const isManager = (emp as any).role === 'manager'
              const smartAssign = getSmartAssignDecision({
                featureEnabled: smartAssignEnabled,
                role: profile?.role,
                activeCount,
                minimumActiveCount: minCount,
                isNearest,
              })

              return (
                <button
                  key={emp.id}
                  disabled={saving}
                  onClick={() => handleAssign(emp.id)}
                  className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all hover:shadow-md disabled:opacity-50 ${
                    excluded.length > 0
                      ? 'border-red-200 bg-red-50/40'
                      : smartAssignEnabled && isNearest
                      ? 'border-[#00B4C5] bg-[#00B4C5]/5'
                      : smartAssignEnabled && smartAssign.isRecommended && profile?.role !== 'employee'
                      ? 'border-green-400 bg-green-50/50'
                      : 'border-gray-100 bg-white hover:border-[#004B93]/30'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-white text-sm shrink-0 overflow-hidden ring-2 ring-white ${
                    isManager ? 'bg-purple-500' : 'bg-[#004B93]'
                  }`}>
                    {(emp as any).avatar_url
                      ? <img src={(emp as any).avatar_url} className="w-full h-full object-cover" alt={emp.full_name} />
                      : emp.full_name.charAt(0)
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm">{emp.full_name}</p>
                      {isSelf && <span className="badge badge-purple">Me</span>}
                      {isManager && !isSelf && <span className="badge badge-purple">Manager</span>}
                      {smartAssignEnabled && isNearest && (
                        <span className="badge badge-cyan flex items-center gap-1">
                          <Navigation size={9} /> Nearest
                        </span>
                      )}
                      {excluded.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold">
                          <Ban size={9} /> Can't do: {excluded.join(', ')}
                        </span>
                      )}
                    </div>
                    {(emp as any).suburb && (
                      <p className="text-xs text-gray-400 mt-0.5">{(emp as any).suburb}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {activeCount} active lead{activeCount !== 1 ? 's' : ''}
                      {emp.distanceKm != null && profile?.role !== 'employee' && (
                        <span className="ml-1.5 text-[#00B4C5] font-medium">· {emp.distanceLabel}</span>
                      )}
                    </p>
                  </div>

                  {/* Recommended badge — never recommend someone who can't do the job */}
                  {smartAssignEnabled && smartAssign.isRecommended && !isNearest && excluded.length === 0 && profile?.role !== 'employee' && (
                    <span className="badge badge-green flex items-center gap-1 shrink-0">
                      <Star size={9} /> Recommended
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          {import.meta.env.DEV && employees.length > 0 && (
            <button
              type="button"
              onClick={handleDevSimulateConflict}
              disabled={saving}
              className="w-full py-2.5 mb-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              Dev: Simulate assign conflict
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}