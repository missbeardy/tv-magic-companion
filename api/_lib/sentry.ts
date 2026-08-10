import * as Sentry from '@sentry/node'

let initialized = false

/** No-ops cleanly when SENTRY_DSN is unset (local dev without keys). */
function ensureInit(): void {
  if (initialized) return
  initialized = true
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}

/** Attach only ids/enums/route info as context — never a raw request body or lead/customer object. */
export function captureServerException(err: unknown, context?: Record<string, string>): void {
  ensureInit()
  if (!process.env.SENTRY_DSN) return
  Sentry.withScope((scope) => {
    if (context) scope.setContext('request', context)
    Sentry.captureException(err)
  })
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  await Sentry.flush(timeoutMs)
}
