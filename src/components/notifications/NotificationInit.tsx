import { useEffect } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { App } from '@capacitor/app'
import { useAuth } from '@/hooks/useAuth'
import { getWebPushToken, onForegroundMessage } from '@/firebase/messaging'
import { registerDeviceToken } from '@/services/notifications'
import { isNativePlatform } from '@/utils/platform'
import { useNavigate } from 'react-router-dom'

/**
 * Sets up push notification plumbing once per signed-in user:
 *  - Android (Capacitor): requests permission, registers the FCM token, and
 *    listens for taps to deep-link into the right conversation.
 *  - Web: requests web-push permission, registers the FCM token, and handles
 *    foreground messages.
 *
 * Everything here is best-effort: if the relay isn't configured or permission
 * is denied, the app keeps working via Firestore listeners.
 */
export function NotificationInit() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return

    if (isNativePlatform()) {
      let cancelled = false

      const registerAndroid = async () => {
        try {
          const perm = await PushNotifications.requestPermissions()
          if (perm.receive !== 'granted') {
            // Handled gracefully: no push, real-time still works.
            return
          }
          await PushNotifications.register()
        } catch {
          // permission denied or unavailable
        }

        const addListeners = PushNotifications.addListener(
          'registration',
          async ({ value }) => {
            if (cancelled || !value) return
            await registerDeviceToken(value, 'android')
          },
        )

        const regError = PushNotifications.addListener('registrationError', () => {
          // ignore registration errors silently
        })

        const tapped = PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (res) => {
            const data = res.notification.data as Record<string, string> | undefined
            const conversationId = data?.conversationId
            if (conversationId) navigate(`/chat/${conversationId}`)
          },
        )

        return () => {
          cancelled = true
          void addListeners.then((l) => l.remove())
          void regError.then((l) => l.remove())
          void tapped.then((l) => l.remove())
        }
      }

      const cleanupAndroid = registerAndroid()

      // Deep-link handling for cold starts (app launched from a notification).
      const appListener = App.addListener('appUrlOpen', (data) => {
        const url = data.url
        const m = url?.match(/\/chat\/([^/]+)/)
        if (m?.[1]) navigate(`/chat/${m[1]}`)
      })

      return () => {
        void cleanupAndroid
        void appListener.then((l) => l.remove())
      }
    }

    // ── Web ────────────────────────────────────────────────────────────────
    let cancelled = false
    let unsubForeground: (() => void) | null = null

    const initWeb = async () => {
      try {
        const token = await getWebPushToken()
        if (cancelled) return
        if (token) await registerDeviceToken(token, 'web')
      } catch {
        // permission denied / no VAPID configured
      }

      if (cancelled) return
      unsubForeground = onForegroundMessage((payload) => {
        const data = (payload.data ?? {}) as Record<string, string>
        const conversationId = data.conversationId
        if (conversationId && !cancelled) {
          navigate(`/chat/${conversationId}`)
        }
      })
    }

    void initWeb()

    return () => {
      cancelled = true
      unsubForeground?.()
    }
  }, [user, navigate])

  return null
}
