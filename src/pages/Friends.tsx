import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, MessageSquare } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFriendships } from '@/hooks/useFriendships'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { usePresence, useWarmPresence } from '@/hooks/usePresence'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/common/Avatar'
import { ListSkeleton } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { removeFriend } from '@/services/friends'
import { getOrCreateDirectConversation } from '@/services/conversations'
import { otherMember } from '@/utils'

function FriendRow({ friendId, me }: { friendId: string; me: string }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user: friendProfile } = useCurrentUserProfile(friendId)
  const { online } = usePresence(friendId)

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
      <Link to={`/user/${friendId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={friendProfile?.name ?? '…'} photoURL={friendProfile?.photoURL} online={online} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {friendProfile?.name ?? '…'}
          </p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
            @{friendProfile?.username ?? '…'}
            {online ? ' · Online' : friendProfile?.lastSeen ? ' · Last seen recently' : ''}
          </p>
        </div>
      </Link>

      <button
        onClick={async () => {
          try {
            await removeFriend(me, friendId)
            showToast('Friend removed.', 'success')
          } catch {
            showToast('Could not remove friend.', 'error')
          }
        }}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
      >
        Remove
      </button>
      <button
        onClick={async () => {
          try {
            const convo = await getOrCreateDirectConversation(me, friendId)
            navigate(`/chat/${convo.id}`)
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not open chat.', 'error')
          }
        }}
        className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        Message
      </button>
    </div>
  )
}

export default function Friends() {
  const { user } = useAuth()
  const me = user?.uid ?? ''
  const { friendships, loading } = useFriendships(me)

  const friendIds = useMemo(
    () => friendships.map((f) => otherMember(f.members, me) ?? ''),
    [friendships, me],
  )
  useWarmPresence(friendIds)

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Friends</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {friendships.length} {friendships.length === 1 ? 'friend' : 'friends'}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : friendships.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="No friends yet"
            description="Find people by username and send a friend request to get started."
            action={
              <Link
                to="/search"
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Find Friends
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {friendIds.map((id) => (
              <FriendRow key={id} friendId={id} me={me} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
