import { getAuthHeaders } from './apiAuth'

export interface PlaceSuggestion {
  placeId: string
  label: string
}

interface GooglePlacePrediction {
  placeId?: string
  place?: string
  text?: { text?: string }
}

interface GoogleAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: GooglePlacePrediction
  }>
}

export function mapPlacesAutocompleteResponse(data: unknown): PlaceSuggestion[] {
  const body = data as GoogleAutocompleteResponse
  if (!Array.isArray(body?.suggestions)) return []

  return body.suggestions.flatMap((item) => {
    const prediction = item.placePrediction
    if (!prediction) return []

    const label = prediction.text?.text?.trim()
    if (!label) return []

    const placeId =
      prediction.placeId?.trim() ||
      prediction.place?.replace(/^places\//, '').trim() ||
      ''

    if (!placeId) return []

    return [{ placeId, label }]
  })
}

export async function fetchSuggestions(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  try {
    const headers = await getAuthHeaders()
    const response = await fetch('/api/places-autocomplete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: trimmed }),
    })

    if (!response.ok) return []

    const data = await response.json()
    return mapPlacesAutocompleteResponse(data)
  } catch {
    return []
  }
}
