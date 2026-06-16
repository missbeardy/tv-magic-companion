// public/sw.js
// PWA Service Worker — handles precaching (via Workbox) + push notifications

import { precacheAndRoute } from 'workbox-precaching'

// Workbox injects the precache manifest here at build time
// DO NOT remove this line — it's what makes offline work
precacheAndRoute(self.__WB_MANIFEST)

// ── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title || 'TVMagic', {
      body: data.body || 'New notification',
      icon: '/tvmagic-logo.png',
      badge: '/tvmagic-logo.png',
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

  const { url } = event.notification.data

  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(url))
  }
})