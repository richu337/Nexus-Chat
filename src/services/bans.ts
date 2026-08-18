import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/firebase/firestore'

export async function banUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    banned: true,
    updatedAt: serverTimestamp(),
  })
}

export async function unbanUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    banned: false,
    updatedAt: serverTimestamp(),
  })
}

export async function getBannedUsers(): Promise<{ uid: string; name: string; username: string; email: string }[]> {
  const q = query(collection(db, 'users'), where('banned', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    uid: d.id,
    name: d.data().name ?? '',
    username: d.data().username ?? '',
    email: d.data().email ?? '',
  }))
}
