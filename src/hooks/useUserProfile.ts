import { useEffect, useState } from 'react'
import { subscribeToUser, getUserProfile } from '@/services/users'
import type { UserProfile } from '@/types'

export function useUserProfile(uid: string | undefined): {
  user: UserProfile | null
  loading: boolean
} {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    let active = true
    getUserProfile(uid)
      .then((profile) => {
        if (active) {
          setUser(profile)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    const unsub = subscribeToUser(uid, (u) => {
      if (active) setUser(u)
    })
    return () => {
      active = false
      unsub()
    }
  }, [uid])

  return { user, loading }
}

export function useCurrentUserProfile(uid: string | undefined): {
  profile: UserProfile | null
  user: UserProfile | null
  loading: boolean
  refresh: () => Promise<void>
} {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!uid) return
    try {
      const p = await getUserProfile(uid)
      setProfile(p)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!uid) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    let active = true
    refresh()
    const unsub = subscribeToUser(uid, (u) => {
      if (active) setProfile(u)
    })
    return () => {
      active = false
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  return { profile, user: profile, loading, refresh }
}
