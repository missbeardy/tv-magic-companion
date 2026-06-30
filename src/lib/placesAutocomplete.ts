import { getAuthHeaders } from './apiAuth'
import {
  mapPlacesAutocompleteResponse,
  type PlaceSuggestion,
} from '../../shared/placesAutocomplete'

export type { PlaceSuggestion }
export { mapPlacesAutocompleteResponse }

/** Parse /api/geocode?action=autocomplete JSON (already mapped server-side). */
export function parseAutocompleteApiResponse(data: unknown): PlaceSuggestion[] {
  if (data && typeof data === 'object' && Array.isArray((data as { suggestions?: unknown }).suggestions)) {
    const list = (data as { suggestions: unknown[] }).suggestions
    if (
      list.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof (item as PlaceSuggestion).placeId === 'string' &&
          typeof (item as PlaceSuggestion).label === 'string'
      )
    ) {
      return list as PlaceSuggestion[]
    }
  }
  return mapPlacesAutocompleteResponse(data)
}

export async function fetchSuggestions(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  try {
    const headers = await getAuthHeaders()
    const response = await fetch('/api/geocode?action=autocomplete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: trimmed }),
    })

    if (!response.ok) return []

    const data = await response.json()
    return parseAutocompleteApiResponse(data)
  } catch {
    return []
  }
}
