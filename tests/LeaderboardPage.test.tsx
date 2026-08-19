import '@testing-library/jest-dom/vitest'
import React from 'react'
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchOrgProfilesMock = vi.fn()
const upsertMock = vi.fn()

let currentProfile: {
  id: string
  full_name: string
  role: 'manager' | 'employee' | 'platform_admin'
  org_id: string
} | null = null

/** Entries keyed by `week_start`, so the page's this-week/last-week pair can differ. */
let entriesByWeek: Record<string, unknown[]> = {}
let entriesError: { message: string } | null = null

vi.mock('../src/components/NavBar', () => ({ default: () => null }))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ profile: currentProfile, loading: false }),
}))

vi.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({
    primary: '#004B93',
    secondary: '#00B4C5',
    primaryDark: '#003d7a',
    displayName: 'Test Co',
    logoUrl: null,
  }),
}))

vi.mock('../src/hooks/useOrgProfiles', () => ({
  useOrgProfiles: () => ({ fetchOrgProfiles: fetchOrgProfilesMock }),
}))

vi.mock('../src/lib/supabase', () => {
  function makeQuery() {
    let week = ''
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        if (column === 'week_start') week = value
        return query
      },
      upsert: (...args: unknown[]) => upsertMock(...args),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(
          entriesError
            ? { data: null, error: entriesError }
            : { data: entriesByWeek[week] ?? [], error: null }
        ).then(resolve, reject),
    }
    return query
  }
  // A fresh builder per `.from()` — the page runs two week queries concurrently, and a
  // shared builder would let the second overwrite the first's week filter.
  return { supabase: { from: () => makeQuery() } }
})

import LeaderboardPage from '../src/pages/LeaderboardPage'
import { addWeeks, toDateKey, getWeekStart } from '../src/lib/leaderboard'

const THIS_WEEK = toDateKey(getWeekStart())
const LAST_WEEK = toDateKey(addWeeks(getWeekStart(), -1))

/** The page reads `?reveal=1`, so every render needs a router. */
function render(path = '/leaderboard') {
  return rtlRender(
    <MemoryRouter initialEntries={[path]}>
      <LeaderboardPage />
    </MemoryRouter>
  )
}

/** jsdom has no matchMedia; the page reads it for prefers-reduced-motion. */
function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const ROSTER = [
  { id: 'tech-1', full_name: 'Ava Bell', avatar_url: null },
  { id: 'tech-2', full_name: 'Zed Cruz', avatar_url: null },
]

function savedEntry(technicianId: string, jobs: number, sales: number, week = THIS_WEEK) {
  return {
    id: `entry-${technicianId}-${week}`,
    org_id: 'org-1',
    technician_id: technicianId,
    week_start: week,
    jobs_completed: jobs,
    sales_amount: sales,
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
    created_by: 'mgr-1',
    updated_by: 'mgr-1',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reduced motion by default: count-up tweens land on their final value immediately,
  // so assertions read the real figures instead of a mid-tween frame.
  setReducedMotion(true)
  currentProfile = { id: 'emp-1', full_name: 'Ava Bell', role: 'employee', org_id: 'org-1' }
  entriesByWeek = {}
  entriesError = null
  localStorage.clear()
  fetchOrgProfilesMock.mockResolvedValue(ROSTER)
  upsertMock.mockResolvedValue({ error: null })
})

afterEach(() => {
  // vitest runs without `globals`, so Testing Library never registers its own
  // auto-cleanup — without this every render stacks up in the same document.
  cleanup()
  vi.restoreAllMocks()
})

describe('LeaderboardPage — loading and empty states', () => {
  it('shows a busy state before the week resolves', () => {
    fetchOrgProfilesMock.mockReturnValue(new Promise(() => {}))
    render()
    expect(screen.getByLabelText('Loading leaderboard')).toBeInTheDocument()
  })

  it('tells the user when the org has no employees', async () => {
    fetchOrgProfilesMock.mockResolvedValue([])
    render()
    expect(await screen.findByText('No technicians yet')).toBeInTheDocument()
  })

  it('shows an all-zero week without a podium', async () => {
    render()
    expect(await screen.findByText('The week is still wide open')).toBeInTheDocument()
    expect(screen.queryByLabelText('Top performers')).not.toBeInTheDocument()
    // The roster still renders, at zero.
    expect(screen.getByText('Ava Bell')).toBeInTheDocument()
    expect(screen.getByText('Zed Cruz')).toBeInTheDocument()
  })

  it('surfaces a load failure with a retry that re-queries', async () => {
    fetchOrgProfilesMock.mockRejectedValueOnce(new Error('network down'))
    render()

    expect(await screen.findByText('network down')).toBeInTheDocument()

    fetchOrgProfilesMock.mockResolvedValue(ROSTER)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ava Bell')).toBeInTheDocument()
  })
})

describe('LeaderboardPage — reading the board', () => {
  beforeEach(() => {
    entriesByWeek = { [THIS_WEEK]: [savedEntry('tech-1', 3, 800), savedEntry('tech-2', 9, 2400)] }
  })

  it('sorts by sales descending, so the top seller leads the table', async () => {
    render()
    await screen.findByLabelText('Top performers')

    const rowHeaders = screen.getAllByRole('rowheader')
    expect(within(rowHeaders[0]).getByText('Zed Cruz')).toBeInTheDocument()
    expect(within(rowHeaders[1]).getByText('Ava Bell')).toBeInTheDocument()
  })

  it('keeps the columns to Technician, Jobs Completed and Sales', async () => {
    render()
    await screen.findByLabelText('Top performers')

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers).toEqual(['Technician', 'Jobs Completed', 'Sales ↓'])
  })

  it('marks the Sales column as the descending sort for screen readers', async () => {
    render()
    await screen.findByLabelText('Top performers')

    const sales = screen.getAllByRole('columnheader')[2]
    expect(sales).toHaveAttribute('aria-sort', 'descending')
  })

  it('names the Monday-to-Sunday span of the week on screen', async () => {
    render()
    expect(await screen.findByText('This week')).toBeInTheDocument()
    expect(screen.getByText(/Mon,.*–.*Sun,/)).toBeInTheDocument()
  })

  it('gives an employee no way to edit', async () => {
    render()
    await screen.findByLabelText('Top performers')

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('LeaderboardPage — week navigation', () => {
  it('blocks navigating into the future but allows going back', async () => {
    render()
    await screen.findByText('This week')

    expect(screen.getByLabelText('Next week')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Previous week'))
    expect(await screen.findByText('Last week')).toBeInTheDocument()
    expect(screen.getByLabelText('Next week')).not.toBeDisabled()
  })
})

describe('LeaderboardPage — manager editing', () => {
  beforeEach(() => {
    currentProfile = { id: 'mgr-1', full_name: 'Mo Reed', role: 'manager', org_id: 'org-1' }
    entriesByWeek = { [THIS_WEEK]: [savedEntry('tech-1', 3, 800)] }
  })

  it('upserts only the rows a manager actually changed', async () => {
    render()
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }))

    fireEvent.change(screen.getByLabelText('Jobs completed for Zed Cruz'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Sales in Australian dollars for Zed Cruz'), {
      target: { value: '1,250.50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save week' }))

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    const [payload, options] = upsertMock.mock.calls[0]
    expect(payload).toEqual([
      expect.objectContaining({
        org_id: 'org-1',
        technician_id: 'tech-2',
        jobs_completed: 5,
        sales_amount: 1250.5,
        updated_by: 'mgr-1',
      }),
    ])
    expect(options).toEqual({ onConflict: 'org_id,technician_id,week_start' })
  })

  it('refuses to save an invalid figure and says which row is wrong', async () => {
    render()
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }))

    fireEvent.change(screen.getByLabelText('Jobs completed for Ava Bell'), {
      target: { value: '3.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save week' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/whole number/i)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('saves nothing when the manager opens and closes the editor untouched', async () => {
    render()
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save week' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save week' })).not.toBeInTheDocument()
    )
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('keeps the week controls out of reach while editing, so typed values cannot vanish', async () => {
    render()
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }))

    expect(screen.getByLabelText('Previous week')).toBeDisabled()
    expect(screen.getByLabelText('Next week')).toBeDisabled()
  })

  it('hides the podium while editing so rows do not reorder under the cursor', async () => {
    entriesByWeek = { [THIS_WEEK]: [savedEntry('tech-1', 3, 800), savedEntry('tech-2', 9, 2400)] }
    render()
    await screen.findByLabelText('Top performers')

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.queryByLabelText('Top performers')).not.toBeInTheDocument()

    const rowHeaders = screen.getAllByRole('rowheader')
    expect(within(rowHeaders[0]).getByText('Zed Cruz')).toBeInTheDocument()
  })
})

describe('LeaderboardPage — the weekly reveal', () => {
  beforeEach(() => {
    entriesByWeek = {
      [THIS_WEEK]: [savedEntry('tech-1', 3, 800), savedEntry('tech-2', 9, 2400)],
    }
  })

  it('plays the reveal when the Friday notification sends them here', async () => {
    setReducedMotion(false)
    render('/leaderboard?reveal=1')

    expect(await screen.findByText('This week’s results')).toBeInTheDocument()
    // The board is still behind the curtain: no table, no totals.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Week totals')).not.toBeInTheDocument()
  })

  it('builds bottom-up — third place lands before the winner', async () => {
    setReducedMotion(false)
    render('/leaderboard?reveal=1')
    await screen.findByText('This week’s results')

    // Only two technicians, so 2nd is the last card before the winner.
    expect(screen.queryByText('Zed Cruz')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ava Bell')).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(screen.queryByText('Zed Cruz')).not.toBeInTheDocument()
  }, 20000)

  it('settles into the full board once the sequence finishes', async () => {
    setReducedMotion(false)
    render('/leaderboard?reveal=1')

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument(), {
      timeout: 15000,
    })
    expect(screen.queryByText('This week’s results')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Week totals')).toBeInTheDocument()
  }, 20000)

  it('skips straight to the board under reduced motion', async () => {
    setReducedMotion(true)
    render('/leaderboard?reveal=1')

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('This week’s results')).not.toBeInTheDocument()
  })

  it('does not replay for a week already revealed on this device', async () => {
    setReducedMotion(false)
    localStorage.setItem('leaderboard-reveal-seen', THIS_WEEK)

    render()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('This week’s results')).not.toBeInTheDocument()
  })

  it('marks the week seen so the next ordinary visit is quiet', async () => {
    setReducedMotion(true)
    render()
    await screen.findByRole('table')
    expect(localStorage.getItem('leaderboard-reveal-seen')).toBe(THIS_WEEK)
  })

  it('never reveals an all-zero week', async () => {
    setReducedMotion(false)
    entriesByWeek = {}
    render('/leaderboard?reveal=1')

    await screen.findByText('The week is still wide open')
    expect(screen.queryByText('This week’s results')).not.toBeInTheDocument()
  })

  it('never reveals a past week, however good it was', async () => {
    setReducedMotion(false)
    localStorage.setItem('leaderboard-reveal-seen', THIS_WEEK)
    entriesByWeek = {
      [THIS_WEEK]: [savedEntry('tech-1', 3, 800)],
      [LAST_WEEK]: [savedEntry('tech-2', 20, 9000, LAST_WEEK)],
    }
    render()
    await screen.findByRole('table')

    fireEvent.click(screen.getByLabelText('Previous week'))
    await screen.findByText('Last week')
    expect(screen.queryByText('This week’s results')).not.toBeInTheDocument()
  })
})

describe('LeaderboardPage — the Monday notification link', () => {
  beforeEach(() => {
    // Monday morning: this week is empty, last week is the one worth celebrating.
    entriesByWeek = {
      [THIS_WEEK]: [],
      [LAST_WEEK]: [
        savedEntry('tech-1', 3, 800, LAST_WEEK),
        savedEntry('tech-2', 9, 2400, LAST_WEEK),
      ],
    }
  })

  it('opens on the week the link names, not the fresh empty one', async () => {
    setReducedMotion(true)
    render(`/leaderboard?reveal=1&week=${LAST_WEEK}`)

    expect(await screen.findByText('Last week')).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    // Last week's figures, not this week's zeros.
    expect(screen.getByLabelText('Top performers')).toBeInTheDocument()
  })

  it('reveals a past week when the link asks for it', async () => {
    setReducedMotion(false)
    render(`/leaderboard?reveal=1&week=${LAST_WEEK}`)

    expect(await screen.findByText('This week’s results')).toBeInTheDocument()
  })

  it('does not reveal a past week reached by the arrows', async () => {
    setReducedMotion(false)
    localStorage.setItem('leaderboard-reveal-seen', THIS_WEEK)
    render()
    await screen.findByText('This week')

    fireEvent.click(screen.getByLabelText('Previous week'))
    await screen.findByText('Last week')
    expect(screen.queryByText('This week’s results')).not.toBeInTheDocument()
  })

  it('falls back to the current week when the link names a future one', async () => {
    setReducedMotion(true)
    const future = toDateKey(addWeeks(getWeekStart(), 3))
    render(`/leaderboard?reveal=1&week=${future}`)

    expect(await screen.findByText('This week')).toBeInTheDocument()
  })

  it('falls back to the current week when the link is malformed', async () => {
    setReducedMotion(true)
    render('/leaderboard?reveal=1&week=not-a-date')

    expect(await screen.findByText('This week')).toBeInTheDocument()
  })
})

describe('LeaderboardPage — your standing', () => {
  beforeEach(() => {
    setReducedMotion(true)
    localStorage.setItem('leaderboard-reveal-seen', THIS_WEEK)
    entriesByWeek = {
      [THIS_WEEK]: [savedEntry('tech-1', 3, 800), savedEntry('tech-2', 9, 2400)],
    }
  })

  it('shows the viewer the gap to the person above them', async () => {
    currentProfile = { id: 'tech-1', full_name: 'Ava Bell', role: 'employee', org_id: 'org-1' }
    render()

    const you = await screen.findByLabelText('Your standing')
    expect(within(you).getByText('2nd this week')).toBeInTheDocument()
    expect(within(you).getByText('$1,600 behind Zed Cruz.')).toBeInTheDocument()
  })

  it('tells the leader how far clear they are instead', async () => {
    currentProfile = { id: 'tech-2', full_name: 'Zed Cruz', role: 'employee', org_id: 'org-1' }
    render()

    const you = await screen.findByLabelText('Your standing')
    expect(within(you).getByText('Top of the board')).toBeInTheDocument()
    expect(within(you).getByText('Clear of Ava Bell by $1,600.')).toBeInTheDocument()
  })

  it('marks the viewer in the table', async () => {
    currentProfile = { id: 'tech-1', full_name: 'Ava Bell', role: 'employee', org_id: 'org-1' }
    render()
    await screen.findByRole('table')

    const rowHeaders = screen.getAllByRole('rowheader')
    expect(within(rowHeaders[1]).getByLabelText('This is you')).toBeInTheDocument()
    expect(within(rowHeaders[0]).queryByLabelText('This is you')).not.toBeInTheDocument()
  })

  it('shows no standing card for a manager, who is not on the board', async () => {
    currentProfile = { id: 'mgr-1', full_name: 'Mo Reed', role: 'manager', org_id: 'org-1' }
    render()
    await screen.findByRole('table')
    expect(screen.queryByLabelText('Your standing')).not.toBeInTheDocument()
  })
})

describe('LeaderboardPage — movement against last week', () => {
  beforeEach(() => {
    setReducedMotion(true)
    localStorage.setItem('leaderboard-reveal-seen', THIS_WEEK)
  })

  it('shows who climbed and who slipped', async () => {
    // Last week Ava led; this week Zed does. Ava drops one, Zed climbs one.
    entriesByWeek = {
      [THIS_WEEK]: [savedEntry('tech-1', 3, 800), savedEntry('tech-2', 9, 2400)],
      [LAST_WEEK]: [
        savedEntry('tech-1', 9, 3000, LAST_WEEK),
        savedEntry('tech-2', 2, 400, LAST_WEEK),
      ],
    }
    render()
    await screen.findByRole('table')

    const rowHeaders = screen.getAllByRole('rowheader')
    expect(within(rowHeaders[0]).getByText('Up 1 place from last week')).toBeInTheDocument()
    expect(within(rowHeaders[1]).getByText('Down 1 place from last week')).toBeInTheDocument()
  })

  it('claims no movement when last week was never posted', async () => {
    entriesByWeek = {
      [THIS_WEEK]: [savedEntry('tech-1', 3, 800), savedEntry('tech-2', 9, 2400)],
    }
    render()
    await screen.findByRole('table')

    expect(screen.queryByText(/place from last week/)).not.toBeInTheDocument()
    expect(screen.queryByText('No change from last week')).not.toBeInTheDocument()
  })
})
