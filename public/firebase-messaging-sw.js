/* eslint-disable no-undef */
// Firebase Messaging Service Worker for web push notifications.
// Keep this file at the app root (public/) so its scope covers the whole app.
// The Firebase config is passed in as query parameters by the client so we
// never hardcode keys here.

importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js')

const params = new URL(self.location.href).searchParams
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
}

firebase.initializeApp(firebaseConfig)

// If the config was never passed (e.g. a stale registration without query
// params), skip push handling entirely instead of throwing.
if (firebaseConfig.projectId) {
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const { notification, data } = payload
    const title = notification?.title || 'Nexus Chat'
    const body = notification?.body || ''
    const conversationId = data?.conversationId || '/'

    const options = {
      body,
      icon: data?.icon || '/icon-192.png',
      badge: data?.badge || '/icon-192.png',
      tag: `nexus-${conversationId}`,
      data: { conversationId },
    }

    return self.registration.showNotification(title, options)
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const conversationId = event.notification.data?.conversationId
    const url = conversationId ? `/chat/${conversationId}` : '/'

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus()
        }
        if (clients.openWindow) return clients.openWindow(url)
        return null
      }),
    )
  })
}
