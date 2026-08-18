import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The backend sweep at /api/cron/contact-follow-up is the sole owner of automatic follow-up
 * transitions. LeadsPage used to run them on every page load, which meant three unconditioned
 * writers (two browsers + the cron) racing the same rows with no expected-state preconditions —
 * the browser's applyUpdate treated a zero-row update as success and logged the lead_events row
 * anyway, so a lead could collect duplicate "Unable to contact" entries in its history.
 *
 * A static text assertion rather than a render test: mounting LeadsPage pulls dnd-kit,
 * react-router, the realtime supabase client and ~20 child components to establish one fact.
 */
describe('LeadsPage automatic lifecycle boundary', () => {
  const source = readFileSync('src/pages/LeadsPage.tsx', 'utf8')

  it('does not run the automatic follow-up sweep in the browser', () => {
    expect(source).not.toContain('processContactFollowUpRollovers')
  })

  it('keeps the manual employee contact paths', () => {
    // buildContactAttemptUpdate is the manual "I called / I texted" command and stays in the
    // browser; only the automatic sweep moved to the backend.
    expect(source).toContain('buildContactAttemptUpdate')
    expect(source).toContain('sortLeadsForKanbanColumn')
  })
})

describe('follow-up module boundary', () => {
  it('does not re-export the sweep to browser code', () => {
    const barrel = readFileSync('src/lib/contactFollowUp.ts', 'utf8')
    expect(barrel).not.toContain('processContactFollowUpRollovers')
  })
})
