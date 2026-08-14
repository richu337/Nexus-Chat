import { useEffect, useState } from 'react'
import { subscribeToAnnouncements } from '@/services/announcements'
import type { Announcement } from '@/types'

export function useAnnouncements(maxItems = 20): {
  announcements: Announcement[]
  loading: boolean
} {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeToAnnouncements((items) => {
      setAnnouncements(items)
      setLoading(false)
    }, maxItems)
    return unsub
  }, [maxItems])

  return { announcements, loading }
}
