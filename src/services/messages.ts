import {
  collection,
  doc,
  addDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit as firestoreLimit,
  getDocs,
  startAfter,
  getCountFromServer,
  writeBatch,
  updateDoc,
  arrayUnion,
  arrayRemove,
  type Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import { updateDoc as convUpdateDoc, conversationDocRef } from './conversationsShared'
import type { Message, MessageReplyTo, MessageReaction } from '@/types'

const PAGE_SIZE = 40

function messagesCollectionRef(conversationId: string) {
  return collection(db, 'conversations', conversationId, 'messages')
}

function messageDocRef(conversationId: string, messageId: string) {
  return doc(db, 'conversations', conversationId, 'messages', messageId)
}

function parseMessage(docData: QueryDocumentSnapshot<DocumentData>): Message {
  const data = docData.data()
  return {
    id: docData.id,
    conversationId: docData.ref.parent.parent?.id ?? '',
    senderId: data.senderId ?? '',
    text: data.text ?? '',
    type: data.type ?? 'text',
    status: data.status ?? 'sent',
    createdAt: (data.createdAt as Timestamp | null) ?? null,
    updatedAt: (data.updatedAt as Timestamp | null) ?? null,
    deliveredAt: (data.deliveredAt as Timestamp | null) ?? null,
    readAt: (data.readAt as Timestamp | null) ?? null,
    replyTo: (data.replyTo as MessageReplyTo | null) ?? null,
    reactions: (data.reactions as MessageReaction[]) ?? [],
    edited: data.edited ?? false,
    deleted: data.deleted ?? false,
    deletedAt: (data.deletedAt as Timestamp | null) ?? null,
  }
}

/**
 * Streams the most recent messages (tail). New messages append live.
 */
export function subscribeToMessages(
  conversationId: string,
  onChange: (messages: Message[]) => void,
  onError?: (err: Error) => void,
) {
  const q = query(
    messagesCollectionRef(conversationId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(PAGE_SIZE),
  )
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map(parseMessage).sort((a, b) => {
        const at = a.createdAt?.toMillis() ?? 0
        const bt = b.createdAt?.toMillis() ?? 0
        return at - bt
      })
      onChange(msgs)
    },
    onError,
  )
}

/**
 * Loads a page of messages older than the given cursor (earliest loaded
 * message). Returns the messages in ascending order.
 */
export async function loadOlderMessages(
  conversationId: string,
  before: Message,
  pageSize = PAGE_SIZE,
): Promise<Message[]> {
  const q = query(
    messagesCollectionRef(conversationId),
    orderBy('createdAt', 'desc'),
    startAfter(before.createdAt),
    firestoreLimit(pageSize),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(parseMessage)
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
}

/**
 * Sends a text message. The message is created with status 'sent'; the UI
 * tracks 'sending' locally until this promise resolves.
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
): Promise<Message> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Message cannot be empty.')

  const now = serverTimestamp()
  const ref = await addDoc(messagesCollectionRef(conversationId), {
    senderId,
    text: trimmed,
    type: 'text',
    status: 'sent',
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
    readAt: null,
  })

  // Update conversation preview in the same write cycle.
  await convUpdateDoc(conversationDocRef(conversationId), {
    lastMessage: trimmed,
    lastMessageType: 'text',
    lastMessageSenderId: senderId,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return {
    id: ref.id,
    conversationId,
    senderId,
    text: trimmed,
    type: 'text',
    status: 'sent',
    createdAt: null,
    updatedAt: null,
    deliveredAt: null,
    readAt: null,
  }
}

/**
 * Marks all messages from `otherUid` as delivered, then read. Batch-writes
 * deliveredAt/readAt only for messages that don't already have them.
 */
export async function markMessagesDelivered(
  conversationId: string,
  otherUid: string,
  messages: Message[],
): Promise<void> {
  const batch = writeBatch(db)
  let changed = false

  for (const msg of messages) {
    if (msg.senderId !== otherUid) continue
    if (!msg.deliveredAt && !msg.readAt) {
      batch.update(messageDocRef(conversationId, msg.id), {
        deliveredAt: serverTimestamp(),
        status: 'delivered',
      })
      changed = true
    }
  }

  if (changed) {
    await batch.commit()
  }
}

/**
 * Marks all messages from `otherUid` as read (implying delivered too).
 */
export async function markMessagesRead(
  conversationId: string,
  otherUid: string,
  messages: Message[],
): Promise<void> {
  const batch = writeBatch(db)
  let changed = false

  for (const msg of messages) {
    if (msg.senderId !== otherUid) continue
    if (msg.readAt) continue
    batch.update(messageDocRef(conversationId, msg.id), {
      readAt: serverTimestamp(),
      deliveredAt: msg.deliveredAt ?? serverTimestamp(),
      status: 'read',
    })
    changed = true
  }

  if (changed) {
    await batch.commit()
  }
}

/**
 * How many messages are unread for `uid` in a conversation, computed
 * from a bounded read so a stale badge can be corrected on cold start.
 */
export async function countUnreadMessages(
  conversationId: string,
  uid: string,
  lastReadAt: Timestamp | null | undefined,
): Promise<number> {
  if (!lastReadAt) {
    const all = await getCountFromServer(messagesCollectionRef(conversationId))
    return all.data().count
  }

  const q = query(
    messagesCollectionRef(conversationId),
    orderBy('createdAt', 'desc'),
    // Bounded approximation to avoid an unbounded scan; corrected whenever
    // the conversation is opened.
    firestoreLimit(200),
  )
  const snap = await getDocs(q)
  const lastRead = lastReadAt.toMillis()
  let count = 0
  for (const d of snap.docs) {
    const data = d.data()
    const createdAt = (data.createdAt as Timestamp | null)?.toMillis() ?? 0
    if (createdAt > lastRead && data.senderId !== uid) count++
  }
  return count
}

// ─── Reply ───────────────────────────────────────────────────────────────

export async function replyToMessage(
  conversationId: string,
  senderId: string,
  text: string,
  replyTo: MessageReplyTo,
): Promise<Message> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Message cannot be empty.')

  const now = serverTimestamp()
  const ref = await addDoc(messagesCollectionRef(conversationId), {
    senderId,
    text: trimmed,
    type: 'text',
    status: 'sent',
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
    readAt: null,
    replyTo,
  })

  await convUpdateDoc(conversationDocRef(conversationId), {
    lastMessage: trimmed,
    lastMessageType: 'text',
    lastMessageSenderId: senderId,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return {
    id: ref.id,
    conversationId,
    senderId,
    text: trimmed,
    type: 'text',
    status: 'sent',
    createdAt: null,
    updatedAt: null,
    deliveredAt: null,
    readAt: null,
    replyTo,
  }
}

// ─── Edit ────────────────────────────────────────────────────────────────

export async function editMessage(
  conversationId: string,
  messageId: string,
  newText: string,
): Promise<void> {
  const trimmed = newText.trim()
  if (!trimmed) throw new Error('Message cannot be empty.')

  await updateDoc(messageDocRef(conversationId, messageId), {
    text: trimmed,
    edited: true,
    updatedAt: serverTimestamp(),
  })
}

// ─── Delete ──────────────────────────────────────────────────────────────

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  await updateDoc(messageDocRef(conversationId, messageId), {
    deleted: true,
    deletedAt: serverTimestamp(),
    text: '',
    updatedAt: serverTimestamp(),
  })
}

// ─── Reactions ───────────────────────────────────────────────────────────

export async function toggleReaction(
  conversationId: string,
  messageId: string,
  uid: string,
  emoji: string,
): Promise<void> {
  const snap = await getDoc(messageDocRef(conversationId, messageId))
  if (!snap.exists()) return

  const data = snap.data()
  const reactions = (data.reactions as MessageReaction[]) ?? []
  const existing = reactions.find((r) => r.uid === uid && r.emoji === emoji)

  if (existing) {
    await updateDoc(messageDocRef(conversationId, messageId), {
      reactions: arrayRemove({ uid, emoji, createdAt: existing.createdAt }),
    })
  } else {
    await updateDoc(messageDocRef(conversationId, messageId), {
      reactions: arrayUnion({ uid, emoji, createdAt: serverTimestamp() }),
    })
  }
}
