import { updateDoc, serverTimestamp, doc } from 'firebase/firestore'
import { db } from '@/firebase/firestore'

const HEARTBEAT_MS = 60_000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let started = false
let currentUid: string | null = null

function setPresence(uid: string, online: boolean): void {
  updateDoc(doc(db, 'users', uid), {
    online,
    lastSeen: serverTimestamp(),
  }).catch(() => {})
}

/**
 * Starts presence heartbeats for the signed-in user. Writes a single field
 * write every 60s while the app is in the foreground, and marks the user
 * offline when the tab/app goes to background or is closed.
 */
export function startPresence(uid: string): void {
  if (started) return
  started = true
  currentUid = uid

  setPresence(uid, true)

  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      setPresence(uid, true)
    }
  }, HEARTBEAT_MS)

  const markOffline = () => {
    setPresence(uid, false)
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') markOffline()
    else setPresence(uid, true)
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
  if (currentUid) {
    setPresence(currentUid, false)
    currentUid = null
  }
  started = false
}
