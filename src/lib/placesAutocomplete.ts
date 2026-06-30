import { getAuthHeaders } from './apiAuth'
import {
  mapPlacesAutocompleteResponse,
  type PlaceSuggestion,
} from '../../shared/placesAutocomplete'

export type { PlaceSuggestion }
export { mapPlacesAutocompleteResponse }

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
    return mapPlacesAutocompleteResponse(data)
  } catch {
    return []
  }
}
