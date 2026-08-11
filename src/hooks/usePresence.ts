import { useEffect, useSyncExternalStore } from 'react'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import type { PresenceData } from '@/types'

// ─── Shared presence cache ─────────────────────────────────────────────────
// Multiple components (Chats list, Chat header, Friends list) may watch the
// same users. We keep one Firestore listener per uid and share the value.

const DEFAULT_PRESENCE: PresenceData = { online: false, lastSeen: null }
const defaultPresence = (): PresenceData => DEFAULT_PRESENCE

interface Entry {
  data: PresenceData
  listeners: Set<() => void>
  unsub: Unsubscribe | null
}

const cache = new Map<string, Entry>()

function getEntry(uid: string): Entry {
  let entry = cache.get(uid)
  if (entry) return entry

  entry = { data: defaultPresence(), listeners: new Set(), unsub: null }
  cache.set(uid, entry)

  entry.unsub = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const e = cache.get(uid)
      if (!e) return
      if (snap.exists()) {
        const d = snap.data()
        e.data = { online: Boolean(d.online), lastSeen: d.lastSeen ?? null }
      } else {
        e.data = defaultPresence()
      }
      e.listeners.forEach((fn) => fn())
    },
    () => {
      const e = cache.get(uid)
      if (e) {
        e.data = defaultPresence()
        e.listeners.forEach((fn) => fn())
      }
    },
  )
  return entry
}

function releaseEntry(uid: string) {
  setTimeout(() => {
    const entry = cache.get(uid)
    if (entry && entry.listeners.size === 0) {
      entry.unsub?.()
      cache.delete(uid)
    }
  }, 2000)
}

function subscribe(uid: string, callback: () => void): () => void {
  const entry = getEntry(uid)
  entry.listeners.add(callback)
  return () => {
    entry.listeners.delete(callback)
    releaseEntry(uid)
  }
}

function getSnapshot(uid: string): PresenceData {
  return cache.get(uid)?.data ?? defaultPresence()
}

/**
 * Reactive presence for a single user (online / lastSeen).
 */
export function usePresence(uid: string | undefined): PresenceData {
  const data = useSyncExternalStore(
    (cb) => (uid ? subscribe(uid, cb) : () => {}),
    () => getSnapshot(uid ?? ''),
    () => getSnapshot(uid ?? ''),
  )
  return data
}

/**
 * Non-reactive read of the current cached presence value for a uid.
 */
export function presenceFor(uid: string): PresenceData {
  return getSnapshot(uid)
}

/**
 * Warms the presence cache for a set of uids (used by lists so rows render
 * instantly with the last known presence instead of flashing "offline").
 */
export function useWarmPresence(uids: string[]): void {
  useEffect(() => {
    const unique = Array.from(new Set(uids.filter(Boolean)))
    const unsubs = unique.map((uid) => {
      // subscribing once warms the cache without holding a reactive render
      const entry = getEntry(uid)
      const dummy = () => {}
      entry.listeners.add(dummy)
      return () => {
        entry.listeners.delete(dummy)
        releaseEntry(uid)
      }
    })
    return () => unsubs.forEach((fn) => fn())
  }, [uids.join(',')])
}
