// Classic (non-module) push handlers shared with OneSignalSDKWorker.js via importScripts.
// Do NOT add ES imports here — OneSignal's worker is a classic SW and cannot load
// the Workbox-bundled /sw.js reliably. VitePWA's /sw.js keeps its own copy of these
// listeners for when it is the controlling worker.

const PUSH_SOURCE = 'fb'

self.addEventListener('push', (event) => {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }

  // Not ours — OneSignal's listener handles its own payloads.
  if (!data || data.src !== PUSH_SOURCE) return

  const title = data.title || 'FieldBourne'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'You have an update.',
      icon: '/fieldbourne-logo.png',
      badge: '/fieldbourne-logo.png',
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
        if ('navigate' in client && client.url !== targetUrl) {
          try {
            await client.navigate(targetUrl)
          } catch {
            /* cross-origin or navigation blocked */
          }
        }
        return
      }

      await self.clients.openWindow(targetUrl)
    })()
  )
})
