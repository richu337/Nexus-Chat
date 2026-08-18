import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageSquarePlus, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { useConversations } from '@/hooks/useConversations'
import { Avatar } from '@/components/common/Avatar'
import { GroupAvatar } from '@/components/chat/GroupAvatar'
import { ListSkeleton } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner'
import { formatTime, formatLastSeen } from '@/utils/time'
import { otherMember } from '@/utils'
import { usePresence, useWarmPresence } from '@/hooks/usePresence'
import { reconcileUnreadCounts } from '@/services/conversations'
import { subscribeToTyping } from '@/services/typing'
import { subscribeToUser } from '@/services/users'
import type { Conversation, UserProfile } from '@/types'

function GroupConversationRow({ conversation, me, onOpen }: {
  conversation: Conversation
  me: string
  onOpen: () => void
}) {
  const unread = conversation.unreadCount?.[me] ?? 0
  const memberIds = (conversation.members ?? []).filter((id) => id !== me).slice(0, 3)
  const [memberProfiles, setMemberProfiles] = useState<Map<string, UserProfile>>(new Map())
  const [typingNames, setTypingNames] = useState<string[]>([])

  // Subscribe to member profiles
  useEffect(() => {
    const unsubscribes: (() => void)[] = []
    for (const uid of memberIds) {
      const unsub = subscribeToUser(uid, (u) => {
        if (u) setMemberProfiles((prev) => new Map(prev).set(uid, u))
      })
      unsubscribes.push(unsub)
    }
    return () => unsubscribes.forEach((u) => u())
  }, [memberIds.join(',')])

  // Subscribe to typing for group members
  useEffect(() => {
    if (!conversation.id) return
    const members = (conversation.members ?? []).filter((id) => id !== me)
    const unsubscribes: (() => void)[] = []
    for (const uid of members) {
      const unsub = subscribeToTyping(conversation.id, uid, (active) => {
        setTypingNames((prev) => {
          const name = memberProfiles.get(uid)?.name?.split(' ')[0] ?? ''
          if (!name) return prev
          if (active && !prev.includes(name)) return [...prev, name]
          if (!active) return prev.filter((n) => n !== name)
          return prev
        })
      })
      unsubscribes.push(unsub)
    }
    return () => unsubscribes.forEach((u) => u())
  }, [conversation.id, conversation.members, me, memberProfiles])

  const isMine = conversation.lastMessageSenderId === me
  const senderName = memberProfiles.get(conversation.lastMessageSenderId ?? '')?.name?.split(' ')[0] ?? ''
  const preview = typingNames.length > 0
    ? null
    : conversation.lastMessage
      ? (isMine ? 'You: ' : (conversation.type === 'group' && senderName ? `${senderName}: ` : '')) + conversation.lastMessage
      : 'No messages yet'

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <GroupAvatar
        groupPhotoURL={conversation.groupPhotoURL}
        groupName={conversation.groupName}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 truncate font-semibold text-slate-900 dark:text-slate-100">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            {conversation.groupName ?? 'Group'}
          </span>
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          {typingNames.length > 0 ? (
            <span className="truncate text-sm font-medium text-indigo-500 dark:text-indigo-400">
              {typingNames.length === 1
                ? `${typingNames[0]} is typing…`
                : `${typingNames[0]} and ${typingNames.length - 1} other${typingNames.length > 2 ? 's' : ''} typing…`}
            </span>
          ) : (
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm text-slate-500 dark:text-slate-400">{preview}</span>
            </div>
          )}
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

function DirectConversationRow({ conversation, me, onOpen }: {
  conversation: Conversation
  me: string
  onOpen: () => void
}) {
  const friendId = otherMember(conversation.members, me) ?? ''
  const { user } = useCurrentUserProfile(friendId)
  const { online, lastSeen } = usePresence(friendId)
  const unread = conversation.unreadCount?.[me] ?? 0
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!friendId || !conversation.id) return
    const unsub = subscribeToTyping(conversation.id, friendId, (active) => {
      setTyping(active)
    })
    return unsub
  }, [friendId, conversation.id])

  const isMine = conversation.lastMessageSenderId === me
  const preview = typing
    ? null
    : conversation.lastMessage
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
          {typing ? (
            <span className="truncate text-sm font-medium text-indigo-500 dark:text-indigo-400">
              {user?.name?.split(' ')[0] ?? 'They'} are typing…
            </span>
          ) : (
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm text-slate-500 dark:text-slate-400">{preview}</span>
              {!online && (
                <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  · {formatLastSeen(lastSeen, online)}
                </span>
              )}
            </div>
          )}
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
    () => conversations
      .filter((c) => c.type === 'direct')
      .flatMap((c) => otherMember(c.members, me) ?? []),
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/create-group')}
              className="flex items-center gap-2 rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              <Users className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">New Group</span>
            </button>
            <button
              onClick={() => navigate('/search')}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
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
            description="Add a friend and start your first conversation, or create a group."
            action={
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/create-group')}
                  className="rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                >
                  <Users className="mr-1.5 inline h-4 w-4" />
                  New Group
                </button>
                <button
                  onClick={() => navigate('/search')}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  Find Friends
                </button>
              </div>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {conversations
              .filter((c) => matchesFilter(c, filter))
              .map((c) =>
                c.type === 'group' ? (
                  <GroupConversationRow
                    key={c.id}
                    conversation={c}
                    me={me}
                    onOpen={() => navigate(`/chat/${c.id}`)}
                  />
                ) : (
                  <DirectConversationRow
                    key={c.id}
                    conversation={c}
                    me={me}
                    onOpen={() => navigate(`/chat/${c.id}`)}
                  />
                ),
              )}
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
  const name = (conversation.groupName ?? '').toLowerCase()
  return preview.includes(f) || name.includes(f)
}
