import type { VercelRequest, VercelResponse } from '@vercel/node'
import { captureServerException, flushSentry } from './sentry.js'
import { flushAnalytics } from './analytics.js'

type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | VercelResponse | Promise<void | VercelResponse>

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
