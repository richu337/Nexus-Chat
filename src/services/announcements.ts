import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/firestore'
import type { Announcement } from '@/types'

const ANNOUNCEMENTS_COLLECTION = 'announcements'

export function announcementsCollection() {
  return collection(db, ANNOUNCEMENTS_COLLECTION)
}

export function announcementDocRef(id: string) {
  return doc(db, ANNOUNCEMENTS_COLLECTION, id)
}

export async function createAnnouncement(input: {
  title: string
  body: string
  senderId: string
  senderName: string
}): Promise<string> {
  const docRef = await addDoc(announcementsCollection(), {
    title: input.title.trim(),
    body: input.body.trim(),
    senderId: input.senderId,
    senderName: input.senderName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(announcementDocRef(id))
}

export function subscribeToAnnouncements(
  onChange: (announcements: Announcement[]) => void,
  maxItems = 20,
): () => void {
  const q = query(
    announcementsCollection(),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  )

  return onSnapshot(q, (snap) => {
    const items: Announcement[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Announcement[]
    onChange(items)
  })
}
