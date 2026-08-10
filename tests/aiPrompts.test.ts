import { describe, expect, it } from 'vitest'
import { buildCaptionPrompt, buildLeadExtractionPrompt, extractJsonObject } from '../api/_lib/aiPrompts'

describe('buildLeadExtractionPrompt', () => {
  it('embeds the raw text and asks for the expected JSON shape', () => {
    const prompt = buildLeadExtractionPrompt({ rawText: 'Hi, I need a new aerial installed.' })
    expect(prompt).toContain('Hi, I need a new aerial installed.')
    expect(prompt).toContain('"service_type"')
  })

  it('truncates excessively long input rather than sending it all to Claude', () => {
    const long = 'a'.repeat(20_000)
    const prompt = buildLeadExtractionPrompt({ rawText: long })
    expect(prompt.length).toBeLessThan(20_000)
  })
})

describe('buildCaptionPrompt', () => {
  it('embeds job context and notes', () => {
    const prompt = buildCaptionPrompt({ jobContext: 'TV wall mount', notes: 'Customer very happy' })
    expect(prompt).toContain('TV wall mount')
    expect(prompt).toContain('Customer very happy')
  })
})

describe('extractJsonObject', () => {
  it('strips markdown code fences', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('extracts the outermost object from surrounding prose', () => {
    expect(extractJsonObject('Sure, here you go: {"a":1} thanks!')).toBe('{"a":1}')
  })
})
