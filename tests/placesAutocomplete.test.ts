import { describe, expect, it } from 'vitest'
import { mapPlacesAutocompleteResponse } from '../src/lib/placesAutocomplete'

describe('mapPlacesAutocompleteResponse', () => {
  it('returns empty array for invalid payloads', () => {
    expect(mapPlacesAutocompleteResponse(null)).toEqual([])
    expect(mapPlacesAutocompleteResponse({})).toEqual([])
    expect(mapPlacesAutocompleteResponse({ suggestions: 'nope' })).toEqual([])
  })

  it('maps placeId and label from placePrediction.text', () => {
    const result = mapPlacesAutocompleteResponse({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ123',
            text: { text: '123 Pitt Street, Sydney NSW, Australia' },
          },
        },
      ],
    })

    expect(result).toEqual([
      { placeId: 'ChIJ123', label: '123 Pitt Street, Sydney NSW, Australia' },
    ])
  })

  it('falls back to place resource name when placeId is missing', () => {
    const result = mapPlacesAutocompleteResponse({
      suggestions: [
        {
          placePrediction: {
            place: 'places/ChIJ456',
            text: { text: '456 George Street, Brisbane QLD, Australia' },
          },
        },
      ],
    })

    expect(result).toEqual([
      { placeId: 'ChIJ456', label: '456 George Street, Brisbane QLD, Australia' },
    ])
  })

  it('skips suggestions without label or place id', () => {
    const result = mapPlacesAutocompleteResponse({
      suggestions: [
        { placePrediction: { placeId: 'x', text: { text: '   ' } } },
        { placePrediction: { text: { text: 'No id street' } } },
        { queryPrediction: { text: { text: 'ignored' } } },
      ],
    })

    expect(result).toEqual([])
  })
})
