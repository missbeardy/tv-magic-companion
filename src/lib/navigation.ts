// src/lib/navigation.ts

// Opens turn-by-turn navigation to an address, respecting the user's
// preferred app where the platform allows it.
export function openNavigation(address: string) {
  if (!address) return
  const encoded = encodeURIComponent(address)
  const ua = navigator.userAgent || ''
  const isAndroid = /android/i.test(ua)
  const isIOS = /iphone|ipad|ipod/i.test(ua)

  if (isAndroid) {
    // geo: triggers Android's native "Open with" chooser across every
    // installed nav app. If the user already set a default, it opens
    // that app directly — this is what gives the "preferred app" behaviour.
    window.location.href = `geo:0,0?q=${encoded}`
    return
  }

  if (isIOS) {
    // iOS has no system-level chooser for arbitrary apps, so we try Waze
    // first and fall back to Google Maps if Waze isn't installed.
    const wazeUrl = `waze://?q=${encoded}&navigate=yes`
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`
    const fallbackTimer = setTimeout(() => {
      window.location.href = fallbackUrl
    }, 800)
    window.addEventListener('pagehide', () => clearTimeout(fallbackTimer), { once: true })
    window.location.href = wazeUrl
    return
  }

  window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank')
}