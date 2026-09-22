import { describe, expect, it, vi, afterEach } from 'vitest'
import { log } from '../api/_lib/log'

describe('log (AUD-21)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('info emits one JSON line on console.info with level+message', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    log.info('hello')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({ level: 'info', message: 'hello' })
  })

  it('merges meta into the same JSON object, not a second stringify layer', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    log.info('lead saved', { leadId: 'abc', orgId: 'org-1' })
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed).toEqual({ level: 'info', message: 'lead saved', leadId: 'abc', orgId: 'org-1' })
  })

  it('warn goes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log.warn('careful', { reason: 'x' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: 'warn', message: 'careful' })
  })

  it('error goes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error('broken', { code: 500 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: 'error', message: 'broken' })
  })
})
