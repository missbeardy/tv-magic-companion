// src/lib/proximity.ts

import { supabase } from './supabase'

// Haversine straight-line distance between two coordinates in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface TechWithDistance {
  id: string
  full_name: string
  lat?: number | null
  lng?: number | null
  distanceKm: number | null
  distanceLabel: string
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
  if (!address?.trim()) return null

  try {
    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ address }),
    })

    if (!response.ok) return null

    const data = await response.json()
    if (data.success) {
      return {
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formattedAddress,
      }
    }
    return null
  } catch {
    return null
  }
}

export function rankTechsByDistance(
  leadLat: number,
  leadLng: number,
  techs: Array<{ id: string; full_name: string; lat?: number | null; lng?: number | null }>
): TechWithDistance[] {
  const withDistance: TechWithDistance[] = techs.map((tech) => {
    if (tech.lat == null || tech.lng == null) {
      return { ...tech, distanceKm: null, distanceLabel: 'Location unknown' }
    }
    const km = haversineKm(leadLat, leadLng, tech.lat, tech.lng)
    const label = km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`
    return { ...tech, distanceKm: km, distanceLabel: label }
  })

  return withDistance.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0
    if (a.distanceKm == null) return 1
    if (b.distanceKm == null) return -1
    return a.distanceKm - b.distanceKm
  })
}