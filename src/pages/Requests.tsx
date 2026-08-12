import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/common/Avatar'
import { ListSkeleton } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/common/Button'
import {
  subscribeToIncomingRequests,
  subscribeToOutgoingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
} from '@/services/friends'
import type { FriendRequest } from '@/types'

function IncomingRow({ request }: { request: FriendRequest }) {
  const { user: authUser } = useAuth()
  const { user } = useCurrentUserProfile(request.senderId)
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link to={`/user/${request.senderId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={user?.name ?? '…'} photoURL={user?.photoURL} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {user?.name ?? '…'}
          </p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
            @{user?.username ?? '…'}
          </p>
        </div>
      </Link>
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await acceptFriendRequest(request)
              showToast('Friend request accepted.', 'success')
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Could not accept request.', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            setBusy(true)
            try {
              await rejectFriendRequest(request)
              showToast('Request rejected.', 'info')
            } catch {
              showToast('Could not reject request.', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}

function OutgoingRow({ request }: { request: FriendRequest }) {
  const { user } = useCurrentUserProfile(request.receiverId)
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link to={`/user/${request.receiverId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={user?.name ?? '…'} photoURL={user?.photoURL} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {user?.name ?? '…'}
          </p>
          <p className="truncate text-xs text-amber-600 dark:text-amber-400">Request pending</p>
        </div>
      </Link>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await cancelFriendRequest(request)
            showToast('Request cancelled.', 'info')
          } catch {
            showToast('Could not cancel request.', 'error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Cancel
      </Button>
    </div>
  )
}

export default function Requests() {
  const { user } = useAuth()
  const me = user?.uid ?? ''

  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!me) return
    let alive = true

    const unsub1 = subscribeToIncomingRequests(me, (reqs) => {
      if (alive) { setIncoming(reqs); setLoading(false) }
    })
    const unsub2 = subscribeToOutgoingRequests(me, (reqs) => {
      if (alive) { setOutgoing(reqs); setLoading(false) }
    })

    const timeout = setTimeout(() => { if (alive) setLoading(false) }, 8000)

    return () => { alive = false; unsub1(); unsub2(); clearTimeout(timeout) }
  }, [me])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Friend Requests</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : incoming.length === 0 && outgoing.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-7 w-7" />}
            title="No requests"
            description="Friend requests from other users will appear here."
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
          <div>
            {incoming.length > 0 && (
              <div>
                <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Incoming
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {incoming.map((r) => (
                    <IncomingRow key={r.id} request={r} />
                  ))}
                </div>
              </div>
            )}
            {outgoing.length > 0 && (
              <div>
                <p className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sent
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {outgoing.map((r) => (
                    <OutgoingRow key={r.id} request={r} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
