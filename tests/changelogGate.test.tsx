// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/**
 * The changelog overlay must never reach a signed-out visitor.
 *
 * PwaUpdateLayer wraps every route, including `/quote/:token` and `/invoice/:token` — links
 * the tradie's own customer opens from an SMS or email. Before v1.1.181 those people were
 * shown a full-screen "What's New" about background job scheduling and the per-technician
 * sales leaderboard, in front of the invoice they came to pay.
 *
 * A session is the boundary being asserted here: the customer never has one.
 */

const mockUseAuth = vi.fn()
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }))

vi.mock('../src/context/PwaUpdateContext', () => ({
  PwaUpdateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePwaUpdateContext: () => ({ checkForUpdate: vi.fn() }),
}))

vi.mock('../src/lib/changelog', () => ({
  getCurrentReleaseWeekId: () => '17-08-2026',
  getUnseenChangelogEntries: () => [
    { weekStarts: '17-08-2026', title: 'Background jobs stay on time', items: ['internal note'] },
  ],
  markChangelogSeen: vi.fn(),
  shouldShowChangelog: () => true,
}))

vi.mock('../src/components/ChangelogOverlay', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="changelog">What's New</div> : null,
}))

const PwaUpdateLayer = (await import('../src/components/PwaUpdateLayer')).default

beforeEach(() => {
  mockUseAuth.mockReset()
})

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

function renderLayer() {
  return render(
    <PwaUpdateLayer>
      <div>page content</div>
    </PwaUpdateLayer>
  )
}

describe('ChangelogGate — signed-out visitors', () => {
  it('does not show the changelog to a signed-out visitor', () => {
    // A customer opening /invoice/:token from their SMS.
    mockUseAuth.mockReturnValue({ user: null, loading: false })

    renderLayer()

    expect(screen.queryByTestId('changelog')).toBeNull()
    expect(screen.getByText('page content')).toBeTruthy()
  })

  it('does not show it while auth is still resolving', () => {
    // Otherwise it flashes up before the session lands, which on a customer page is
    // just as bad as showing it permanently.
    mockUseAuth.mockReturnValue({ user: null, loading: true })

    renderLayer()

    expect(screen.queryByTestId('changelog')).toBeNull()
  })

  it('still shows it to a signed-in user — release notes are for our own users', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false })

    renderLayer()

    expect(screen.getByTestId('changelog')).toBeTruthy()
  })

  it('does not show it on /visualise even when staff are signed in', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false })
    window.history.pushState({}, '', '/visualise')

    renderLayer()

    expect(screen.queryByTestId('changelog')).toBeNull()
    expect(screen.getByText('page content')).toBeTruthy()
  })

  it('renders children regardless of session, so gating cannot blank the app', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderLayer()
    expect(screen.getByText('page content')).toBeTruthy()
  })
})
