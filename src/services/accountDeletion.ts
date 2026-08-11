import { collection, getDocs, query, where, deleteDoc, writeBatch, doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import { auth, deleteFirebaseUser } from '@/firebase/auth'
import { deleteUserDocument } from './users'
import { deleteProfilePicture } from '@/firebase/storage'

const BATCH_SIZE = 400

async function deleteCollectionQuery(q: Parameters<typeof getDocs>[0]): Promise<void> {
  while (true) {
    const snap = await getDocs(q)
    if (snap.empty) return
    const batch = writeBatch(db)
    let count = 0
    for (const d of snap.docs) {
      batch.delete(d.ref)
      count++
      if (count >= BATCH_SIZE) break
    }
    await batch.commit()
    if (count < BATCH_SIZE) return
  }
}

/**
 * Removes the user's profile, friendships, requests, blocks and direct
 * conversations (including message subcollections), then deletes the Firebase
 * Auth account. Conversations are cleaned up because they only connect two
 * users and would otherwise linger unusably.
 */
export async function deleteAccount(uid: string): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated.')

  // 1. Relationships
  const friendshipsQ = query(collection(db, 'friendships'), where('members', 'array-contains', uid))
  await deleteCollectionQuery(friendshipsQ)

  const requestsQ = query(
    collection(db, 'friendRequests'),
    where('senderId', '==', uid),
  )
  await deleteCollectionQuery(requestsQ)
  const requestsQ2 = query(
    collection(db, 'friendRequests'),
    where('receiverId', '==', uid),
  )
  await deleteCollectionQuery(requestsQ2)

  const blocksQ = query(collection(db, 'blocks'), where('blockerId', '==', uid))
  await deleteCollectionQuery(blocksQ)
  const blocksQ2 = query(collection(db, 'blocks'), where('blockedId', '==', uid))
  await deleteCollectionQuery(blocksQ2)

  // 2. Conversations + their messages
  const conversationsQ = query(collection(db, 'conversations'), where('members', 'array-contains', uid))
  const convSnap = await getDocs(conversationsQ)
  for (const convDoc of convSnap.docs) {
    const messagesQ = query(collection(db, 'conversations', convDoc.id, 'messages'))
    await deleteCollectionQuery(messagesQ)
    await deleteDoc(convDoc.ref)
  }

  // 3. Typing sub-docs
  for (const convDoc of convSnap.docs) {
    await deleteDoc(doc(db, 'conversations', convDoc.id, '_typing', 'state')).catch(() => {})
  }

  // 4. Username reservation + profile picture
  const userSnap = await getDoc(doc(db, 'users', uid))
  const usernameLower = userSnap.exists()
    ? (userSnap.data().usernameLowercase as string | undefined)
    : undefined
  if (usernameLower) {
    await deleteDoc(doc(db, 'usernames', usernameLower)).catch(() => {})
  }
  const photoURL = userSnap.exists() ? (userSnap.data().photoURL as string | undefined) : undefined
  if (photoURL) {
    await deleteProfilePicture(photoURL).catch(() => {})
  }

  // 5. User profile
  await deleteUserDocument(uid)

  // 6. Firebase Auth account (must be last so Firestore writes still succeed)
  try {
    await deleteFirebaseUser(user)
  } catch {
    // Account cleanup already done; the auth record may require recent login.
    // The user can contact support. Swallow so the UI can show a friendly message.
    throw new Error(
      'Your data has been deleted, but the account record could not be removed. Please log in again and retry, or contact support.',
    )
  }
}
