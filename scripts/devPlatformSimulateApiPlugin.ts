import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { readJsonBody, sendJson } from './devApiUtils.js'

async function runPlatformSimulateInbound(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse
) {
  await import('../api/_lib/loadLocalEnv.js')
  const { handlePlatformSimulateInbound } = await import('../api/_lib/platformSimulateInbound.js')
  const { invokeApiHandler } = await import('../api/_lib/invokeApiHandler.js')
  const body = await readJsonBody(req)
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value
  }

  const result = await invokeApiHandler(handlePlatformSimulateInbound, {
    method: 'POST',
    url: '/api/create-user?action=simulate-inbound',
    headers,
    body,
    query: { action: 'simulate-inbound' },
  })

  sendJson(res, result.status, result.body ?? { error: 'Empty simulator response' })
}

function isPlatformSimulateRequest(url: string, method: string | undefined): boolean {
  if (method !== 'POST') return false
  const parsed = new URL(url, 'http://127.0.0.1')
  if (parsed.pathname === '/api/platform-simulate-inbound') return true
  return parsed.pathname === '/api/create-user' && parsed.searchParams.get('action') === 'simulate-inbound'
}

/** Local Vite dev handler for platform inbound simulator (without vercel dev). */
export function devPlatformSimulateApiPlugin(): Plugin {
  return {
    name: 'dev-platform-simulate-api',
    configureServer(server) {
      loadEnv(server.config.mode, process.cwd(), '')
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !isPlatformSimulateRequest(req.url, req.method)) return next()
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }

        try {
          await runPlatformSimulateInbound(req, res)
        } catch (err) {
          console.error('[dev-platform-simulate-api]', err)
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : 'Dev simulator handler failed',
          })
        }
      })
    },
  }
}
