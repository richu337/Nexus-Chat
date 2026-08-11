import { useEffect, useState } from 'react'
import { subscribeToConversation } from '@/services/conversations'
import type { Conversation } from '@/types'

export function useConversation(id: string | undefined): {
  conversation: Conversation | null
  loading: boolean
} {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      setConversation(null)
      setLoading(false)
      return
    }
    setLoading(true)
    let active = true
    const unsub = subscribeToConversation(id, (c) => {
      if (active) {
        setConversation(c)
        setLoading(false)
      }
    })
    return () => {
      active = false
      unsub()
    }
  }, [id])

  return { conversation, loading }
}
