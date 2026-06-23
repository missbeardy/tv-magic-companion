/** Server-side base URL for redirects, SMS links, Stripe return URLs. */
export function getPlatformUrl(): string {
  const explicit = process.env.VITE_PLATFORM_URL ?? process.env.PLATFORM_URL
  if (explicit?.trim()) return explicit.replace(/\/$/, '')

  // Vercel injects these per deployment — no manual VITE_PLATFORM_URL needed on preview/prod
  const vercelHost =
    process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL
  if (vercelHost?.trim()) {
    const host = vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `https://${host}`
  }

  return 'https://tv-magic-companion.vercel.app'
}
