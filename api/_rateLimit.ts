const requests = new Map<string, { count: number; reset: number }>()

/**
 * Simple in-memory token bucket rate limiter.
 * Resets on Vercel cold starts — best-effort protection.
 *
 * @param ip      - The requester's IP address
 * @param limit   - Max requests allowed in the window
 * @param windowMs - Window size in milliseconds
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(
  ip: string,
  limit = 20,
  windowMs = 60_000
): boolean {
  const now = Date.now()
  const entry = requests.get(ip)

  if (!entry || now > entry.reset) {
    requests.set(ip, { count: 1, reset: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count++
  return true
}