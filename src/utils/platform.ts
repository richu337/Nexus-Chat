import { Capacitor } from '@capacitor/core'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function isAndroidPlatform(): boolean {
  return Capacitor.getPlatform() === 'android'
}
