import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  FileBarChart,
  Lock,
  UserRound,
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useTheme } from '../context/ThemeContext'
import FunnelStage from '../components/ui/FunnelStage'
import MetricCard from '../components/ui/MetricCard'
import SourceBarChart from '../components/ui/SourceBarChart'
import { buildMonthOptions, formatMonthLabel, getMonthKey, getMonthStart } from '../lib/reporting/dateRange'
import { fetchFirstLeadEventMonth, fetchReportingData, type ReportingResult } from '../lib/reporting/fetchReportData'

type LeaderboardSortKey =
  | 'name'
  | 'assignments'
  | 'contactAttempts'
  | 'bookings'
  | 'completed'
  | 'lost'
  | 'bookingCancelled'
  | 'unassigned'
  | 'reviewRequests'

export default function ReportsPage() {
  const { profile } = useAuth()
  const { canAccessFeature } = useOrg()
  const { primary, secondary } = useTheme()
  const canSeeReports = canAccessFeature('reports')

  const [report, setReport] = useState<ReportingResult | null>(null)
  const [loadingReport, setLoadingReport] = useState(true)
  const [loadingMonths, setLoadingMonths] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => getMonthStart(new Date()))
  const [monthOptions, setMonthOptions] = useState<Date[]>(() => [getMonthStart(new Date())])
  const [sortBy, setSortBy] = useState<LeaderboardSortKey>('completed')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false

    async function loadMonths() {
      if (!profile?.org_id) return
      setLoadingMonths(true)
      try {
        const currentMonth = getMonthStart(new Date())
        const firstMonth = await fetchFirstLeadEventMonth(profile.org_id)
        if (cancelled) return

        const months = buildMonthOptions(firstMonth ?? currentMonth, currentMonth)
        setMonthOptions(months.length ? months : [currentMonth])

        setSelectedMonth((previous) => {
          const selectedExists = months.some((m) => getMonthKey(m) === getMonthKey(previous))
          return selectedExists ? previous : currentMonth
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load report months')
      } finally {
        if (!cancelled) {
          setLoadingMonths(false)
        }
      }
    }

    loadMonths()
    return () => {
      cancelled = true
    }
  }, [profile?.org_id])

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      if (!profile?.org_id || !canSeeReports) {
        setLoadingReport(false)
        return
      }

      setLoadingReport(true)
      setError(null)

      try {
        const data = await fetchReportingData(profile.org_id, selectedMonth)
        if (!cancelled) {
          setReport(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load report data')
          setReport(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingReport(false)
        }
      }
    }

    loadReport()
    return () => {
      cancelled = true
    }
  }, [profile?.org_id, selectedMonth, canSeeReports])

  const monthKeys = useMemo(() => monthOptions.map((m) => getMonthKey(m)), [monthOptions])
  const selectedKey = getMonthKey(selectedMonth)
  const selectedIndex = monthKeys.indexOf(selectedKey)
  const hasOlder = selectedIndex >= 0 && selectedIndex < monthOptions.length - 1
  const hasNewer = selectedIndex > 0

  const summary = report?.summary
  const compactMetrics = useMemo(
    () => [
      { label: 'Bookings', value: summary?.bookings ?? 0 },
      { label: 'Lost', value: summary?.lost ?? 0 },
      { label: 'Expired', value: summary?.expired ?? 0 },
      { label: 'Review requests', value: summary?.reviewRequests ?? 0 },
    ],
    [summary]
  )

  const funnelStages = useMemo(() => {
    const received = summary?.leadsReceived ?? 0
    const contacted = report?.conversions.assignedToContacted.numerator ?? 0
    const booked = summary?.bookings ?? 0
    const completed = summary?.completed ?? 0

    return [
      { label: 'Received', count: received },
      { label: 'Contacted', count: contacted },
      { label: 'Booked', count: booked },
      { label: 'Completed', count: completed },
    ]
  }, [report, summary?.bookings, summary?.completed, summary?.leadsReceived])

  const maxFunnelCount = useMemo(
    () => Math.max(...funnelStages.map((stage) => stage.count), 0),
    [funnelStages]
  )

  const hasAnyActivity = useMemo(
    () => funnelStages.some((stage) => stage.count > 0),
    [funnelStages]
  )

  const sortedAgentRows = useMemo(() => {
    if (!report) return []
    const rows = [...report.agentRows]
    rows.sort((a, b) => {
      if (sortBy === 'name') {
        const cmp = a.name.localeCompare(b.name)
        return sortDirection === 'asc' ? cmp : -cmp
      }
      const cmp = a[sortBy] - b[sortBy]
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return rows
  }, [report, sortBy, sortDirection])

  function handleSort(nextSortBy: LeaderboardSortKey) {
    if (sortBy === nextSortBy) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(nextSortBy)
    setSortDirection(nextSortBy === 'name' ? 'asc' : 'desc')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display font-bold text-gray-900 text-xl flex items-center gap-2">
              <FileBarChart size={20} style={{ color: primary }} />
              Monthly Reports
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Team activity, conversion rates, and response timing by month.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => {
                if (!hasOlder) return
                setSelectedMonth(monthOptions[selectedIndex + 1])
              }}
              disabled={!hasOlder}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>

            <select
              value={selectedKey}
              onChange={(e) => {
                const next = monthOptions.find((m) => getMonthKey(m) === e.target.value)
                if (next) setSelectedMonth(next)
              }}
              disabled={loadingMonths}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 min-w-[170px]"
            >
              {monthOptions.map((month) => (
                <option key={getMonthKey(month)} value={getMonthKey(month)}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                if (!hasNewer) return
                setSelectedMonth(monthOptions[selectedIndex - 1])
              }}
              disabled={!hasNewer}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </header>

        {!canSeeReports && (
          <section className="card p-5 border border-indigo-100 bg-indigo-50/40">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Lock size={18} />
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-indigo-900">Reports is available on Pro and above.</p>
                <p className="text-sm text-indigo-800">
                  Upgrade your franchise plan to unlock manager reporting dashboards.
                </p>
                <Link to="/org-settings" className="inline-flex text-sm font-medium text-indigo-700 hover:text-indigo-900 underline">
                  Open Subscription & Billing
                </Link>
              </div>
            </div>
          </section>
        )}

        {canSeeReports && loadingReport && (
          <section className="card p-6 text-sm text-gray-500">Loading report data…</section>
        )}

        {canSeeReports && error && (
          <section className="card p-6 text-sm text-red-600 bg-red-50 border border-red-100">{error}</section>
        )}

        {canSeeReports && !loadingReport && !error && report && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Leads received"
                value={summary?.leadsReceived ?? 0}
                variant="hero"
                primaryColor={primary}
              />
              <MetricCard
                label="Assignments"
                value={summary?.assignments ?? 0}
                variant="secondary"
                primaryColor={primary}
              />
              <MetricCard
                label="Completed"
                value={summary?.completed ?? 0}
                variant="secondary"
                primaryColor={primary}
              />
            </section>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {compactMetrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  variant="compact"
                  primaryColor={primary}
                />
              ))}
            </section>

            <section className="card p-5">
              <h2 className="font-display font-semibold text-gray-900 text-base mb-4">Conversion funnel</h2>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {funnelStages.map((stage) => (
                  <FunnelStage
                    key={stage.label}
                    label={stage.label}
                    count={stage.count}
                    maxCount={maxFunnelCount}
                    primaryColor={primary}
                  />
                ))}
              </div>
            </section>

            <section>
              <article className="card p-5">
                <h2 className="font-display font-semibold text-gray-900 text-base mb-4">Leads by source</h2>
                {report.sourceBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-500">No data yet.</p>
                ) : (
                  <SourceBarChart data={report.sourceBreakdown} accentColor={secondary} />
                )}
              </article>
            </section>

            <section className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <h2 className="font-display font-semibold text-gray-900 text-base flex items-center gap-2">
                  <UserRound size={16} className="text-gray-400" />
                  Leaderboard
                </h2>
                <span className="text-xs text-gray-500">{report.period.label}</span>
              </div>
              {report.agentRows.length === 0 ? (
                <p className="px-5 py-5 text-sm text-gray-500">No team members found for this organisation.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        {[
                          { key: 'name', label: 'Agent' },
                          { key: 'assignments', label: 'Assigned' },
                          { key: 'contactAttempts', label: 'Contacted' },
                          { key: 'bookings', label: 'Booked' },
                          { key: 'completed', label: 'Completed' },
                          { key: 'lost', label: 'Lost' },
                          { key: 'bookingCancelled', label: 'Cancelled' },
                          { key: 'unassigned', label: 'Unassigned' },
                        ].map((column) => (
                          <th
                            key={column.key}
                            className={`px-4 py-3 font-medium ${column.key === 'name' ? 'text-left' : 'text-right'}`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSort(column.key as LeaderboardSortKey)}
                              className={`inline-flex items-center gap-1 hover:text-gray-700 ${
                                column.key === 'name' ? 'justify-start' : 'justify-end w-full'
                              }`}
                            >
                              <span>{column.label}</span>
                              <span className="text-[10px] text-gray-400">
                                {sortBy === column.key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                              </span>
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAgentRows.map((row) => (
                        <tr key={row.agentId} className="border-t border-gray-100">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{row.name}</span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
                                {row.role.replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.assignments}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.contactAttempts}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.bookings}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.completed}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.lost}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.bookingCancelled}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.unassigned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {!hasAnyActivity && (
              <section className="card p-5 text-sm text-gray-500">
                No tracked reporting activity yet for this month.
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
