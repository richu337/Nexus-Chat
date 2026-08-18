import {
  collection,
  addDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import { conversationDocRef, updateDoc } from './conversationsShared'
import type { Conversation } from '@/types'

export interface CreateGroupInput {
  creatorId: string
  name: string
  memberIds: string[]
  photoURL?: string | null
}

/**
 * Creates a new group conversation. The creator is automatically included
 * as a member and admin. Firestore auto-generates the document ID.
 */
export async function createGroup(input: CreateGroupInput): Promise<string> {
  const { creatorId, name, memberIds, photoURL } = input
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Group name is required.')

  // Ensure creator is in members
  const allMembers = Array.from(new Set([creatorId, ...memberIds]))

  const now = serverTimestamp()
  const data: Record<string, unknown> = {
    type: 'group',
    members: allMembers,
    createdAt: now,
    updatedAt: now,
    lastMessage: null,
    lastMessageType: 'text',
    lastMessageSenderId: null,
    lastMessageAt: null,
    lastReadAt: {},
    unreadCount: {},
    groupName: trimmed,
    groupPhotoURL: photoURL ?? null,
    createdBy: creatorId,
    admins: [creatorId],
  }

  // Initialize unread counts to 0 for all members
  for (const uid of allMembers) {
    ;(data.unreadCount as Record<string, number>)[uid] = 0
  }

  const ref = await addDoc(collection(db, 'conversations'), data)
  return ref.id
}

/**
 * Returns a group conversation by ID, or null if not found / not a group.
 */
export async function getGroup(groupId: string): Promise<Conversation | null> {
  const snap = await getDoc(conversationDocRef(groupId))
  if (!snap.exists()) return null
  const data = snap.data()
  if (data.type !== 'group') return null
  return { id: snap.id, ...data } as Conversation
}

/**
 * Subscribes to a single group conversation in real-time.
 */
export function subscribeToGroup(
  groupId: string,
  onChange: (group: Conversation | null) => void,
): () => void {
  return onSnapshot(
    conversationDocRef(groupId),
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

// ─── Group Updates ───────────────────────────────────────────────────────

/**
 * Updates the group name. Only admins can call this.
 */
export async function updateGroupName(groupId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Group name cannot be empty.')
  await updateDoc(conversationDocRef(groupId), {
    groupName: trimmed,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Updates the group photo URL. Only admins can call this.
 */
export async function updateGroupPhoto(groupId: string, photoURL: string | null): Promise<void> {
  await updateDoc(conversationDocRef(groupId), {
    groupPhotoURL: photoURL,
    updatedAt: serverTimestamp(),
  })
}

// ─── Member Management ──────────────────────────────────────────────────

/**
 * Adds members to the group. Only admins can call this.
 * Returns the updated member list.
 */
export async function addMembers(
  groupId: string,
  newMemberIds: string[],
): Promise<string[]> {
  const snap = await getDoc(conversationDocRef(groupId))
  if (!snap.exists()) throw new Error('Group not found.')
  const data = snap.data() as Record<string, unknown>
  const currentMembers = (data.members as string[]) ?? []

  // Filter out users already in the group
  const toAdd = newMemberIds.filter((id) => !currentMembers.includes(id))
  if (toAdd.length === 0) return currentMembers

  const updatedMembers = [...currentMembers, ...toAdd]

  // Build unread count updates for new members
  const unreadUpdates: Record<string, number> = {}
  for (const uid of toAdd) {
    unreadUpdates[`unreadCount.${uid}`] = 0
  }

  await updateDoc(conversationDocRef(groupId), {
    members: updatedMembers,
    ...unreadUpdates,
    updatedAt: serverTimestamp(),
  })

  return updatedMembers
}

/**
 * Removes a member from the group. Admins can remove anyone except
 * the group creator. Members can remove themselves (leave).
 */
export async function removeMember(
  groupId: string,
  callerId: string,
  targetId: string,
): Promise<string[]> {
  const snap = await getDoc(conversationDocRef(groupId))
  if (!snap.exists()) throw new Error('Group not found.')
  const data = snap.data() as Record<string, unknown>
  const currentMembers = (data.members as string[]) ?? []
  const createdBy = data.createdBy as string
  const admins = (data.admins as string[]) ?? []

  // Cannot remove the group creator
  if (targetId === createdBy) {
    throw new Error('Cannot remove the group creator.')
  }

  // Only admins or the target themselves can remove
  if (callerId !== targetId && !admins.includes(callerId)) {
    throw new Error('Only admins can remove members.')
  }

  const updatedMembers = currentMembers.filter((id) => id !== targetId)

  await updateDoc(conversationDocRef(groupId), {
    members: updatedMembers,
    updatedAt: serverTimestamp(),
  })

  return updatedMembers
}

/**
 * Allows a member to leave the group. The creator cannot leave.
 */
export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const snap = await getDoc(conversationDocRef(groupId))
  if (!snap.exists()) throw new Error('Group not found.')
  const data = snap.data() as Record<string, unknown>
  const createdBy = data.createdBy as string

  if (uid === createdBy) {
    throw new Error('Group creator cannot leave. Transfer ownership or delete the group.')
  }

  await removeMember(groupId, uid, uid)
}

// ─── Admin Management ──────────────────────────────────────────────────

/**
 * Promotes a member to admin. Only existing admins can call this.
 */
export async function promoteToAdmin(groupId: string, targetId: string): Promise<void> {
  await updateDoc(conversationDocRef(groupId), {
    admins: arrayUnion(targetId),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Demotes an admin to regular member. Only existing admins can call this.
 * Cannot demote the group creator.
 */
export async function demoteAdmin(groupId: string, targetId: string): Promise<void> {
  const snap = await getDoc(conversationDocRef(groupId))
  if (!snap.exists()) throw new Error('Group not found.')
  const data = snap.data() as Record<string, unknown>
  const createdBy = data.createdBy as string

  if (targetId === createdBy) {
    throw new Error('Cannot demote the group creator.')
  }

  await updateDoc(conversationDocRef(groupId), {
    admins: arrayRemove(targetId),
    updatedAt: serverTimestamp(),
  })
}

// ─── Delete Group ──────────────────────────────────────────────────────

/**
 * Deletes a group conversation. Only admins can call this.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  // Soft delete by marking as deleted
  await updateDoc(conversationDocRef(groupId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  })
}

// ─── Queries ───────────────────────────────────────────────────────────

/**
 * Returns all group conversations a user is a member of.
 */
export function subscribeToUserGroups(
  uid: string,
  onChange: (groups: Conversation[]) => void,
): () => void {
  const q = query(
    collection(db, 'conversations'),
    where('type', '==', 'group'),
    where('members', 'array-contains', uid),
  )
  return onSnapshot(q, (snap) => {
    const groups = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Conversation))
      .sort((a, b) => {
        const at = a.lastMessageAt?.toMillis() ?? 0
        const bt = b.lastMessageAt?.toMillis() ?? 0
        return bt - at
      })
    onChange(groups)
  })
}

/**
 * Checks if a user is an admin of a group.
 */
export function isAdmin(group: Conversation, uid: string): boolean {
  return (group.admins ?? []).includes(uid)
}

/**
 * Checks if a user is the creator of a group.
 */
export function isCreator(group: Conversation, uid: string): boolean {
  return group.createdBy === uid
}
