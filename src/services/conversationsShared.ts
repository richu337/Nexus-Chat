import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase/firestore'

export function conversationDocRef(id: string) {
  return doc(db, 'conversations', id)
}

export { updateDoc }
