import type { Plugin, ViteDevServer } from 'vite'
import { loadEnv } from 'vite'
import { geocodeWithGoogle, geocodeWithNominatim } from '../api/_lib/staticMap.js'
import { readJsonBody, sendJson } from './devApiUtils.js'

async function handleDevGeocode(body: { address?: string }, apiKey: string | null) {
  if (!body.address?.trim()) {
    return { status: 400, payload: { error: 'Address is required' } }
  }

  let geocoded = apiKey ? await geocodeWithGoogle(body.address, apiKey) : null
  if (!geocoded) {
    const fallback = await geocodeWithNominatim(body.address)
    if (fallback) {
      geocoded = { ...fallback, formattedAddress: body.address.trim() }
    }
  }

  if (!geocoded) {
    return { status: 404, payload: { success: false, error: 'Geocoding failed for this address' } }
  }

  return {
    status: 200,
    payload: {
      success: true,
      lat: geocoded.lat,
      lng: geocoded.lng,
      formattedAddress: geocoded.formattedAddress,
    },
  }
}

function attachMiddleware(server: ViteDevServer, apiKey: string | null) {
  server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/api/geocode')) return next()
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const action = new URL(req.url, 'http://127.0.0.1').searchParams.get('action')

    try {
      const body = (await readJsonBody(req)) as { address?: string }

      if (action === 'autocomplete') {
        sendJson(res, 501, {
          error: 'Places autocomplete requires vercel dev or a deployed preview.',
        })
        return
      }

      const result = await handleDevGeocode(body, apiKey)
      sendJson(res, result.status, result.payload)
    } catch (err) {
      console.error('[dev-geocode-api]', err)
      sendJson(res, 500, { error: 'Dev geocode handler failed' })
    }
  })
}

/** Local Vite dev handler for /api/geocode (geocode without vercel dev). */
export function devGeocodeApiPlugin(): Plugin {
  return {
    name: 'dev-geocode-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      const apiKey = env.GOOGLE_MAPS_API_KEY || null
      attachMiddleware(server, apiKey)
    },
  }
}
