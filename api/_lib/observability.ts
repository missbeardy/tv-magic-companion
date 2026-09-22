import type { VercelRequest, VercelResponse } from '@vercel/node'
import { captureServerException, flushSentry } from './sentry.js'
import { flushAnalytics } from './analytics.js'
import { missingServerEnv } from './env.js'

type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | VercelResponse | Promise<void | VercelResponse>

let reportedMissingEnvThisColdStart = false

/** Once per cold start (this module is bundled per-function, so this is once per function), not per request — a missing var doesn't fix itself between invocations. */
function reportMissingEnvOnce(): void {
  if (reportedMissingEnvThisColdStart) return
  reportedMissingEnvThisColdStart = true
  const missing = missingServerEnv()
  if (missing.length === 0) return
  console.error('[MISSING_SERVER_ENV]', missing.join(', '))
  captureServerException(new Error(`Missing server env: ${missing.join(', ')}`), {
    missing: missing.join(','),
  })
}

/**
 * Outer safety net applied to every one of the 12 api/*.ts default exports
 * (export default withObservability(handler)) — never a 13th api/ file, see PROJECT.md's
 * Vercel Hobby 12-function cap. Catches anything unhandled that escapes a handler's own
 * try/catch and reports it to Sentry, and flushes any analytics events captured during the
 * request before the function's promise resolves (Vercel keeps the container alive until then,
 * even though res.json() already sent the response to the client).
 *
 * Return type matches ApiHandler exactly (not a looser `unknown`) — the Platform Admin inbound
 * simulator (api/_lib/invokeApiHandler.ts) imports these same default exports and calls them
 * directly against that stricter signature.
 */
export function withObservability(handler: ApiHandler): ApiHandler {
  return async (req: VercelRequest, res: VercelResponse) => {
    reportMissingEnvOnce()
    try {
      const result = await handler(req, res)
      await flushAnalytics()
      return result
    } catch (err) {
      captureServerException(err, {
        route: typeof req.url === 'string' ? req.url.split('?')[0] : 'unknown',
        method: req.method || 'unknown',
      })
      await flushSentry()
      await flushAnalytics()
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error' })
      }
      return undefined
    }
  }
}
