import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { Dialog } from '@capacitor/dialog'

let initialized = false

/**
 * Sets up Capgo over-the-air updates for the native app.
 *
 * - `notifyAppReady()` tells the native layer the bundled JS loaded fine so it
 *   never rolls back a healthy bundle.
 * - `autoUpdate: 'onlyDownload'` (see capacitor.config.ts) makes the plugin
 *   download updates in the background but NOT apply them automatically. The
 *   `updateAvailable` event fires once a new version is downloaded, and we ask
 *   the user (Update / Later) before switching to it.
 *
 * No-op on web — OTA only applies inside the Android/iOS WebView.
 */
export function initOTA(): void {
  if (!Capacitor.isNativePlatform()) return
  if (initialized) return
  initialized = true

  void CapacitorUpdater.notifyAppReady().catch(() => {})

  void CapacitorUpdater.addListener('updateAvailable', async (info) => {
    try {
      const { value } = await Dialog.confirm({
        title: 'Update available',
        message: `A new version (${info.bundle.version}) is ready to install. Update now?`,
        okButtonTitle: 'Update',
        cancelButtonTitle: 'Later',
      })
      if (value) {
        await CapacitorUpdater.set(info.bundle)
      }
    } catch {
      // ignore — user can update next time the check runs
    }
  })
}
