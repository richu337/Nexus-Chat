import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  UserPlus,
  UserCheck,
  MessageSquare,
  MoreVertical,
  Ban,
  Flag,
  Clock,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useUserProfile, useCurrentUserProfile } from '@/hooks/useUserProfile'
import { usePresence } from '@/hooks/usePresence'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/common/Button'
import { Spinner } from '@/components/common/Button'
import {
  getRelationship,
  sendFriendRequest,
  blockUser,
  unblockUser,
  removeFriend,
  type RelationshipInfo,
} from '@/services/friends'
import { getOrCreateDirectConversation } from '@/services/conversations'
import { notifyFriendRequest } from '@/services/notifications'
import { formatLastSeen } from '@/utils/time'
import { isNativePlatform } from '@/utils/platform'
import type { RelationshipStatus } from '@/types'

export default function UserProfilePage() {
  const { userId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const me = user?.uid ?? ''

  const { user: profile, loading } = useUserProfile(userId)
  const { user: myProfile } = useCurrentUserProfile(me)
  const { online, lastSeen } = usePresence(userId)

  const [relationship, setRelationship] = useState<RelationshipInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!me || !userId) return
    let active = true
    void getRelationship(me, userId)
      .then((r) => {
        if (active) setRelationship(r)
      })
      .catch(() => {
        if (active) setRelationship({ status: 'none' })
      })
    return () => {
      active = false
    }
  }, [me, userId])

  if (loading || !profile) {
    return (
      <div className="flex h-full flex-col">
        <HeaderShell title="Profile" onBack={() => navigate(-1)} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  const status: RelationshipStatus = relationship?.status ?? 'none'
  const canMessage = status === 'friend'

  const handleAddFriend = async () => {
    setBusy(true)
    try {
      await sendFriendRequest(me, userId)
      if (myProfile) {
        await notifyFriendRequest({ sender: myProfile, targetUserId: userId })
      }
      setRelationship({ status: 'request-sent' })
      showToast('Friend request sent.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send request.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleMessage = async () => {
    setBusy(true)
    try {
      const convo = await getOrCreateDirectConversation(me, userId)
      navigate(`/chat/${convo.id}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open chat.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveFriend = async () => {
    setBusy(true)
    try {
      await removeFriend(me, userId)
      setRelationship({ status: 'none' })
      showToast('Friend removed.', 'success')
    } catch {
      showToast('Could not remove friend.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleBlock = async () => {
    setBusy(true)
    setMenuOpen(false)
    try {
      await blockUser(me, userId)
      setRelationship({ status: 'blocked-them' })
      showToast('User blocked.', 'info')
    } catch {
      showToast('Could not block user.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleUnblock = async () => {
    setBusy(true)
    setMenuOpen(false)
    try {
      await unblockUser(me, userId)
      setRelationship({ status: 'none' })
      showToast('User unblocked.', 'success')
    } catch {
      showToast('Could not unblock user.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleReport = () => {
    setMenuOpen(false)
    showToast('Report sent. Thank you for keeping Nexus Chat safe.', 'success')
  }

  return (
    <div className="flex h-full flex-col">
      <HeaderShell title="Profile" onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-8">
          <Avatar name={profile.name} photoURL={profile.photoURL} size="xl" online={online} />
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
            {profile.name}
          </h1>
          <p className="mt-0.5 text-sm font-medium text-slate-400 dark:text-slate-500">
            @{profile.username}
          </p>

          <div className="mt-2 flex items-center gap-1.5 text-sm">
            {online ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Online
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="h-4 w-4" aria-hidden />
                {formatLastSeen(lastSeen, online)}
              </span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-4 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {profile.bio}
            </p>
          )}

          {/* Relationship actions */}
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
            {status === 'self' && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate('/settings')}
              >
                Edit profile
              </Button>
            )}

            {status === 'none' && (
              <Button size="lg" onClick={() => void handleAddFriend()} loading={busy}>
                <UserPlus className="h-5 w-5" aria-hidden />
                Add Friend
              </Button>
            )}

            {status === 'request-sent' && (
              <Button variant="secondary" size="lg" disabled>
                <Clock className="h-5 w-5" aria-hidden />
                Friend Request Pending
              </Button>
            )}

            {status === 'request-received' && (
              <Button variant="secondary" size="lg" disabled>
                <Clock className="h-5 w-5" aria-hidden />
                Request Received
              </Button>
            )}

            {canMessage && (
              <Button size="lg" onClick={() => void handleMessage()} loading={busy}>
                <MessageSquare className="h-5 w-5" aria-hidden />
                Message
              </Button>
            )}

            {status === 'blocked-them' && (
              <Button variant="secondary" size="lg" onClick={() => void handleUnblock()}>
                <Ban className="h-5 w-5" aria-hidden />
                Unblock
              </Button>
            )}

            {status === 'blocked-by' && (
              <p className="text-center text-sm text-slate-400">
                You cannot interact with this user right now.
              </p>
            )}
          </div>

          {/* More menu */}
          {status !== 'self' && (
            <div className="relative mt-6">
              <Button variant="ghost" size="sm" onClick={() => setMenuOpen((v) => !v)}>
                <MoreVertical className="h-4 w-4" aria-hidden />
                More
              </Button>
              {menuOpen && (
                <div className="absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  {canMessage && (
                    <button
                      onClick={() => void handleRemoveFriend()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <UserCheck className="h-4 w-4" aria-hidden />
                      Remove friend
                    </button>
                  )}
                  {status === 'blocked-them' ? (
                    <button
                      onClick={() => void handleUnblock()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                      Unblock
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleBlock()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                      Block
                    </button>
                  )}
                  <button
                    onClick={handleReport}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <Flag className="h-4 w-4" aria-hidden />
                    Report
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 text-xs text-slate-400 dark:text-slate-600">
            {isNativePlatform() ? 'Android' : 'Web'}
          </div>
        </div>
      </div>
    </div>
  )
}

function HeaderShell({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
      <button
        onClick={onBack}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h1>
    </header>
  )
}
