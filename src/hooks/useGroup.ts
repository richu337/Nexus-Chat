import { useEffect, useState } from 'react'
import { subscribeToGroup } from '@/services/groups'
import type { Conversation } from '@/types'

export function useGroup(groupId: string | undefined): {
  group: Conversation | null
  loading: boolean
} {
  const [group, setGroup] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) {
      setGroup(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeToGroup(groupId, (g) => {
      setGroup(g)
      setLoading(false)
    })
    return unsub
  }, [groupId])

  return { group, loading }
}
