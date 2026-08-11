import { auth } from './auth'
import type { User } from 'firebase/auth'

let current: User | null = null

auth.onAuthStateChanged((user) => {
  current = user
})

export function getUser(): User | null {
  return current
}

export function onUserChange(cb: (user: User | null) => void): () => void {
  return auth.onAuthStateChanged(cb)
}
