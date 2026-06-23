export function getPlatformUrl(): string {
  const url = process.env.VITE_PLATFORM_URL ?? process.env.PLATFORM_URL
  if (url && url.trim()) return url.replace(/\/$/, '')
  return 'https://tv-magic-companion.vercel.app'
}
