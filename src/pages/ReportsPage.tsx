import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
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
import type { ConversionMetric } from '../lib/reporting/types'

function formatConversion(metric: ConversionMetric): string {
  if (metric.rate == null) return 'no data yet'
  return `${Math.round(metric.rate * 100)}%`
}

function formatConversionFromCounts(numerator: number, denominator: number): string {
  if (denominator === 0) return 'no data yet'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function formatHours(value: number | null): string {
  if (value == null) return 'no data yet'
  return `${value.toFixed(1)}h`
}

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
    const assigned = report?.conversions.assignedToContacted.denominator ?? 0
    const contacted = report?.conversions.assignedToContacted.numerator ?? 0
    const booked = report?.conversions.contactedToBooked.numerator ?? 0

    return [
      { label: 'Received', count: received },
      { label: 'Assigned', count: assigned },
      { label: 'Contacted', count: contacted },
      { label: 'Booked', count: booked },
    ]
  }, [report, summary?.leadsReceived])

  const maxFunnelCount = useMemo(
    () => Math.max(...funnelStages.map((stage) => stage.count), 0),
    [funnelStages]
  )

  const funnelConversionLabels = useMemo(
    () => [
      formatConversionFromCounts(funnelStages[1].count, funnelStages[0].count),
      formatConversion(report?.conversions.assignedToContacted ?? { numerator: 0, denominator: 0, rate: null }),
      formatConversion(report?.conversions.contactedToBooked ?? { numerator: 0, denominator: 0, rate: null }),
    ],
    [funnelStages, report]
  )

  const hasAnyActivity = useMemo(
    () => funnelStages.some((stage) => stage.count > 0),
    [funnelStages]
  )

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
            <section className="grid gap-3 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <MetricCard
                  label="Leads received"
                  value={summary?.leadsReceived ?? 0}
                  variant="hero"
                  primaryColor={primary}
                />
              </div>
              <div className="space-y-3">
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
              </div>
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
              <div className="flex flex-col xl:flex-row xl:items-center gap-3">
                {funnelStages.map((stage, index) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <FunnelStage
                      label={stage.label}
                      count={stage.count}
                      maxCount={maxFunnelCount}
                      primaryColor={primary}
                    />
                    {index < funnelStages.length - 1 && (
                      <div className="text-xs text-gray-500 min-w-[96px] text-center">
                        <p className="hidden xl:block">→</p>
                        <p className="font-medium">{funnelConversionLabels[index]}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid md:grid-cols-2 gap-4">
              <article className="card p-5">
                <h2 className="font-display font-semibold text-gray-900 text-base mb-4 flex items-center gap-2">
                  <Clock3 size={16} className="text-gray-400" />
                  Timing
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Avg time to first contact</span>
                    <span className="font-semibold text-gray-900">
                      {formatHours(report.timing.avgHoursToFirstContact)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Avg time to booking</span>
                    <span className="font-semibold text-gray-900">
                      {formatHours(report.timing.avgHoursToBooking)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Samples: {report.timing.firstContactSamples} first contact · {report.timing.bookingSamples} booking
                  </p>
                </div>
              </article>

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
                  Per-agent activity
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
                        <th className="text-left px-4 py-3 font-medium">Agent</th>
                        <th className="text-right px-4 py-3 font-medium">Assigned</th>
                        <th className="text-right px-4 py-3 font-medium">Contacts</th>
                        <th className="text-right px-4 py-3 font-medium">Bookings</th>
                        <th className="text-right px-4 py-3 font-medium">Completed</th>
                        <th className="text-right px-4 py-3 font-medium">Review req</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.agentRows.map((row) => (
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
                          <td className="px-4 py-3 text-right text-gray-700">{row.reviewRequests}</td>
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
