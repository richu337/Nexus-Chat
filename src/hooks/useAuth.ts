import { useEffect, useState } from 'react'
import { onUserChange, getUser } from '@/firebase/currentUser'
import type { User } from 'firebase/auth'

export function useAuth() {
  const [user, setUser] = useState<User | null>(getUser())
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    const unsub = onUserChange((u) => {
      setUser(u)
      setStatus('ready')
    })
    return unsub
  }, [])

  return { user, status }
}
