import { timingSafeEqual } from 'crypto'

/**
 * Constant-time comparison of a caller-supplied secret against the expected
 * value. Returns false when either side is missing or lengths differ, without
 * leaking timing information about how much of the secret matched.
 */
export function safeCompareSecret(
  provided: string | undefined,
  expected: string | undefined
): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
