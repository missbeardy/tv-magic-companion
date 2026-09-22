import * as Sentry from '@sentry/react'
import type { ReactNode } from 'react'

/**
 * Crash barrier for a section nested inside a route (Calendar, LeadDetailSheet,
 * the /visualise canvas) — catches errors before they bubble up to the route's
 * own RouteBoundary, so the rest of the page (including its NavBar) stays
 * usable when just this section fails.
 */
export default function SectionBoundary({
  tag,
  children,
  resetKey,
}: {
  tag: string
  children: ReactNode
  /** @sentry/react's ErrorBoundary has no resetKeys prop — pass a value that
   *  changes when the section should get a clean remount (e.g. the id of the
   *  record it's showing) instead. */
  resetKey?: unknown
}) {
  return (
    <Sentry.ErrorBoundary
      key={String(resetKey)}
      beforeCapture={(scope) => scope.setTag('boundary', `section:${tag}`)}
      fallback={({ resetError }) => (
        <div className="p-6 text-center text-sm text-gray-500">
          <p>This section couldn't load.</p>
          <button type="button" onClick={resetError} className="mt-2 text-brand font-semibold underline">
            Try again
          </button>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
