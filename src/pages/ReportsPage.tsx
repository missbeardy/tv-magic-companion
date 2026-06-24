import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
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
import { buildMonthOptions, formatMonthLabel, getMonthKey, getMonthStart } from '../lib/reporting/dateRange'
import { fetchFirstLeadEventMonth, fetchReportingData, type ReportingResult } from '../lib/reporting/fetchReportData'
import type { ConversionMetric } from '../lib/reporting/types'

function formatConversion(metric: ConversionMetric): string {
  if (metric.rate == null) return '—'
  return `${Math.round(metric.rate * 100)}%`
}

function formatSamples(metric: ConversionMetric): string {
  return `${metric.numerator}/${metric.denominator}`
}

function formatHours(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}h`
}

function getSummaryCards(report: ReportingResult | null) {
  const summary = report?.summary
  return [
    { label: 'Leads received', value: summary?.leadsReceived ?? 0 },
    { label: 'Assignments', value: summary?.assignments ?? 0 },
    { label: 'Contact attempts', value: summary?.contactAttempts ?? 0 },
    { label: 'Bookings', value: summary?.bookings ?? 0 },
    { label: 'Completed', value: summary?.completed ?? 0 },
    { label: 'Lost', value: summary?.lost ?? 0 },
    { label: 'Expired', value: summary?.expired ?? 0 },
    { label: 'Review requests', value: summary?.reviewRequests ?? 0 },
  ]
}

export default function ReportsPage() {
  const { profile } = useAuth()
  const { canAccessFeature } = useOrg()
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

  const summaryCards = getSummaryCards(report)
  const hasAnyActivity = useMemo(
    () => summaryCards.some((card) => card.value > 0),
    [summaryCards]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display font-bold text-gray-900 text-xl flex items-center gap-2">
              <FileBarChart size={20} className="text-[#004B93]" />
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
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {summaryCards.map((card) => (
                <article key={card.label} className="card p-4">
                  <p className="font-display font-bold text-2xl text-gray-900 leading-none">{card.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{card.label}</p>
                </article>
              ))}
            </section>

            <section className="card p-5">
              <h2 className="font-display font-semibold text-gray-900 text-base mb-4">Conversion rates</h2>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Assigned to contacted</p>
                  <p className="font-display font-bold text-2xl text-gray-900 mt-1">{formatConversion(report.conversions.assignedToContacted)}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSamples(report.conversions.assignedToContacted)}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Contacted to booked</p>
                  <p className="font-display font-bold text-2xl text-gray-900 mt-1">{formatConversion(report.conversions.contactedToBooked)}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSamples(report.conversions.contactedToBooked)}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Booked to completed</p>
                  <p className="font-display font-bold text-2xl text-gray-900 mt-1">{formatConversion(report.conversions.bookedToCompleted)}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatSamples(report.conversions.bookedToCompleted)}</p>
                </div>
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
                    <span className="font-semibold text-gray-900">{formatHours(report.timing.avgHoursToFirstContact)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Avg time to booking</span>
                    <span className="font-semibold text-gray-900">{formatHours(report.timing.avgHoursToBooking)}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Samples: {report.timing.firstContactSamples} first contact · {report.timing.bookingSamples} booking
                  </p>
                </div>
              </article>

              <article className="card p-5">
                <h2 className="font-display font-semibold text-gray-900 text-base mb-4">Leads by source</h2>
                {report.sourceBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-500">No leads created in this month.</p>
                ) : (
                  <div className="space-y-2">
                    {report.sourceBreakdown.map((row) => (
                      <div key={row.source} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
                        <span className="text-gray-600">{row.source}</span>
                        <span className="font-semibold text-gray-900">{row.count}</span>
                      </div>
                    ))}
                  </div>
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
              <section className="card p-5 text-sm text-gray-500 flex items-center gap-2">
                <BarChart3 size={16} className="text-gray-400" />
                No tracked reporting activity yet for this month.
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
