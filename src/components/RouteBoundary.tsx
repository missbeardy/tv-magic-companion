import * as Sentry from '@sentry/react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Route-level crash barrier. Before this, main.tsx's single app-wide
 * ErrorBoundary meant any render error anywhere took the whole app down to a
 * full-screen "Something went wrong" — including the nav, so the only way
 * out was a hard refresh. Wrapping each route means a crash in one page
 * leaves the rest of the app (and navigating to a different route) working.
 *
 * Keyed on the pathname so the caught error clears the moment the user
 * navigates away — returning to the same route after fixing whatever
 * triggered it (a bad query param, stale cache) gets a clean render instead
 * of being stuck on the fallback.
 */
export default function RouteBoundary({ tag, children }: { tag: string; children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <Sentry.ErrorBoundary
      // @sentry/react's ErrorBoundary has no resetKeys prop (unlike react-error-boundary) —
      // keying on pathname gets the same effect via a full remount on navigation.
      key={pathname}
      beforeCapture={(scope) => scope.setTag('boundary', `route:${tag}`)}
      fallback={({ resetError }) => (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full card p-6 space-y-3 text-center">
            <h1 className="font-display font-bold text-gray-900 text-lg">This page hit a problem</h1>
            <p className="text-sm text-gray-500">
              The rest of the app is still working. Try again, or head back to the dashboard.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={resetError}
                className="px-4 py-2 rounded-xl btn-primary text-sm font-semibold"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
              >
                Back to dashboard
              </a>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
