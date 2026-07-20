export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

/**
 * A connection problem the user can act on (retry / wait for signal). Carries a
 * human-readable message so call sites never surface a raw "Failed to fetch".
 */
export class NetworkError extends Error {
  constructor(message = "Couldn't reach the server — check your connection and try again.") {
    super(message)
    this.name = 'NetworkError'
  }
}

/** True for a lost connection or a timed-out request (as opposed to a server rejection). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) return true
  if (err instanceof TypeError) return true // fetch throws TypeError("Failed to fetch") when offline
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true
  return err instanceof Error && /fetch|network|timed? ?out|abort/i.test(err.message)
}

/**
 * fetch with a hard timeout. On timeout or connection loss it throws a
 * {@link NetworkError} with a friendly message instead of hanging forever or
 * surfacing a raw browser error. A caller-supplied `signal` is respected as-is.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs)
  try {
    return await fetch(input, { ...init, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new NetworkError()
    if (err instanceof TypeError) throw new NetworkError()
    throw err
  }
}
