// public/sw.js - Push Notification Service Worker
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'TVMagic', {
      body: data.body || 'New notification',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: data.tag || 'default',
      data: {
        url: data.url || '/leads',
        lead_id: data.lead_id
      },
      actions: [
        { action: 'open', title: 'View' },
        { action: 'close', title: 'Dismiss' }
      ]
    })
  );
});

// When user clicks the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { url } = event.notification.data;
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(url)
    );
  }
});