import * as Sentry from '@sentry/react'

let initialized = false

/** No-ops cleanly when VITE_SENTRY_DSN is unset (local dev without keys). */
export function initSentry(): void {
  if (initialized) return
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Drop all automatic breadcrumbs (console/click/nav/fetch) rather than trying to filter
    // ~190 existing console.* call sites for PII after the fact. Errors still capture the full
    // stack trace, message, and whatever context we explicitly attach below.
    beforeBreadcrumb: () => null,
  })
  initialized = true
}

/** componentStack contains only React component names — never lead/customer data. */
export function captureClientException(error: unknown, context?: Record<string, string>): void {
  if (!initialized) return
  Sentry.withScope((scope) => {
    if (context) scope.setContext('app', context)
    Sentry.captureException(error)
  })
}
