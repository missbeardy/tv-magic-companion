export interface MapCoordinates {
  lat: number
  lng: number
}

interface GeocodeResult {
  status: string
  results: Array<{
    geometry: { location: { lat: number; lng: number } }
    formatted_address: string
  }>
}

export function normalizeAddressInput(address: string): string {
  return address.trim().replace(/\s+/g, ' ')
}

export async function geocodeWithGoogle(
  address: string,
  apiKey: string
): Promise<(MapCoordinates & { formattedAddress: string }) | null> {
  const normalized = normalizeAddressInput(address)
  const queries = [normalized, `${normalized}, Australia`]

  for (const query of queries) {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}` +
      `&key=${apiKey}&components=country:AU`
    const response = await fetch(url)
    const data = (await response.json()) as GeocodeResult

    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location
      return {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: data.results[0].formatted_address,
      }
    }
  }

  return null
}

/** Free AU geocoder fallback when Google is unavailable or fails. */
export async function geocodeWithNominatim(address: string): Promise<MapCoordinates | null> {
  const normalized = normalizeAddressInput(address)
  const queries = [normalized, `${normalized}, Australia`]

  for (const query of queries) {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=au`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TVMagicCompanion/1.0 (field-service-app)' },
    })
    if (!response.ok) continue

    const data = (await response.json()) as Array<{ lat: string; lon: string }>
    if (data[0]) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      }
    }
  }

  return null
}
