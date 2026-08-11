import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  collection,
  where,
  getDocs,
  orderBy,
  runTransaction,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import {
  getFriendRequestId,
  getFriendshipId,
  getBlockId,
  sortedPairKey,
} from '@/utils'
import type { Block, FriendRequest, Friendship, RelationshipStatus } from '@/types'

function friendRequestDocRef(id: string) {
  return doc(db, 'friendRequests', id)
}

function friendshipDocRef(id: string) {
  return doc(db, 'friendships', id)
}

function blockDocRef(id: string) {
  return doc(db, 'blocks', id)
}

// ─── Requests ──────────────────────────────────────────────────────────────

export function subscribeToIncomingRequests(uid: string, onChange: (requests: FriendRequest[]) => void) {
  const q = query(
    collection(db, 'friendRequests'),
    where('receiverId', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FriendRequest))
  })
}

export function subscribeToOutgoingRequests(uid: string, onChange: (requests: FriendRequest[]) => void) {
  const q = query(
    collection(db, 'friendRequests'),
    where('senderId', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FriendRequest))
  })
}

/**
 * Sends a friend request. Enforces all business rules:
 *  - cannot request yourself
 *  - cannot request an existing friend
 *  - cannot duplicate a pending request (either direction)
 *  - blocked users cannot be requested (in either direction)
 */
export async function sendFriendRequest(fromUid: string, toUid: string): Promise<void> {
  if (fromUid === toUid) throw new Error('You cannot send a friend request to yourself.')

  const friendCheck = await getFriendship(fromUid, toUid)
  if (friendCheck) throw new Error('You are already friends with this user.')

  const blocked = await isEitherDirectionBlocked(fromUid, toUid)
  if (blocked) throw new Error('This user cannot be added right now.')

  const id = getFriendRequestId(fromUid, toUid)
  const reverseId = getFriendRequestId(toUid, fromUid)

  await runTransaction(db, async (tx) => {
    const [existing, reverse] = await Promise.all([
      tx.get(friendRequestDocRef(id)),
      tx.get(friendRequestDocRef(reverseId)),
    ])

    if (existing.exists() && existing.data().status === 'pending') {
      throw new Error('You have already sent a request to this user.')
    }
    if (reverse.exists() && reverse.data().status === 'pending') {
      throw new Error('This user has already sent you a request.')
    }
    if (existing.exists() && existing.data().status === 'accepted') {
      throw new Error('You are already friends with this user.')
    }
    if (reverse.exists() && reverse.data().status === 'accepted') {
      throw new Error('You are already friends with this user.')
    }

    const now = serverTimestamp()
    tx.set(
      friendRequestDocRef(id),
      {
        senderId: fromUid,
        receiverId: toUid,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    )
  })
}

/**
 * Accepts a pending friend request.
 *
 * Runs in two phases because Firestore security rules evaluate transaction
 * writes against pre-transaction state: the friendship create rule verifies
 * an *accepted* request exists, so the request must be committed as accepted
 * before the friendship doc can be created.
 */
export async function acceptFriendRequest(request: FriendRequest, acceptorName?: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const reqRef = friendRequestDocRef(request.id)
    const reqSnap = await tx.get(reqRef)
    if (!reqSnap.exists()) throw new Error('This request no longer exists.')
    if (reqSnap.data().status !== 'pending') {
      throw new Error('This request is no longer pending.')
    }
    tx.update(reqRef, { status: 'accepted', updatedAt: serverTimestamp() })
  })

  // Phase 2: now the accepted request is visible to the rules engine.
  const friendshipId = getFriendshipId(request.senderId, request.receiverId)
  await setDoc(friendshipDocRef(friendshipId), {
    members: [request.senderId, request.receiverId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Notify the sender (best-effort, fire-and-forget).
  void notifyFriendAccepted(request.receiverId, request.senderId, acceptorName)
}

/**
 * Repairs "accepted but no friendship" states (e.g. the app was closed
 * between the two phases of acceptFriendRequest). Called on app start.
 */
export async function reconcileAcceptedRequests(uid: string): Promise<void> {
  const [asSender, asReceiver] = await Promise.all([
    getDocs(
      query(
        collection(db, 'friendRequests'),
        where('senderId', '==', uid),
        where('status', '==', 'accepted'),
      ),
    ),
    getDocs(
      query(
        collection(db, 'friendRequests'),
        where('receiverId', '==', uid),
        where('status', '==', 'accepted'),
      ),
    ),
  ])

  const seen = new Set<string>()
  const requests = [...asSender.docs, ...asReceiver.docs]
    .map((d) => ({ id: d.id, ...d.data() }) as FriendRequest)
    .filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

  for (const req of requests) {
    const friendshipId = getFriendshipId(req.senderId, req.receiverId)
    if (await getFriendship(req.senderId, req.receiverId)) continue
    await setDoc(friendshipDocRef(friendshipId), {
      members: [req.senderId, req.receiverId],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  }
}

export async function rejectFriendRequest(request: FriendRequest): Promise<void> {
  await updateDoc(friendRequestDocRef(request.id), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  })
}

export async function cancelFriendRequest(request: FriendRequest): Promise<void> {
  await updateDoc(friendRequestDocRef(request.id), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  })
}

async function notifyFriendAccepted(fromUid: string, toUid: string, name?: string): Promise<void> {
  try {
    const { notifyFriendRequestAccepted } = await import('./notifications')
    void notifyFriendRequestAccepted({ fromUid, toUid, name })
  } catch {
    // best-effort
  }
}

// ─── Friendships ───────────────────────────────────────────────────────────

export function subscribeToFriendships(uid: string, onChange: (friends: Friendship[]) => void) {
  const q = query(collection(db, 'friendships'), where('members', 'array-contains', uid))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Friendship))
  })
}

export async function getFriendship(a: string, b: string): Promise<Friendship | null> {
  const snap = await getDoc(friendshipDocRef(getFriendshipId(a, b)))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Friendship
}

export async function removeFriend(a: string, b: string): Promise<void> {
  await deleteDoc(friendshipDocRef(getFriendshipId(a, b)))
}

export async function getFriendIds(uid: string): Promise<string[]> {
  const q = query(collection(db, 'friendships'), where('members', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.flatMap((d) => {
    const members = (d.data().members ?? []) as string[]
    return members.filter((m) => m !== uid)
  })
}

// ─── Blocks ────────────────────────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new Error('You cannot block yourself.')

  await runTransaction(db, async (tx) => {
    const blockRef = blockDocRef(getBlockId(blockerId, blockedId))
    tx.set(blockRef, {
      blockerId,
      blockedId,
      createdAt: serverTimestamp(),
    })

    // Remove any friendship between the two.
    const friendshipRef = friendshipDocRef(getFriendshipId(blockerId, blockedId))
    const fs = await tx.get(friendshipRef)
    if (fs.exists()) tx.delete(friendshipRef)

    // Close any pending requests between them.
    const outgoing = friendRequestDocRef(getFriendRequestId(blockerId, blockedId))
    const incoming = friendRequestDocRef(getFriendRequestId(blockedId, blockerId))
    const [o, i] = await Promise.all([tx.get(outgoing), tx.get(incoming)])
    if (o.exists()) tx.delete(outgoing)
    if (i.exists()) tx.delete(incoming)
  })
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await deleteDoc(blockDocRef(getBlockId(blockerId, blockedId)))
}

export function subscribeToBlocks(uid: string, onChange: (blocks: Block[]) => void) {
  const q = query(collection(db, 'blocks'), where('blockerId', '==', uid))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Block))
  })
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const snap = await getDoc(blockDocRef(getBlockId(blockerId, blockedId)))
  return snap.exists()
}

export async function isEitherDirectionBlocked(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    isBlocked(a, b),
    isBlocked(b, a),
  ])
  return ab || ba
}

export async function getBlocksForUser(uid: string): Promise<Block[]> {
  const q = query(collection(db, 'blocks'), where('blockerId', '==', uid))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Block)
}

export async function getBlockersOfUser(uid: string): Promise<Block[]> {
  const q = query(collection(db, 'blocks'), where('blockedId', '==', uid))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Block)
}

// ─── Relationship status ───────────────────────────────────────────────────

export interface RelationshipInfo {
  status: RelationshipStatus
  friendRequest?: FriendRequest
}

/**
 * Determines the relationship between the current user and `targetUid`.
 */
export async function getRelationship(me: string, targetUid: string): Promise<RelationshipInfo> {
  if (me === targetUid) return { status: 'self' }

  const [friendship, reqToTarget, reqFromTarget, blockedByMe, blockedByTarget] = await Promise.all([
    getFriendship(me, targetUid),
    getDoc(friendRequestDocRef(getFriendRequestId(me, targetUid))),
    getDoc(friendRequestDocRef(getFriendRequestId(targetUid, me))),
    isBlocked(me, targetUid),
    isBlocked(targetUid, me),
  ])

  if (blockedByMe && blockedByTarget) return { status: 'blocked-both' }
  if (blockedByMe) return { status: 'blocked-them' }
  if (blockedByTarget) return { status: 'blocked-by' }

  if (friendship) return { status: 'friend' }

  if (reqToTarget.exists()) {
    const req = { id: reqToTarget.id, ...reqToTarget.data() } as FriendRequest
    if (req.status === 'pending') return { status: 'request-sent', friendRequest: req }
  }
  if (reqFromTarget.exists()) {
    const req = { id: reqFromTarget.id, ...reqFromTarget.data() } as FriendRequest
    if (req.status === 'pending') return { status: 'request-received', friendRequest: req }
  }

  return { status: 'none' }
}

export { sortedPairKey }
