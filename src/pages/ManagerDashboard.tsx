// src/pages/ManagerDashboard.tsx
// Last updated: 17 June 2026 - removed duplicate date pill

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import NavBar from '../components/NavBar'
import AssignedLeads from '../components/AssignedLeads'
import RevenueWidget from '../components/RevenueWidget'
import TeamWorkloadPanel from '../components/TeamWorkloadPanel'
import TeamActivityTeaser from '../components/TeamActivityTeaser'
import { useTeamWorkload } from '../hooks/useTeamWorkload'
import { useTechLocation } from '../hooks/useTechLocation'
import { getMonthStart } from '../lib/reporting/dateRange'
import { fetchReportingData } from '../lib/reporting/fetchReportData'
import { getPreviousMonthStart, markManagerBriefSeen, shouldShowManagerBrief } from '../lib/managerBrief'
import {
  Inbox, ClipboardCheck, Clock, TrendingUp, AlertCircle, FileBarChart
} from 'lucide-react'

interface StatsRow {
  unassigned: number
  assigned: number
  completed: number
  contact_attempted: number
}

interface ReportSnapshot {
  monthLabel: string
  leadsReceived: number
  contactAttempts: number
  bookings: number
  completed: number
}

interface ManagerMonthlyBrief {
  monthLabel: string
  leadsReceived: number
  bookings: number
  completed: number
  lost: number
  bookedToCompletedRate: number | null
}

function StatCard({ label, value, icon: Icon, colour, onClick }: {
  label: string
  value: number
  icon: React.ElementType
  colour: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`card p-4 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colour}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="font-display font-bold text-2xl text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-medium">{label}</p>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export default function ManagerDashboard() {
  const { profile } = useAuth()
  const { canAccessFeature } = useOrg()
  const navigate = useNavigate()
  const { techs, loading: workloadLoading } = useTeamWorkload()
  const [stats, setStats] = useState<StatsRow>({ unassigned: 0, assigned: 0, completed: 0, contact_attempted: 0 })
  const [reportSnapshot, setReportSnapshot] = useState<ReportSnapshot | null>(null)
  const [monthlyBrief, setMonthlyBrief] = useState<ManagerMonthlyBrief | null>(null)
  const [showMonthlyBrief, setShowMonthlyBrief] = useState(false)
  const [reportLoading, setReportLoading] = useState(true)
  useTechLocation(profile?.id ?? null)
  const reportsEnabled = canAccessFeature('reports')

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  async function fetchData() {
    if (!profile) return

    const { data: leads } = await supabase
      .from('leads')
      .select('status')
      .eq('org_id', profile.org_id)

    if (leads) {
      const s = { unassigned: 0, assigned: 0, completed: 0, contact_attempted: 0 }
      leads.forEach(l => {
        if (l.status in s) s[l.status as keyof StatsRow]++
      })
      setStats(s)
    }
  }

  useEffect(() => {
    if (!profile) return
    fetchData()
    const channel = supabase
      .channel('manager-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  useEffect(() => {
    if (!profile?.org_id || !reportsEnabled) {
      setReportSnapshot(null)
      setReportLoading(false)
      return
    }

    let cancelled = false
    const monthStart = getMonthStart(new Date())
    const orgId = profile.org_id

    async function loadReportSnapshot() {
      setReportLoading(true)
      try {
        const report = await fetchReportingData(orgId, monthStart)
        if (!cancelled) {
          setReportSnapshot({
            monthLabel: report.period.label,
            leadsReceived: report.summary.leadsReceived,
            contactAttempts: report.summary.contactAttempts,
            bookings: report.summary.bookings,
            completed: report.summary.completed,
          })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Manager report snapshot failed:', err)
          setReportSnapshot(null)
        }
      } finally {
        if (!cancelled) setReportLoading(false)
      }
    }

    loadReportSnapshot()

    const channel = supabase
      .channel(`manager-dashboard-report-snapshot-${profile.org_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_events',
          filter: `org_id=eq.${profile.org_id}`,
        },
        loadReportSnapshot
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [profile?.org_id, reportsEnabled])

  const dismissMonthlyBrief = useCallback(() => {
    markManagerBriefSeen()
    setShowMonthlyBrief(false)
  }, [])

  const openFullReports = useCallback(() => {
    dismissMonthlyBrief()
    navigate('/reports')
  }, [dismissMonthlyBrief, navigate])

  useEffect(() => {
    if (!profile?.org_id || !reportsEnabled) {
      setMonthlyBrief(null)
      setShowMonthlyBrief(false)
      return
    }

    if (!shouldShowManagerBrief()) {
      setShowMonthlyBrief(false)
      return
    }

    let cancelled = false
    const previousMonth = getPreviousMonthStart(new Date())
    const orgId = profile.org_id

    async function loadMonthlyBrief() {
      try {
        const report = await fetchReportingData(orgId, previousMonth)
        if (cancelled) return

        const hasMeaningfulActivity =
          report.summary.leadsReceived > 0 ||
          report.summary.bookings > 0 ||
          report.summary.completed > 0 ||
          report.summary.lost > 0

        if (!hasMeaningfulActivity) {
          markManagerBriefSeen()
          setMonthlyBrief(null)
          setShowMonthlyBrief(false)
          return
        }

        setMonthlyBrief({
          monthLabel: report.period.label,
          leadsReceived: report.summary.leadsReceived,
          bookings: report.summary.bookings,
          completed: report.summary.completed,
          lost: report.summary.lost,
          bookedToCompletedRate: report.conversions.bookedToCompleted.rate,
        })
        setShowMonthlyBrief(true)
      } catch (err) {
        if (cancelled) return
        console.error('Manager monthly brief failed:', err)
        setMonthlyBrief(null)
        setShowMonthlyBrief(false)
      }
    }

    loadMonthlyBrief()
    return () => {
      cancelled = true
    }
  }, [profile?.org_id, reportsEnabled])

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome + Date — pill badge removed (was duplicate) */}
        <div>
          <h1 className="font-display font-bold text-gray-900 text-xl">
            Good {getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>

        {showMonthlyBrief && monthlyBrief && (
          <section className="card p-4 border border-[#004B93]/20 bg-[#004B93]/5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-[#004B93]">
                  Month-start manager brief
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  {monthlyBrief.monthLabel} closed with {monthlyBrief.leadsReceived} leads, {monthlyBrief.bookings} bookings,
                  and {monthlyBrief.completed} completed jobs.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissMonthlyBrief}
                className="self-start text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                Dismiss
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
              <div className="rounded-lg bg-white px-3 py-2 border border-gray-100">
                <p className="text-xs text-gray-500">Leads</p>
                <p className="font-semibold text-gray-900">{monthlyBrief.leadsReceived}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 border border-gray-100">
                <p className="text-xs text-gray-500">Bookings</p>
                <p className="font-semibold text-gray-900">{monthlyBrief.bookings}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 border border-gray-100">
                <p className="text-xs text-gray-500">Completed</p>
                <p className="font-semibold text-gray-900">{monthlyBrief.completed}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 border border-gray-100">
                <p className="text-xs text-gray-500">Lost</p>
                <p className="font-semibold text-gray-900">{monthlyBrief.lost}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 border border-gray-100">
                <p className="text-xs text-gray-500">Booked→Completed</p>
                <p className="font-semibold text-gray-900">
                  {monthlyBrief.bookedToCompletedRate === null ? '—' : `${Math.round(monthlyBrief.bookedToCompletedRate * 100)}%`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openFullReports}
              className="mt-3 text-sm font-medium text-[#004B93] hover:text-[#003d7a]"
            >
              Open full monthly report →
            </button>
          </section>
        )}

        {/* Unassigned alert */}
        {stats.unassigned > 0 && (
          <div
            onClick={() => navigate('/leads?status=unassigned')}
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 transition"
          >
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 font-medium">
              {stats.unassigned} unassigned lead{stats.unassigned !== 1 ? 's' : ''} waiting for action
            </p>
          </div>
        )}

        {/* Stats row - clickable */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Unassigned" value={stats.unassigned} icon={Inbox} colour="bg-amber-400"
            onClick={() => navigate('/leads?status=unassigned')}
          />
          <StatCard
            label="Assigned" value={stats.assigned} icon={Clock} colour="bg-[#004B93]"
            onClick={() => navigate('/leads?status=assigned')}
          />
          <StatCard
            label="Completed" value={stats.completed} icon={ClipboardCheck} colour="bg-green-500"
            onClick={() => navigate('/leads?status=completed')}
          />
          <StatCard
            label="Attempted" value={stats.contact_attempted} icon={TrendingUp} colour="bg-[#00B4C5]"
            onClick={() => navigate('/leads?status=contact_attempted')}
          />
        </div>

        {/* This month's reporting snapshot */}
        {reportsEnabled && (
          <div
            onClick={() => navigate('/reports')}
            className="card p-4 cursor-pointer hover:shadow-md transition-all border border-[#004B93]/10"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display font-semibold text-gray-900 flex items-center gap-2">
                  <FileBarChart size={15} className="text-[#004B93]" />
                  This month's report
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reportSnapshot?.monthLabel ?? 'Current month'} · tap to view full breakdown
                </p>
              </div>
              <span className="text-xs text-[#004B93] font-medium">View reports →</span>
            </div>

            {reportLoading ? (
              <p className="text-sm text-gray-500 mt-3">Loading monthly activity…</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Leads</p>
                  <p className="font-semibold text-gray-900">{reportSnapshot?.leadsReceived ?? 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Contacts</p>
                  <p className="font-semibold text-gray-900">{reportSnapshot?.contactAttempts ?? 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Bookings</p>
                  <p className="font-semibold text-gray-900">{reportSnapshot?.bookings ?? 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Completed</p>
                  <p className="font-semibold text-gray-900">{reportSnapshot?.completed ?? 0}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <TeamActivityTeaser />

        <TeamWorkloadPanel techs={techs} loading={workloadLoading} />

        {/* Assigned leads + revenue */}
        <div className="grid md:grid-cols-2 gap-4">
          <AssignedLeads />
          <RevenueWidget />
        </div>
      </main>
    </div>
  )
}