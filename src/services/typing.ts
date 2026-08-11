import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'

// Typing state lives in a lightweight `conversations/{id}/_typing` document.
// Writers throttle their writes and self-clean; readers consider typing
// "active" only if the heartbeat is fresh (< 5s), so a crashed client can't
// leave a permanent "typing…" state.

function typingDocRef(conversationId: string) {
  return doc(db, 'conversations', conversationId, '_typing', 'state')
}

const ACTIVE_WINDOW_MS = 5000
const WRITE_THROTTLE_MS = 3000

const lastWrite: Record<string, number> = {}

/**
 * Records that `uid` is typing. Throttled to one write every 3 seconds per
 * conversation; the companion stopTyping clears it.
 */
export async function startTyping(conversationId: string, uid: string): Promise<void> {
  const now = Date.now()
  const key = `${conversationId}:${uid}`
  if (now - (lastWrite[key] ?? 0) < WRITE_THROTTLE_MS) return
  lastWrite[key] = now

  try {
    await setDoc(
      typingDocRef(conversationId),
      { [uid]: serverTimestamp() },
      { merge: true },
    )
  } catch {
    // best-effort
  }
}

/**
 * Removes only this user's field from the typing document, leaving the other
 * party's state untouched.
 */
export async function stopTyping(conversationId: string, uid: string): Promise<void> {
  try {
    await updateDoc(typingDocRef(conversationId), { [uid]: deleteField() })
  } catch {
    // The document may not exist yet; that's fine.
  }
}

function isActive(ts: unknown): boolean {
  if (!ts) return false
  if (ts instanceof Timestamp) {
    return Date.now() - ts.toMillis() < ACTIVE_WINDOW_MS
  }
  if (ts && typeof (ts as { seconds?: number }).seconds === 'number') {
    return Date.now() - (ts as { seconds: number }).seconds * 1000 < ACTIVE_WINDOW_MS
  }
  return false
}

/**
 * Subscribes to whether `uid` is currently typing in a conversation.
 * Treats stale heartbeats as not-typing so a crashed client can't leave a
 * permanent "typing…" indicator.
 */
export function subscribeToTyping(
  conversationId: string,
  uid: string,
  onChange: (active: boolean) => void,
): () => void {
  let lastEmitted: boolean | null = null

  const refresh = (data: Record<string, unknown> | null) => {
    const active = data ? isActive(data[uid]) : false
    if (active !== lastEmitted) {
      lastEmitted = active
      onChange(active)
    }
  }

  const unsub = onSnapshot(
    typingDocRef(conversationId),
    (snap) => {
      if (!snap.exists()) {
        refresh(null)
        return
      }
      refresh(snap.data() as Record<string, unknown>)
    },
    () => refresh(null),
  )

  return unsub
}
