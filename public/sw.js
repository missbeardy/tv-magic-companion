// public/sw.js
// PWA Service Worker — handles precaching (via Workbox) + push notifications

import { precacheAndRoute } from 'workbox-precaching'

// Workbox injects the precache manifest here at build time
// DO NOT remove this line — it's what makes offline work
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Push Notifications ──────────────────────────────────────────────────────
//
// Injected at build time by vite-plugin-pwa from VITE_VAPID_PUBLIC_KEY.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Payloads sent by api/_lib/webPush.ts carry this marker. It matters because
// public/OneSignalSDKWorker.js does `importScripts('/sw.js')` — while OneSignal is
// still live, both its listener and ours share one global scope and BOTH fire on
// every OneSignal push. Without this gate we render a second, generic notification
// alongside the real one.
const PUSH_SOURCE = 'fb'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = self.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

self.addEventListener('push', (event) => {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }

  // Not ours — OneSignal's own listener will render it. Returning without showing
  // anything is safe here precisely because that other listener shows something.
  if (!data || data.src !== PUSH_SOURCE) return

  // Never let a malformed payload result in zero notifications shown: Chrome and
  // Firefox surface their own "site updated in the background" message instead, and
  // repeated offences can revoke push permission.
  const title = data.title || 'FieldBourne'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'You have an update.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'default',
      data: {
        url: data.url || '/leads',
        lead_id: data.lead_id,
      },
      actions: [
        { action: 'open', title: 'View' },
        { action: 'close', title: 'Dismiss' },
      ],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'close') return

  const targetUrl = event.notification.data?.url || '/leads'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of clientList) {
        if (!('focus' in client)) continue
        await client.focus()
        // Focusing alone lands the user on whatever page they left open, silently
        // dropping the notification's deep link. Navigate the focused tab.
        if ('navigate' in client && client.url !== targetUrl) {
          try {
            await client.navigate(targetUrl)
          } catch {
            /* cross-origin or navigation blocked — the tab is at least focused */
          }
        }
        return
      }

      await self.clients.openWindow(targetUrl)
    })()
  )
})

// Browsers rotate push subscriptions. Without this handler we lose users silently
// over months. The SW has no Supabase session, so this reports to a shared endpoint
// authorised by possession of the old (unguessable) endpoint URL.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      if (!VAPID_PUBLIC_KEY) return
      try {
        const newSub = await self.registration.pushManager.subscribe(
          event.oldSubscription?.options ?? {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }
        )
        await fetch('/api/send-sms?action=push-rotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldEndpoint: event.oldSubscription?.endpoint ?? null,
            subscription: newSub.toJSON(),
          }),
        })
      } catch {
        // Next app open runs reconcileSubscription() under a real session, which
        // repairs whatever this missed.
      }
    })()
  )
})
