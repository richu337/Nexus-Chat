import {
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  increment,
  query,
  collection,
  where,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import { conversationDocRef, updateDoc } from './conversationsShared'
import { getConversationId } from '@/utils'
import { isEitherDirectionBlocked } from './friends'
import type { Conversation } from '@/types'

export function getDirectConversationId(a: string, b: string): string {
  return getConversationId(a, b)
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const snap = await getDoc(conversationDocRef(id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Conversation
}

/**
 * Returns the existing direct conversation between two users, or creates it.
 * The deterministic ID guarantees only one conversation can ever exist
 * between the same pair. If the other user has blocked us, creation fails.
 */
export async function getOrCreateDirectConversation(a: string, b: string): Promise<Conversation> {
  const id = getDirectConversationId(a, b)
  const existing = await getConversation(id)
  if (existing) return existing

  if (await isEitherDirectionBlocked(a, b)) {
    throw new Error('You cannot start a conversation with this user.')
  }

  const now = serverTimestamp()
  const data: Record<string, unknown> = {
    type: 'direct',
    members: [a, b],
    createdAt: now,
    updatedAt: now,
    lastMessage: null,
    lastMessageType: 'text',
    lastMessageSenderId: null,
    lastMessageAt: null,
    lastReadAt: {},
    unreadCount: { [a]: 0, [b]: 0 },
  }

  try {
    await setDoc(conversationDocRef(id), data)
  } catch (err) {
    // If it already exists (race), fetch it.
    const re = await getConversation(id)
    if (re) return re
    throw err
  }

  return (await getConversation(id)) as Conversation
}

export function subscribeToConversation(id: string, onChange: (convo: Conversation | null) => void) {
  return onSnapshot(
    conversationDocRef(id),
    (snap) => {
      if (!snap.exists()) {
        onChange(null)
        return
      }
      onChange({ id: snap.id, ...snap.data() } as Conversation)
    },
    () => onChange(null),
  )
}

export function subscribeToConversations(uid: string, onChange: (convos: Conversation[]) => void) {
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', uid),
  )
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Conversation)
        .sort(sortByLastMessageAtDesc),
    )
  })
}

function sortByLastMessageAtDesc(a: Conversation, b: Conversation): number {
  const at = a.lastMessageAt?.toMillis() ?? 0
  const bt = b.lastMessageAt?.toMillis() ?? 0
  return bt - at
}

/**
 * Marks the conversation as read by `uid`: resets the unread counter and
 * records the read position so the badge clears.
 */
export async function markConversationRead(conversationId: string, uid: string): Promise<void> {
  await updateDoc(conversationDocRef(conversationId), {
    [`lastReadAt.${uid}`]: serverTimestamp(),
    [`unreadCount.${uid}`]: 0,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Atomically increments the unread counter for `uid`. Used by the recipient's
 * client when a new message arrives for a conversation they are not viewing.
 */
export async function incrementUnread(conversationId: string, uid: string): Promise<void> {
  await updateDoc(conversationDocRef(conversationId), {
    [`unreadCount.${uid}`]: increment(1),
  })
}

/**
 * Reconciles unread counters after a cold start. The real-time watcher only
 * increments while the app is online; this recomputes counts from the message
 * history so badges are accurate even if messages arrived while the app was
 * closed. Only touches conversations that look potentially unread.
 */
export async function reconcileUnreadCounts(
  uid: string,
  conversations: Conversation[],
): Promise<void> {
  const { countUnreadMessages } = await import('./messages')

  for (const convo of conversations) {
    const lastReadAt = convo.lastReadAt?.[uid] ?? null
    const stored = convo.unreadCount?.[uid] ?? 0
    const lastMessageAt = convo.lastMessageAt

    // Fast path: nothing newer than last read → definitely 0.
    if (!lastMessageAt || (lastReadAt && lastReadAt.toMillis() >= lastMessageAt.toMillis())) {
      if (stored !== 0) {
        await updateDoc(conversationDocRef(convo.id), { [`unreadCount.${uid}`]: 0 }).catch(() => {})
      }
      continue
    }

    // Newer messages exist; recompute if the stored value looks wrong.
    if (stored === 0 || stored < 0) {
      const actual = await countUnreadMessages(convo.id, uid, lastReadAt)
      if (actual !== stored) {
        await updateDoc(conversationDocRef(convo.id), { [`unreadCount.${uid}`]: actual }).catch(() => {})
      }
    }
  }
}

export async function touchConversation(conversationId: string): Promise<void> {
  await updateDoc(conversationDocRef(conversationId), {
    updatedAt: serverTimestamp(),
  })
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await updateDoc(conversationDocRef(conversationId), {
    deletedBy: true,
  })
}

export async function getConversationsForUser(uid: string): Promise<Conversation[]> {
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', uid),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Conversation)
    .sort(sortByLastMessageAtDesc)
}
