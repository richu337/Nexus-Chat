import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { app } from './config'

export const db = getFirestore(app)

if (typeof window !== 'undefined') {
  try {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code !== 'already-exists') {
        console.warn('[firestore] offline persistence unavailable', err)
      }
    })
  } catch (e) {
    // non-fatal
    console.warn('[firestore] offline persistence unavailable', e)
  }
}
