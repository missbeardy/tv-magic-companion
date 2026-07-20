import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWithTimeout,
  isNetworkError,
  NetworkError,
} from '../src/lib/fetchWithTimeout'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isNetworkError', () => {
  it('is true for NetworkError, TypeError, and timeout/abort DOMExceptions', () => {
    expect(isNetworkError(new NetworkError())).toBe(true)
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new DOMException('t', 'TimeoutError'))).toBe(true)
    expect(isNetworkError(new DOMException('a', 'AbortError'))).toBe(true)
  })

  it('is false for a plain application error', () => {
    expect(isNetworkError(new Error('Invalid amount'))).toBe(false)
    expect(isNetworkError('nope')).toBe(false)
  })
})

describe('fetchWithTimeout', () => {
  it('returns the response on success', async () => {
    const response = new Response('{}', { status: 200 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(fetchWithTimeout('/api/x')).resolves.toBe(response)
  })

  it('passes non-2xx responses through untouched (server rejection, not network)', async () => {
    const response = new Response('{"error":"bad"}', { status: 400 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const res = await fetchWithTimeout('/api/x')
    expect(res.status).toBe(400)
  })

  it('normalises a timeout into a friendly NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))
    await expect(fetchWithTimeout('/api/x', {}, 10)).rejects.toBeInstanceOf(NetworkError)
  })

  it('normalises a dropped connection (TypeError) into a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchWithTimeout('/api/x')).rejects.toBeInstanceOf(NetworkError)
  })

  it('never leaks a raw "Failed to fetch" message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchWithTimeout('/api/x')).rejects.toThrow(/connection/i)
  })
})
