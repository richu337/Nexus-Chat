import {
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  collection,
  where,
  limit,
  getDocs,
  runTransaction,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import { auth } from '@/firebase/auth'
import { getUser } from '@/firebase/currentUser'
import type { UserProfile, UserSettings } from '@/types'
import { defaultUserSettings } from '@/types'

export function userDocRef(uid: string) {
  return doc(db, 'users', uid)
}

export function usernameDocRef(usernameLowercase: string) {
  return doc(db, 'usernames', usernameLowercase)
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(userDocRef(uid))
  if (!snap.exists()) return null
  return { uid: snap.id, ...snap.data() } as UserProfile
}

export function subscribeToUser(uid: string, onChange: (user: UserProfile | null) => void) {
  return onSnapshot(
    userDocRef(uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null)
        return
      }
      const data = snap.data()
      onChange({
        uid: snap.id,
        ...data,
        settings: { ...defaultUserSettings, ...(data.settings ?? {}) },
      } as UserProfile)
    },
    () => onChange(null),
  )
}

/**
 * Checks whether a username is available. Reads the `usernames` collection so
 * the check is case-insensitive by construction (we store lowercase keys).
 */
export async function isUsernameAvailable(usernameLowercase: string): Promise<boolean> {
  const snap = await getDoc(usernameDocRef(usernameLowercase))
  return !snap.exists()
}

export interface CreateProfileInput {
  name: string
  username: string
  bio?: string
  photoURL?: string | null
}

/**
 * Creates the user profile and atomically reserves the username. If the
 * username is taken, the whole operation rolls back and throws an error.
 */
export async function createProfile(input: CreateProfileInput): Promise<UserProfile> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')

  const usernameLowercase = input.username.trim().toLowerCase()
  const now = serverTimestamp()

  try {
    await runTransaction(db, async (tx) => {
      const usernameRef = usernameDocRef(usernameLowercase)
      const usernameSnap = await tx.get(usernameRef)
      if (usernameSnap.exists()) {
        throw new Error('username-taken')
      }

      const profileRef = userDocRef(user.uid)
      const profile: Record<string, unknown> = {
        uid: user.uid,
        name: input.name.trim(),
        username: input.username.trim(),
        usernameLowercase,
        email: user.email ?? '',
        photoURL: input.photoURL ?? null,
        bio: input.bio?.trim() || null,
        online: true,
        lastSeen: now,
        createdAt: now,
        updatedAt: now,
        settings: defaultUserSettings,
      }

      tx.set(profileRef, profile, { merge: true })
      tx.set(usernameRef, { uid: user.uid })
    })

    return (await getUserProfile(user.uid)) as UserProfile
  } catch (err) {
    if (err instanceof Error && err.message === 'username-taken') {
      throw new Error('username-taken')
    }
    throw err
  }
}

/**
 * Updates the profile. If the username changes, the old reservation is moved
 * to the new one atomically. The caller is responsible for pre-validating and
 * checking availability via isUsernameAvailable.
 */
export async function updateProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, 'name' | 'bio' | 'photoURL' | 'username'>>,
): Promise<void> {
  const now = serverTimestamp()
  const data: Record<string, unknown> = { ...patch, updatedAt: now }

  if (patch.username) {
    const newLower = patch.username.trim().toLowerCase()
    data.username = patch.username.trim()
    data.usernameLowercase = newLower

    const current = await getUserProfile(uid)
    const oldLower = current?.usernameLowercase

    if (oldLower && oldLower !== newLower) {
      await runTransaction(db, async (tx) => {
        const newRef = usernameDocRef(newLower)
        const newSnap = await tx.get(newRef)
        if (newSnap.exists()) {
          throw new Error('username-taken')
        }
        tx.set(newRef, { uid })
        tx.delete(usernameDocRef(oldLower))
      })
    }
  }

  await updateDoc(userDocRef(uid), data)
}

export async function updateUserSettings(uid: string, settings: Partial<UserSettings>): Promise<void> {
  await updateDoc(userDocRef(uid), {
    settings,
    updatedAt: serverTimestamp(),
  })
}

export async function searchUsersByUsername(queryText: string): Promise<UserProfile[]> {
  const q = queryText.trim().toLowerCase()
  if (!q) return []

  const exactQuery = query(
    collection(db, 'users'),
    where('usernameLowercase', '==', q),
    limit(20),
  )
  const snap = await getDocs(exactQuery)
  const results = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)

  if (results.length === 0) {
    const prefixQuery = query(
      collection(db, 'users'),
      where('usernameLowercase', '>=', q),
      where('usernameLowercase', '<=', q + '\uf8ff'),
      limit(20),
    )
    const prefixSnap = await getDocs(prefixQuery)
    return prefixSnap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)
  }

  return results
}

export async function deleteUserDocument(uid: string): Promise<void> {
  await deleteDoc(userDocRef(uid))
}

export function currentUid(): string | null {
  return getUser()?.uid ?? null
}
