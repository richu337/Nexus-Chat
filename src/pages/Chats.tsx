import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageSquarePlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { useConversations } from '@/hooks/useConversations'
import { Avatar } from '@/components/common/Avatar'
import { ListSkeleton } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner'
import { formatTime } from '@/utils/time'
import { otherMember } from '@/utils'
import { usePresence, useWarmPresence } from '@/hooks/usePresence'
import { reconcileUnreadCounts } from '@/services/conversations'
import type { Conversation } from '@/types'

function ConversationRow({ conversation, me, onOpen }: {
  conversation: Conversation
  me: string
  onOpen: () => void
}) {
  const friendId = otherMember(conversation.members, me) ?? ''
  const { user } = useCurrentUserProfile(friendId)
  const { online } = usePresence(friendId)
  const unread = conversation.unreadCount?.[me] ?? 0

  const isMine = conversation.lastMessageSenderId === me
  const preview = conversation.lastMessage
    ? (isMine ? 'You: ' : '') + conversation.lastMessage
    : 'Say hello 👋'

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <Avatar name={user?.name ?? '…'} photoURL={user?.photoURL} online={online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {user?.name ?? '…'}
          </span>
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-slate-500 dark:text-slate-400">{preview}</span>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export default function Chats() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { conversations, loading } = useConversations(user?.uid)
  const [filter, setFilter] = useState('')

  const me = user?.uid ?? ''

  // Keep the presence map warm for all visible conversation partners.
  const memberIds = useMemo(
    () => conversations.flatMap((c) => otherMember(c.members, me) ?? []),
    [conversations, me],
  )
  useWarmPresence(memberIds)

  // Reconcile unread counts once after a cold start.
  useEffect(() => {
    if (me && conversations.length > 0) {
      void reconcileUnreadCounts(me, conversations).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, conversations.length])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Chats</h1>
          <button
            onClick={() => navigate('/search')}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            aria-label="Search chats"
          />
        </div>
      </header>

      <AnnouncementBanner />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquarePlus className="h-7 w-7" />}
            title="No conversations yet"
            description="Add a friend and start your first conversation."
            action={
              <button
                onClick={() => navigate('/search')}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Find Friends
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {conversations
              .filter((c) => matchesFilter(c, filter))
              .map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  me={me}
                  onOpen={() => navigate(`/chat/${c.id}`)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function matchesFilter(conversation: Conversation, filter: string): boolean {
  const f = filter.trim().toLowerCase()
  if (!f) return true
  const preview = (conversation.lastMessage ?? '').toLowerCase()
  return preview.includes(f)
}
