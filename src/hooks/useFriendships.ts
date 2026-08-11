import { useEffect, useState } from 'react'
import { subscribeToFriendships } from '@/services/friends'
import type { Friendship } from '@/types'

export function useFriendships(uid: string | undefined): {
  friendships: Friendship[]
  loading: boolean
} {
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setFriendships([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeToFriendships(uid, (f) => {
      setFriendships(f)
      setLoading(false)
    })
    return unsub
  }, [uid])

  return { friendships, loading }
}
