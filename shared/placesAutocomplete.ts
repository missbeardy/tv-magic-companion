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
