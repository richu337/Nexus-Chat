import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { Dialog } from '@capacitor/dialog'

const MANIFEST_URL = import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined

let initialized = false

function parseVersion(v: string): number[] {
  return v.split('.').map((n) => parseInt(n, 10) || 0)
}

function isNewer(a: string, b: string): boolean {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const xv = x[i] ?? 0
    const yv = y[i] ?? 0
    if (xv !== yv) return xv > yv
  }
  return false
}

/**
 * Self-hosted over-the-air updates (no Capgo Cloud).
 *
 * On every native launch:
 *  1. `notifyAppReady()` confirms the bundle loaded fine (prevents rollback).
 *  2. We fetch the update manifest from our own server
 *     (VITE_UPDATE_MANIFEST_URL → latest.json).
 *  3. If the published version is newer than the running bundle, we ask the
 *     user (Update / Later) and only then download + apply the new bundle.
 *
 * The bundle URL is resolved against the manifest URL, so it works whatever
 * domain the server ends up on. No-op on web.
 */
export function initOTA(): void {
  if (!Capacitor.isNativePlatform()) return
  if (initialized) return
  initialized = true

  void CapacitorUpdater.notifyAppReady().catch(() => {})
  void checkForUpdate()
}

async function checkForUpdate(): Promise<void> {
  if (!MANIFEST_URL) return
  try {
    const [manifest, current] = await Promise.all([
      fetch(MANIFEST_URL).then((r) => {
        if (!r.ok) throw new Error('manifest request failed')
        return r.json() as Promise<{ version: string; file: string }>
      }),
      CapacitorUpdater.current(),
    ])

    if (!manifest.version || !manifest.file) return
    if (!isNewer(manifest.version, current.bundle.version)) return

    const { value } = await Dialog.confirm({
      title: 'Update available',
      message: `A new version (${manifest.version}) is ready to install. Update now?`,
      okButtonTitle: 'Update',
      cancelButtonTitle: 'Later',
    })
    if (!value) return

    const url = new URL(manifest.file, MANIFEST_URL).toString()
    const bundle = await CapacitorUpdater.download({ url, version: manifest.version })
    await CapacitorUpdater.set(bundle)
  } catch {
    // ignore — the app still works; we retry on next launch
  }
}
