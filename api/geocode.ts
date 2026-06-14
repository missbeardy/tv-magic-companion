import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkRateLimit } from './_rateLimit.js'

interface GeocodeResult {
  status: string
  results: Array<{
    geometry: { location: { lat: number; lng: number } }
    formatted_address: string
  }>
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // SEC-08: Rate limit — 20 requests per minute per IP
  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const { address } = req.body as { address: string }

  if (!address?.trim()) {
    return res.status(400).json({ error: 'Address is required' })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Google Maps API key not configured' })
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&components=country:AU`
    const response = await fetch(url)
    const data = await response.json() as GeocodeResult

    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location
      const formattedAddress = data.results[0].formatted_address

      return res.status(200).json({
        success: true,
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress,
      })
    }

    return res.status(404).json({
      success: false,
      error: `Geocoding failed: ${data.status}`,
    })
  } catch (err) {
    console.error('Geocoding error:', err)
    return res.status(500).json({ error: 'Geocoding service error' })
  }
}