// api/geocode.ts — geocode + Places autocomplete (action=autocomplete)
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from './_lib/auth.js'
import { geocodeWithGoogle, geocodeWithNominatim } from './_lib/staticMap.js'
import { mapPlacesAutocompleteResponse } from '../shared/placesAutocomplete.js'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

async function handleAutocomplete(
  req: VercelRequest,
  res: VercelResponse,
  ip: string
): Promise<VercelResponse> {
  if (!checkRateLimit(ip, 30)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const { query } = req.body as { query?: string }
  if (!query?.trim()) {
    return res.status(400).json({ error: 'Query is required' })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Google Maps API key not configured' })
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: query.trim(),
        includedRegionCodes: ['AU'],
      }),
    })

    const data = (await response.json()) as { error?: { message?: string } }

    if (!response.ok) {
      const message =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : 'Places autocomplete failed'
      console.error('Places autocomplete error:', message)
      return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({
        error: message,
      })
    }

    return res.status(200).json({
      suggestions: mapPlacesAutocompleteResponse(data),
    })
  } catch (err) {
    console.error('Places autocomplete error:', err)
    return res.status(500).json({ error: 'Places autocomplete service error' })
  }
}

async function handleGeocode(
  req: VercelRequest,
  res: VercelResponse,
  ip: string
): Promise<VercelResponse> {
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const { address } = req.body as { address: string }

  if (!address?.trim()) {
    return res.status(400).json({ error: 'Address is required' })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? null

  try {
    let geocoded = apiKey ? await geocodeWithGoogle(address, apiKey) : null
    if (!geocoded) {
      const fallback = await geocodeWithNominatim(address)
      if (fallback) {
        geocoded = { ...fallback, formattedAddress: address.trim() }
      }
    }

    if (!geocoded) {
      return res.status(404).json({
        success: false,
        error: 'Geocoding failed for this address',
      })
    }

    return res.status(200).json({
      success: true,
      lat: geocoded.lat,
      lng: geocoded.lng,
      formattedAddress: geocoded.formattedAddress,
    })
  } catch (err) {
    console.error('Geocoding error:', err)
    return res.status(500).json({ error: 'Geocoding service error' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? auth.userId
  const action = req.query.action as string | undefined

  if (action === 'autocomplete') {
    return handleAutocomplete(req, res, ip)
  }

  return handleGeocode(req, res, ip)
}
