import { useEffect, useState } from 'react'
import { subscribeToConversations } from '@/services/conversations'
import type { Conversation } from '@/types'

export function useConversations(uid: string | undefined): {
  conversations: Conversation[]
  loading: boolean
} {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setConversations([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeToConversations(uid, (c) => {
      setConversations(c)
      setLoading(false)
    })
    return unsub
  }, [uid])

  return { conversations, loading }
}
