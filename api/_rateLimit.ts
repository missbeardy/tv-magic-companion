const requests = new Map<string, { count: number; reset: number }>()

export function checkRateLimit(
  ip: string,
  limit = 20,
  windowMs = 60_000
): boolean {
  const now = Date.now()
  
  // Handle undefined/null/invalid IP gracefully
  let key: string
  if (typeof ip === 'string' && ip.length > 0) {
    key = ip.split(',')[0].trim().slice(0, 45)
  } else {
    key = 'unknown'
  }

  const entry = requests.get(key)

  if (!entry || now > entry.reset) {
    requests.set(key, { count: 1, reset: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count++
  return true
}
