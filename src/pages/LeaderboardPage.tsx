import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Crown,
  Minus,
  Pencil,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useOrgProfiles } from '../hooks/useOrgProfiles'
import { useCountUp } from '../hooks/useCountUp'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { isManagerRole } from '../lib/roles'
import { showToast } from '../lib/toast'
import {
  addWeeks,
  buildDraft,
  canGoToNextWeek,
  computeMovement,
  diffDraft,
  fetchWeekEntries,
  formatAud,
  formatWeekName,
  formatWeekRange,
  getGapAbove,
  getLeaderMargin,
  getWeekStart,
  hasAnyResults,
  hasSeenReveal,
  isCurrentWeek,
  markRevealSeen,
  mergeRosterWithEntries,
  parseDateKey,
  saveWeekEntries,
  sortLeaderboardRows,
  toDateKey,
  type LeaderboardDraft,
  type LeaderboardRow,
} from '../lib/leaderboard'

/** Medal treatment for the top three. Rank is also spelled out, never colour alone. */
const MEDALS = [
  { label: '1st', ring: '#F5B301', tint: '#FFF7E0', ink: '#8A5B00' },
  { label: '2nd', ring: '#9AA5B1', tint: '#F3F5F7', ink: '#4B5563' },
  { label: '3rd', ring: '#C77B3E', tint: '#FBF0E7', ink: '#8A4B18' },
] as const

/**
 * Open on the week a notification names, when it names a valid, non-future one.
 * Anything unparseable or ahead of today falls back to the current week rather than
 * showing a board that cannot exist.
 */
function resolveInitialWeek(param: string | null): Date {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return getWeekStart()
  const parsed = parseDateKey(param)
  if (Number.isNaN(parsed.getTime())) return getWeekStart()
  const normalised = getWeekStart(parsed)
  return normalised.getTime() <= getWeekStart().getTime() ? normalised : getWeekStart()
}

/** Reveal stages: 0 curtain, 1 third, 2 second, 3 first, 4 the whole board. */
const REVEAL_DONE = 4

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export default function LeaderboardPage() {
  const { profile } = useAuth()
  const { primary, secondary } = useTheme()
  const { fetchOrgProfiles } = useOrgProfiles()
  const reducedMotion = usePrefersReducedMotion()
  const [searchParams] = useSearchParams()

  const canEdit = isManagerRole(profile?.role)

  // The Monday nudge links to the week it is celebrating, which by then is already last
  // week. Without honouring `?week=`, tapping the notification would land on the fresh,
  // empty week and show nothing.
  const [weekStart, setWeekStart] = useState<Date>(() =>
    resolveInitialWeek(searchParams.get('week'))
  )
  const [navDirection, setNavDirection] = useState<'fwd' | 'back'>('fwd')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [previousRows, setPreviousRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LeaderboardDraft>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** Bumped to re-run the load: retry after an error, refresh after a save. */
  const [reloadToken, setReloadToken] = useState(0)

  const orgId = profile?.org_id
  const editorId = profile?.id
  const weekKey = toDateKey(weekStart)
  /**
   * Which week is mid-reveal and how far through. `seq` is the stable identity of one
   * run: the stepping effect keys on it so advancing the step cannot tear down its own
   * pending timers, which would strand the sequence on whichever card it had reached.
   */
  const [reveal, setReveal] = useState<{ week: string; step: number; seq: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadWeek() {
      if (!orgId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      try {
        // Last week comes along for the ride so the board can show movement. It is the
        // cheapest way to give someone who is not winning a reason to open this.
        // The roster includes people who have left so past weeks keep their results; the
        // merge then drops them from the current week, which is about who is working now.
        const [employees, entries, priorEntries] = await Promise.all([
          fetchOrgProfiles({ roles: ['employee'], includeDeparted: true }),
          fetchWeekEntries(orgId, weekStart),
          fetchWeekEntries(orgId, addWeeks(weekStart, -1)),
        ])
        if (cancelled) return
        const keepDeparted = !isCurrentWeek(weekStart)
        setRows(
          sortLeaderboardRows(
            mergeRosterWithEntries(employees, entries, { keepDepartedWithEntries: keepDeparted })
          )
        )
        setPreviousRows(
          sortLeaderboardRows(
            mergeRosterWithEntries(employees, priorEntries, { keepDepartedWithEntries: true })
          )
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the leaderboard')
        setRows([])
        setPreviousRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadWeek()
    return () => {
      cancelled = true
    }
  }, [orgId, weekStart, reloadToken, fetchOrgProfiles])

  const sorted = useMemo(() => sortLeaderboardRows(rows), [rows])
  const podium = sorted.slice(0, 3)
  const anyResults = hasAnyResults(sorted)
  const topSales = sorted[0]?.salesAmount ?? 0
  const isThisWeek = isCurrentWeek(weekStart)
  const canGoForward = canGoToNextWeek(weekStart)

  const totals = useMemo(
    () => ({
      jobs: sorted.reduce((sum, r) => sum + r.jobsCompleted, 0),
      sales: sorted.reduce((sum, r) => sum + r.salesAmount, 0),
      people: sorted.length,
    }),
    [sorted]
  )

  const movement = useMemo(
    () => computeMovement(sorted, previousRows),
    [sorted, previousRows]
  )

  const myIndex = sorted.findIndex((r) => r.technicianId === profile?.id)
  const myRow = myIndex >= 0 ? sorted[myIndex] : null

  /**
   * Does this week deserve its reveal?
   *
   * Two ways in. A notification link (`?reveal=1`) reveals exactly the week it names,
   * which is last week by the time Monday's nudge lands. Otherwise the reveal is offered
   * once per device for the *current* week, so navigating back through history stays
   * quiet instead of replaying old celebrations.
   */
  const linkedWeek = searchParams.get('week')
  const linkedReveal =
    searchParams.get('reveal') === '1' && (!linkedWeek || linkedWeek === weekKey)

  const revealPending =
    !loading &&
    !editing &&
    anyResults &&
    (linkedReveal || (isThisWeek && !hasSeenReveal(weekKey)))

  // Render-phase start: the curtain has to be down on the very first painted frame, or
  // the board flashes fully visible before the sequence begins.
  if (revealPending && !reducedMotion && reveal?.week !== weekKey) {
    setReveal({ week: weekKey, step: 0, seq: (reveal?.seq ?? 0) + 1 })
  }

  const revealStep = reveal?.week === weekKey ? reveal.step : REVEAL_DONE
  const revealing = revealStep < REVEAL_DONE

  // Mark it seen as soon as it is owed, reduced motion included — someone who opted out
  // of animation should not be re-offered the reveal on every visit.
  useEffect(() => {
    if (revealPending) markRevealSeen(weekKey)
  }, [revealPending, weekKey])

  const revealSeq = reveal?.week === weekKey ? reveal.seq : 0

  useEffect(() => {
    if (!revealSeq) return
    const bump = (step: number, delay: number) =>
      setTimeout(() => setReveal({ week: weekKey, step, seq: revealSeq }), delay)
    const timers = [bump(1, 700), bump(2, 1500), bump(3, 2400), bump(4, 3500)]
    return () => timers.forEach(clearTimeout)
  }, [revealSeq, weekKey])

  function goToWeek(offset: number) {
    if (offset > 0 && !canGoForward) return
    setNavDirection(offset > 0 ? 'fwd' : 'back')
    setWeekStart((current) => addWeeks(current, offset))
    // The week controls are disabled while editing, so nothing typed is lost here —
    // this just guarantees the next week never opens in a stale edit state.
    setEditing(false)
    setFieldErrors({})
    setReveal(null)
  }

  function startEditing() {
    setDraft(buildDraft(sorted))
    setFieldErrors({})
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setFieldErrors({})
  }

  async function handleSave() {
    if (!orgId || !editorId) return
    const { changed, errors } = diffDraft(sorted, draft)

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      showToast({ message: 'Fix the highlighted values before saving', variant: 'error' })
      return
    }

    setFieldErrors({})

    if (changed.length === 0) {
      setEditing(false)
      showToast({ message: 'No changes to save', variant: 'info' })
      return
    }

    setSaving(true)
    try {
      await saveWeekEntries({ orgId, weekStart, editorId, changed })
      setEditing(false)
      // Reload rather than patch local state: the board re-sorts, so a technician who
      // just took the lead visibly moves up instead of staying put until the next visit.
      setReloadToken((t) => t + 1)
      showToast({
        message: `Saved ${changed.length} ${changed.length === 1 ? 'result' : 'results'}`,
        variant: 'success',
      })
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Could not save the leaderboard',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  function updateDraft(technicianId: string, patch: Partial<{ jobs: string; sales: string }>) {
    setDraft((current) => ({
      ...current,
      [technicianId]: { ...(current[technicianId] ?? { jobs: '0', sales: '0' }), ...patch },
    }))
    setFieldErrors((current) => {
      if (!current[technicianId]) return current
      const next = { ...current }
      delete next[technicianId]
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-24 md:pb-8">
        <header className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display font-bold text-gray-900 text-xl flex items-center gap-2">
                <Trophy size={20} style={{ color: primary }} />
                Leaderboard
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Jobs and sales by technician, week by week.
              </p>
            </div>

            {canEdit && !editing && !loading && sorted.length > 0 && (
              <button
                type="button"
                onClick={startEditing}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white focus-brand"
                style={{ backgroundColor: primary }}
              >
                <Pencil size={15} />
                Edit
              </button>
            )}
          </div>

          {/* Week navigation */}
          <div className="flex items-center justify-between gap-2 card px-3 py-2">
            <button
              type="button"
              onClick={() => goToWeek(-1)}
              disabled={editing}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed focus-brand"
              aria-label="Previous week"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="text-center min-w-0">
              <p className="font-display font-bold text-gray-900 text-sm truncate">
                {formatWeekName(weekStart)}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {formatWeekRange(weekStart)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => goToWeek(1)}
              disabled={!canGoForward || editing}
              className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed focus-brand"
              aria-label="Next week"
              title={canGoForward ? 'Next week' : 'The current week is the latest'}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </header>

        {loading && <LeaderboardSkeleton />}

        {!loading && error && (
          <section className="card p-5 text-sm text-red-700 bg-red-50 border border-red-100 space-y-3">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setReloadToken((t) => t + 1)}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-sm font-semibold"
            >
              Try again
            </button>
          </section>
        )}

        {!loading && !error && sorted.length === 0 && (
          <section className="card p-8 text-center space-y-2">
            <Users size={28} className="mx-auto text-gray-300" />
            <p className="font-display font-bold text-gray-900">No technicians yet</p>
            <p className="text-sm text-gray-500">
              Add employees to your team and their weekly results will show up here.
            </p>
          </section>
        )}

        {!loading && !error && sorted.length > 0 && (
          <div
            key={weekKey}
            className={navDirection === 'fwd' ? 'week-enter-fwd space-y-5' : 'week-enter-back space-y-5'}
          >
            {revealing && (
              <section className="reveal-curtain text-center py-2" aria-live="polite">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-400">
                  {formatWeekRange(weekStart)}
                </p>
                <p className="font-display font-extrabold text-gray-900 text-2xl mt-1">
                  This week’s results
                </p>
              </section>
            )}

            {/* Week totals — a hero row, not a chart: three single numbers. */}
            {!revealing && (
              <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Week totals">
                <TotalTile label="Technicians" value={totals.people} weekKey={weekKey} />
                <TotalTile label="Jobs" value={totals.jobs} weekKey={weekKey} />
                <TotalTile
                  label="Sales"
                  value={totals.sales}
                  weekKey={weekKey}
                  format={formatAud}
                  accent={primary}
                />
              </section>
            )}

            {!anyResults && (
              <section className="card p-6 text-center space-y-1.5">
                <Trophy size={26} className="mx-auto text-gray-300" />
                <p className="font-display font-bold text-gray-900">
                  {isThisWeek ? 'The week is still wide open' : 'Nothing was recorded this week'}
                </p>
                <p className="text-sm text-gray-500">
                  {canEdit
                    ? 'Tap Edit to enter jobs and sales for your team.'
                    : 'Your manager has not posted results for this week yet.'}
                </p>
              </section>
            )}

            {anyResults && !editing && (
              <Podium
                rows={podium}
                primary={primary}
                secondary={secondary}
                weekKey={weekKey}
                revealStep={revealStep}
              />
            )}

            {myRow && anyResults && !editing && !revealing && (
              <YouCard
                row={myRow}
                rank={myIndex + 1}
                sorted={sorted}
                movement={movement.get(myRow.technicianId) ?? null}
                primary={primary}
              />
            )}

            {!revealing && (
              <ResultsTable
                rows={sorted}
                editing={editing}
                draft={draft}
                fieldErrors={fieldErrors}
                onDraftChange={updateDraft}
                topSales={topSales}
                primary={primary}
                weekKey={weekKey}
                movement={movement}
                viewerId={profile?.id}
              />
            )}

            {editing && (
              <div className="sticky bottom-20 md:bottom-4 z-10 flex items-center gap-2 card p-3 shadow-lg">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-brand"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <X size={15} />
                    Cancel
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-60 focus-brand"
                  style={{ backgroundColor: primary }}
                >
                  {saving ? 'Saving…' : 'Save week'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function TotalTile({
  label,
  value,
  weekKey,
  format,
  accent,
}: {
  label: string
  value: number
  weekKey: string
  format?: (n: number) => string
  accent?: string
}) {
  const animated = useCountUp(value, { key: weekKey, durationMs: 800 })
  const shown = format ? format(animated) : Math.round(animated).toLocaleString('en-AU')

  return (
    <div className="card px-3 py-3 text-center">
      <p
        className="font-display font-extrabold text-lg sm:text-xl tabular-nums truncate"
        style={{ color: accent ?? '#111827' }}
      >
        {shown}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

/**
 * Top three. During a reveal the cards arrive bottom-up — 3rd, then 2nd, then the
 * winner — so the sequence builds instead of dumping the answer on the first frame.
 * `revealStep` is REVEAL_DONE on an ordinary visit, which shows everything at once.
 */
function Podium({
  rows,
  primary,
  secondary,
  weekKey,
  revealStep,
}: {
  rows: LeaderboardRow[]
  primary: string
  secondary: string
  weekKey: string
  revealStep: number
}) {
  if (rows.length === 0) return null
  const [first, ...rest] = rows

  return (
    <section aria-label="Top performers" className="space-y-3">
      {revealStep >= 3 && (
        <ChampionCard row={first} primary={primary} secondary={secondary} weekKey={weekKey} />
      )}

      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {rest.map((row, index) => {
            const rank = index + 2
            // 3rd place is revealed first, so it needs the lower step.
            if (revealStep < (rank === 3 ? 1 : 2)) {
              return <div key={row.technicianId} aria-hidden="true" />
            }
            return <RunnerUpCard key={row.technicianId} row={row} rank={rank} weekKey={weekKey} />
          })}
        </div>
      )}
    </section>
  )
}

/** ▲2 / ▼1 / — against last week. Null means there is nothing to compare against. */
function MovementBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null

  if (delta === 0) {
    return (
      <span className="inline-flex items-center text-gray-300" title="No change from last week">
        <Minus size={12} aria-hidden="true" />
        <span className="sr-only">No change from last week</span>
      </span>
    )
  }

  const up = delta > 0
  const places = Math.abs(delta)
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
        up ? 'text-emerald-600' : 'text-gray-400'
      }`}
    >
      {up ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      {places}
      <span className="sr-only">
        {up ? `Up ${places} place` : `Down ${places} place`}
        {places === 1 ? '' : 's'} from last week
      </span>
    </span>
  )
}

/**
 * The viewer's own standing, called out above the table.
 *
 * A rank on its own is a label. The gap is a target — "$460 behind Zed" is something
 * you can act on before Friday, which is the whole point of showing it.
 */
function YouCard({
  row,
  rank,
  sorted,
  movement,
  primary,
}: {
  row: LeaderboardRow
  rank: number
  sorted: LeaderboardRow[]
  movement: number | null
  primary: string
}) {
  const leading = rank === 1
  const gap = leading ? getLeaderMargin(sorted) : getGapAbove(sorted, rank - 1)
  const chaser = leading ? sorted[1] : sorted[rank - 2]

  return (
    <section
      className="card p-4 border-l-4"
      style={{ borderLeftColor: primary }}
      aria-label="Your standing"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">You</p>
          <p className="font-display font-extrabold text-gray-900 text-lg flex items-center gap-2">
            {leading ? 'Top of the board' : `${rank}${ordinalSuffix(rank)} this week`}
            <MovementBadge delta={movement} />
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {!chaser
              ? 'You are the only one on the board this week.'
              : leading
                ? gap > 0
                  ? `Clear of ${chaser.name} by ${formatAud(gap)}.`
                  : `Level with ${chaser.name} — next job breaks the tie.`
                : gap > 0
                  ? `${formatAud(gap)} behind ${chaser.name}.`
                  : `Level with ${chaser.name} — next job breaks the tie.`}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="font-display font-extrabold text-xl tabular-nums" style={{ color: primary }}>
            {formatAud(row.salesAmount)}
          </p>
          <p className="text-xs text-gray-500 tabular-nums">
            {row.jobsCompleted} {row.jobsCompleted === 1 ? 'job' : 'jobs'}
          </p>
        </div>
      </div>
    </section>
  )
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  if (n % 10 === 1) return 'st'
  if (n % 10 === 2) return 'nd'
  if (n % 10 === 3) return 'rd'
  return 'th'
}

function ChampionCard({
  row,
  primary,
  secondary,
  weekKey,
}: {
  row: LeaderboardRow
  primary: string
  secondary: string
  weekKey: string
}) {
  const sales = useCountUp(row.salesAmount, { key: weekKey, durationMs: 1100 })
  const jobs = useCountUp(row.jobsCompleted, { key: weekKey, durationMs: 900 })

  return (
    <article
      className="podium-reveal champion-glow relative overflow-hidden rounded-2xl text-white p-5"
      style={
        {
          '--reveal-delay': '260ms',
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 140%)`,
        } as CSSProperties
      }
    >
      <span className="champion-sheen" aria-hidden="true" />

      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <Crown
            size={22}
            className="crown-float absolute -top-3.5 left-1/2 -translate-x-1/2"
            style={{ color: '#FFD75E' }}
            aria-hidden="true"
          />
          <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/60 overflow-hidden flex items-center justify-center">
            {row.avatarUrl ? (
              <img src={row.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-extrabold text-2xl">{initials(row.name)}</span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/75">
            1st · Top of the board
          </p>
          <p className="font-display font-extrabold text-xl truncate">{row.name}</p>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-display font-extrabold text-2xl tabular-nums">
              {formatAud(sales)}
            </span>
            <span className="text-sm text-white/85 tabular-nums">
              {Math.round(jobs)} {Math.round(jobs) === 1 ? 'job' : 'jobs'}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}

function RunnerUpCard({
  row,
  rank,
  weekKey,
}: {
  row: LeaderboardRow
  rank: number
  weekKey: string
}) {
  const medal = MEDALS[rank - 1] ?? MEDALS[2]
  const sales = useCountUp(row.salesAmount, { key: weekKey, durationMs: 950 })

  return (
    <article
      className="podium-reveal card p-3.5"
      style={{ '--reveal-delay': rank === 2 ? '120ms' : '0ms' } as CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="medal-shine w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-display font-extrabold text-xs"
          style={{ backgroundColor: medal.tint, color: medal.ink, border: `2px solid ${medal.ring}` }}
        >
          {rank}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{row.name}</p>
          <p className="text-[11px] text-gray-400">{medal.label} place</p>
        </div>
      </div>
      <p className="font-display font-extrabold text-gray-900 text-lg tabular-nums mt-2.5">
        {formatAud(sales)}
      </p>
      <p className="text-xs text-gray-500 tabular-nums">
        {row.jobsCompleted} {row.jobsCompleted === 1 ? 'job' : 'jobs'}
      </p>
    </article>
  )
}

function ResultsTable({
  rows,
  editing,
  draft,
  fieldErrors,
  onDraftChange,
  topSales,
  primary,
  weekKey,
  movement,
  viewerId,
}: {
  rows: LeaderboardRow[]
  editing: boolean
  draft: LeaderboardDraft
  fieldErrors: Record<string, string>
  onDraftChange: (technicianId: string, patch: Partial<{ jobs: string; sales: string }>) => void
  topSales: number
  primary: string
  weekKey: string
  movement: Map<string, number | null>
  viewerId: string | undefined
}) {
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Weekly results by technician, sorted by sales from highest to lowest
          </caption>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th scope="col" className="text-left font-semibold text-gray-500 text-xs uppercase tracking-wide px-3 py-2.5">
                Technician
              </th>
              <th scope="col" className="text-right font-semibold text-gray-500 text-xs uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">
                Jobs Completed
              </th>
              <th
                scope="col"
                aria-sort="descending"
                className="text-right font-semibold text-gray-500 text-xs uppercase tracking-wide px-3 py-2.5"
              >
                Sales ↓
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <TableRow
                key={row.technicianId}
                row={row}
                rank={index + 1}
                editing={editing}
                draft={draft[row.technicianId]}
                fieldError={fieldErrors[row.technicianId]}
                onDraftChange={onDraftChange}
                share={topSales > 0 ? row.salesAmount / topSales : 0}
                primary={primary}
                revealDelay={Math.min(index, 8) * 45 + (editing ? 0 : 420)}
                weekKey={weekKey}
                movement={movement.get(row.technicianId) ?? null}
                isViewer={Boolean(viewerId) && row.technicianId === viewerId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TableRow({
  row,
  rank,
  editing,
  draft,
  fieldError,
  onDraftChange,
  share,
  primary,
  revealDelay,
  weekKey,
  movement,
  isViewer,
}: {
  row: LeaderboardRow
  rank: number
  editing: boolean
  draft: { jobs: string; sales: string } | undefined
  fieldError: string | undefined
  onDraftChange: (technicianId: string, patch: Partial<{ jobs: string; sales: string }>) => void
  share: number
  primary: string
  revealDelay: number
  weekKey: string
  movement: number | null
  isViewer: boolean
}) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null

  return (
    <tr
      className={editing ? 'border-b border-gray-50 last:border-0' : 'row-reveal border-b border-gray-50 last:border-0'}
      style={editing ? undefined : ({ '--reveal-delay': `${revealDelay}ms` } as CSSProperties)}
    >
      <th scope="row" className="text-left font-normal px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-display font-extrabold"
            style={
              medal
                ? { backgroundColor: medal.tint, color: medal.ink, border: `1.5px solid ${medal.ring}` }
                : { backgroundColor: '#F3F4F6', color: '#6B7280' }
            }
          >
            {rank}
          </span>
          <div className="min-w-0">
            <span className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
              <span className="truncate">{row.name}</span>
              {isViewer && (
                <span className="badge badge-grey shrink-0" aria-label="This is you">
                  You
                </span>
              )}
              {row.departed && (
                <span className="badge badge-grey shrink-0" aria-label="No longer with the team">
                  Departed
                </span>
              )}
              {!editing && <MovementBadge delta={movement} />}
            </span>
            {/* Magnitude meter: one measure, one hue, share of the leader's sales. */}
            {!editing && share > 0 && (
              <span className="block mt-1 h-1.5 w-24 sm:w-40 rounded-full bg-gray-100 overflow-hidden">
                <span
                  className="meter-fill block h-full rounded-full"
                  style={
                    {
                      width: `${Math.max(share * 100, 3)}%`,
                      backgroundColor: primary,
                      opacity: rank <= 3 ? 1 : 0.55,
                      '--reveal-delay': `${revealDelay + 80}ms`,
                    } as CSSProperties
                  }
                />
              </span>
            )}
          </div>
        </div>
        {fieldError && (
          <p className="text-xs text-red-600 mt-1" role="alert">
            {fieldError}
          </p>
        )}
      </th>

      <td className="px-3 py-2.5 text-right align-top">
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`jobs-${row.technicianId}`}>
              Jobs completed for {row.name}
            </label>
            <input
              id={`jobs-${row.technicianId}`}
              type="text"
              inputMode="numeric"
              value={draft?.jobs ?? ''}
              onChange={(e) => onDraftChange(row.technicianId, { jobs: e.target.value })}
              className={`w-16 sm:w-20 px-2 py-1.5 rounded-lg border text-right tabular-nums focus-brand ${
                fieldError ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
          </>
        ) : (
          <span className="tabular-nums text-gray-700">{row.jobsCompleted}</span>
        )}
      </td>

      <td className="px-3 py-2.5 text-right align-top">
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`sales-${row.technicianId}`}>
              Sales in Australian dollars for {row.name}
            </label>
            <div className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="text-gray-400">
                $
              </span>
              <input
                id={`sales-${row.technicianId}`}
                type="text"
                inputMode="decimal"
                value={draft?.sales ?? ''}
                onChange={(e) => onDraftChange(row.technicianId, { sales: e.target.value })}
                className={`w-24 sm:w-28 px-2 py-1.5 rounded-lg border text-right tabular-nums focus-brand ${
                  fieldError ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
          </>
        ) : (
          <SalesCell amount={row.salesAmount} weekKey={weekKey} />
        )}
      </td>
    </tr>
  )
}

function SalesCell({ amount, weekKey }: { amount: number; weekKey: string }) {
  const animated = useCountUp(amount, { key: weekKey, durationMs: 700 })
  return <span className="tabular-nums font-semibold text-gray-900">{formatAud(animated)}</span>
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading leaderboard">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-4">
            <div className="skeleton-sweep h-5 rounded" />
          </div>
        ))}
      </div>
      <div className="skeleton-sweep h-28 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton-sweep h-24 rounded-2xl" />
        <div className="skeleton-sweep h-24 rounded-2xl" />
      </div>
      <div className="card p-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-sweep h-6 rounded" />
        ))}
      </div>
    </div>
  )
}
