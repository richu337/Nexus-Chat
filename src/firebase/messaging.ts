import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'
import { app } from './config'

export function getWebMessaging(): Messaging | null {
  try {
    return getMessaging(app)
  } catch {
    return null
  }
}

const SW_PATH = '/firebase-messaging-sw.js'

// Bump SW_VERSION whenever the SW needs to be re-fetched (e.g. config
// handling changed). The browser treats a different query string as a new
// script, which replaces any stale earlier registration.
const SW_VERSION = 'v2'

function buildSwUrl(): string | null {
  const params = new URLSearchParams({
    v: SW_VERSION,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  })
  return `${SW_PATH}?${params.toString()}`
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const url = buildSwUrl()
    if (!url) return null
    // Drop stale registrations of our SW that don't carry the config version
    // (e.g. one registered before config was wired up) so they get replaced.
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      registrations
        .filter((r) => r.scope === `${window.location.origin}/`)
        .filter((r) => r.active?.scriptURL.includes(SW_PATH))
        .filter((r) => !r.active?.scriptURL.includes(`v=${SW_VERSION}`))
        .map((r) => r.unregister()),
    )
    return await navigator.serviceWorker.register(url)
  } catch {
    return null
  }
}

export async function getWebPushToken(): Promise<string | null> {
  const messaging = getWebMessaging()
  if (!messaging) return null
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  const sw = await ensureServiceWorker()
  if (!vapidKey || !sw) return null
  try {
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: sw })
  } catch {
    return null
  }
}

export function onForegroundMessage(cb: (payload: Record<string, unknown>) => void): () => void {
  const messaging = getWebMessaging()
  if (!messaging) return () => {}
  return onMessage(messaging, (payload) => cb(payload as unknown as Record<string, unknown>))
}
