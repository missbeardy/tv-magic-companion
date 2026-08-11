import { describe, expect, it } from 'vitest'
import {
  buildExclusionHaystack,
  filterExcludedCandidates,
  isExcludedFor,
  matchedExclusions,
  normaliseKeyword,
  normaliseKeywordList,
  normaliseText,
} from '../shared/serviceExclusions'

describe('normaliseText', () => {
  it('lowercases and collapses punctuation to single spaces', () => {
    expect(normaliseText('  Starlink,   install!! ')).toBe('starlink install')
  })

  it('returns empty string for null/undefined/blank', () => {
    expect(normaliseText(null)).toBe('')
    expect(normaliseText(undefined)).toBe('')
    expect(normaliseText('   ')).toBe('')
  })
})

describe('normaliseKeywordList', () => {
  it('normalises, drops empties and dedupes', () => {
    expect(normaliseKeywordList(['Starlink', ' starlink ', '  ', 'MATV'])).toEqual([
      'starlink',
      'matv',
    ])
  })

  it('returns empty for non-array input', () => {
    expect(normaliseKeywordList('starlink')).toEqual([])
    expect(normaliseKeywordList(null)).toEqual([])
  })

  it('ignores non-string entries', () => {
    expect(normaliseKeywordList(['starlink', 42, null, { a: 1 }])).toEqual(['starlink'])
  })

  it('caps keyword count and length', () => {
    const many = Array.from({ length: 30 }, (_, i) => `keyword${i}`)
    expect(normaliseKeywordList(many)).toHaveLength(20)
    expect(normaliseKeywordList(['a'.repeat(80)], { maxLength: 10 })).toEqual(['a'.repeat(10)])
  })
})

describe('matchedExclusions', () => {
  it('matches a keyword in the lead text regardless of case', () => {
    expect(matchedExclusions(['starlink'], 'Starlink installation plus wifi extender')).toEqual([
      'starlink',
    ])
  })

  it('matches through trailing punctuation', () => {
    expect(matchedExclusions(['starlink'], 'Can you do Starlink, please?')).toEqual(['starlink'])
    expect(matchedExclusions(['starlink'], 'Need a Starlink.')).toEqual(['starlink'])
  })

  it('matches a plural / suffixed form', () => {
    expect(matchedExclusions(['starlink'], 'we have two starlinks here')).toEqual(['starlink'])
  })

  it('does not match mid-word (a keyword must start at a word boundary)', () => {
    expect(matchedExclusions(['tv'], 'cctv camera not working')).toEqual([])
  })

  it('matches a keyword at the very start of the text', () => {
    expect(matchedExclusions(['starlink'], 'Starlink please')).toEqual(['starlink'])
  })

  it('matches multi-word keywords', () => {
    expect(matchedExclusions(['home automation'], 'wants home automation installed')).toEqual([
      'home automation',
    ])
  })

  it('returns every keyword that fires', () => {
    expect(matchedExclusions(['starlink', 'matv'], 'starlink and matv work')).toEqual([
      'starlink',
      'matv',
    ])
  })

  it('returns nothing for an empty or missing keyword list', () => {
    expect(matchedExclusions([], 'starlink')).toEqual([])
    expect(matchedExclusions(null, 'starlink')).toEqual([])
    expect(matchedExclusions(undefined, 'starlink')).toEqual([])
  })

  it('ignores whitespace-only keywords', () => {
    expect(matchedExclusions(['   '], 'anything at all')).toEqual([])
  })

  it('returns nothing when the haystack is empty', () => {
    expect(matchedExclusions(['starlink'], '')).toEqual([])
    expect(matchedExclusions(['starlink'], '   ')).toEqual([])
  })
})

describe('buildExclusionHaystack', () => {
  it('joins and normalises the parts it is given', () => {
    const haystack = buildExclusionHaystack([
      'Other',
      'Subject: Starlink\n\nMessage: Fix cable',
      null,
      undefined,
    ])
    expect(haystack).toBe('other subject starlink message fix cable')
    expect(isExcludedFor(['starlink'], haystack)).toBe(true)
  })

  it('skips non-string parts', () => {
    expect(buildExclusionHaystack([42, { a: 1 }, 'aerial'])).toBe('aerial')
  })
})

describe('filterExcludedCandidates', () => {
  const candidates = [
    { id: 'darren', excluded_service_keywords: ['starlink'] },
    { id: 'sam', excluded_service_keywords: [] },
    { id: 'jo', excluded_service_keywords: null },
  ]

  it('drops only the excluded candidate', () => {
    const pool = filterExcludedCandidates(candidates, 'starlink installation')
    expect(pool.map((c) => c.id)).toEqual(['sam', 'jo'])
  })

  it('keeps everyone when nothing matches', () => {
    const pool = filterExcludedCandidates(candidates, 'tv aerial not working')
    expect(pool.map((c) => c.id)).toEqual(['darren', 'sam', 'jo'])
  })

  it('can empty the pool entirely', () => {
    const allExcluded = [
      { id: 'darren', excluded_service_keywords: ['starlink'] },
      { id: 'sam', excluded_service_keywords: ['starlink'] },
    ]
    expect(filterExcludedCandidates(allExcluded, 'starlink please')).toEqual([])
  })
})
