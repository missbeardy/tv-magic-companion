// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

/**
 * Orgs without a voice answering line (e.g. TV Magic on 3CX) must see no change in
 * Franchise Settings — the card only appears once ops has provisioned a line.
 */

let voiceLine: string | null = null

function query(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: result }),
  }
  return chain
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'org_phone_numbers'
        ? query(voiceLine ? { phone_number: voiceLine } : null)
        : query(null),
  },
}))

import MissedCallCapturePanel from '../src/components/settings/MissedCallCapturePanel'

afterEach(() => {
  cleanup()
  voiceLine = null
})

describe('MissedCallCapturePanel', () => {
  it('renders nothing for an org with no voice line', async () => {
    voiceLine = null
    const { container } = render(<MissedCallCapturePanel orgId="org-tv-magic" />)
    // Give the load effect time to resolve, then confirm it still rendered nothing.
    await new Promise((r) => setTimeout(r, 20))
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Missed-call capture')).toBeNull()
  })

  it('shows the card once the org has a voice line', async () => {
    voiceLine = '+61731234567'
    render(<MissedCallCapturePanel orgId="org-fbd" />)
    await waitFor(() => expect(screen.getByText('Missed-call capture')).toBeInTheDocument())
  })
})
