import { updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import { doc } from 'firebase/firestore'

const HEARTBEAT_MS = 60_000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let started = false

async function setPresence(uid: string, online: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      online,
      lastSeen: serverTimestamp(),
    })
  } catch {
    // user doc may not exist yet during setup; ignore
  }
}

/**
 * Starts presence heartbeats for the signed-in user. Writes a single field
 * write every 60s while the app is in the foreground, and marks the user
 * offline when the tab/app goes to background or is closed.
 */
export function startPresence(uid: string): void {
  if (started) return
  started = true

  void setPresence(uid, true)

  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      void setPresence(uid, true)
    }
  }, HEARTBEAT_MS)

  const markOffline = () => {
    void setPresence(uid, false)
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') markOffline()
    else void setPresence(uid, true)
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', markOffline)
  window.addEventListener('pagehide', markOffline)
}

export function stopPresence(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  started = false
}
