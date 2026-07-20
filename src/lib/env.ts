/** Platform feature flag — off in production until explicit cutover. */
export function isPlatformFeaturesEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_PLATFORM_FEATURES === 'true'
}

/** Base URL for in-app links, SMS, and push notifications. */
export function getPlatformUrl(): string {
  const url = import.meta.env.VITE_PLATFORM_URL
  if (url && String(url).trim().length > 0) {
    return String(url).replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'https://fieldbourne.app'
}
