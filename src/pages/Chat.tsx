import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Send, MoreVertical, Phone, Video, Check, CheckCheck } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '@/hooks/useAuth'
import { useConversation } from '@/hooks/useConversation'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { usePresence } from '@/hooks/usePresence'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/common/Avatar'
import { ChatSkeleton } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { markConversationRead } from '@/services/conversations'
import {
  subscribeToMessages,
  loadOlderMessages,
  sendMessage,
  markMessagesDelivered,
  markMessagesRead,
} from '@/services/messages'
import { startTyping, stopTyping, subscribeToTyping } from '@/services/typing'
import { notifyNewMessage } from '@/services/notifications'
import { otherMember } from '@/utils'
import { formatMessageTime } from '@/utils/time'
import { validateMessage } from '@/utils/validators'
import type { Message } from '@/types'

function MessageStatusIcon({ message, isNew }: { message: Message; isNew?: boolean }) {
  if (message.status === 'sending') {
    return (
      <span className="inline-flex items-center gap-0.5">
        <span className="h-1 w-1 rounded-full bg-white/50 animate-pulse" />
        <span className="h-1 w-1 rounded-full bg-white/50 animate-pulse [animation-delay:150ms]" />
        <span className="h-1 w-1 rounded-full bg-white/50 animate-pulse [animation-delay:300ms]" />
      </span>
    )
  }
  if (message.status === 'error') {
    return <span className="text-[10px] font-medium text-rose-300">Failed</span>
  }
  if (message.status === 'read') {
    return (
      <CheckCheck
        className={`h-4 w-4 text-sky-300 ${isNew ? 'tick-enter' : ''}`}
        aria-label="Read"
      />
    )
  }
  if (message.status === 'delivered') {
    return (
      <CheckCheck
        className={`h-4 w-4 text-white/60 ${isNew ? 'tick-enter' : ''}`}
        aria-label="Delivered"
      />
    )
  }
  return (
    <Check
      className={`h-4 w-4 text-white/60 ${isNew ? 'tick-enter' : ''}`}
      aria-label="Sent"
    />
  )
}

export default function Chat() {
  const { conversationId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const me = user?.uid ?? ''

  const { conversation } = useConversation(conversationId)
  const otherId = conversation ? (otherMember(conversation.members, me) ?? '') : ''
  const { user: otherUser } = useCurrentUserProfile(otherId)
  const { online, lastSeen } = usePresence(otherId)
  const { user: senderProfile } = useCurrentUserProfile(me)

  const [messages, setMessages] = useState<Message[]>([])
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldStickRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const prevCountRef = useRef(0)
  const animatingRef = useRef<Set<string>>(new Set())

  // ── Messages subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return
    setMessages([])
    setHasOlder(false)
    seenRef.current = new Set()
    animatingRef.current = new Set()
    shouldStickRef.current = true

    const unsub = subscribeToMessages(
      conversationId,
      (msgs) => {
        setMessages((prev) => {
          const merged = new Map(prev.map((m) => [m.id, m]))
          for (const m of msgs) merged.set(m.id, m)
          return Array.from(merged.values()).sort((a, b) => {
            return (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
          })
        })
        // If we got a full page back, there may be older messages.
        if (msgs.length >= 40) setHasOlder(true)
        else setHasOlder(false)
      },
      () => showToast('Could not load messages.', 'error'),
    )

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Track oldest message for "load older" pagination.
  const oldest = useMemo(() => messages[0], [messages])

  // ── Scroll behavior ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const newCount = messages.length
    const added = newCount - prevCountRef.current
    prevCountRef.current = newCount

    if (shouldStickRef.current) {
      if (added > 0) {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [messages.length])

  // ── Mark as read / delivered ─────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !me || !otherId) return
    if (messages.length === 0) return

    const newForMe = messages.filter(
      (m) => m.senderId === otherId && !seenRef.current.has(m.id),
    )
    if (newForMe.length === 0) return

    for (const m of newForMe) seenRef.current.add(m.id)

    // We are viewing the conversation → mark delivered + read immediately.
    void markMessagesDelivered(conversationId, otherId, newForMe)
      .then(() => markMessagesRead(conversationId, otherId, newForMe))
      .catch(() => {})
    void markConversationRead(conversationId, me).catch(() => {})
  }, [messages, conversationId, me, otherId])

  // ── Typing subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !otherId) return
    const unsub = subscribeToTyping(conversationId, otherId, (active) => {
      setTyping(active)
    })
    return unsub
  }, [conversationId, otherId])

  // ── Typing emission (debounced) ──────────────────────────────────────────
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onInputChange = (value: string) => {
    setInput(value)
    if (value.trim().length > 0 && conversationId) {
      void startTyping(conversationId, me)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => {
        void stopTyping(conversationId, me)
      }, 2500)
    }
  }

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current)
      if (conversationId && me) void stopTyping(conversationId, me)
    }
  }, [conversationId, me])

  // ── Load older messages ──────────────────────────────────────────────────
  const handleLoadOlder = async () => {
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    shouldStickRef.current = false
    const prevHeight = scrollRef.current?.scrollHeight ?? 0
    try {
      const older = await loadOlderMessages(conversationId, oldest)
      setHasOlder(older.length >= 40)
      setMessages((prev) => {
        const merged = new Map(prev.map((m) => [m.id, m]))
        for (const m of older) merged.set(m.id, m)
        return Array.from(merged.values()).sort(
          (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
        )
      })
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight
        }
      })
    } catch {
      showToast('Could not load older messages.', 'error')
    } finally {
      setLoadingOlder(false)
    }
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    shouldStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!conversationId || !me || !senderProfile) return
    const text = input.trim()
    const err = validateMessage(text)
    if (err || sending) return

    setSending(true)
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      conversationId,
      senderId: me,
      text,
      type: 'text',
      status: 'sending',
      createdAt: new Timestamp(Date.now() / 1000, 0),
      updatedAt: new Timestamp(Date.now() / 1000, 0),
      deliveredAt: null,
      readAt: null,
    }
    animatingRef.current.add(optimistic.id)
    setMessages((prev) => [...prev, optimistic])
    setInput('')
    shouldStickRef.current = true
    inputRef.current?.focus()

    try {
      const saved = await sendMessage(conversationId, me, text)
      animatingRef.current.add(saved.id)
      animatingRef.current.delete(optimistic.id)
      setMessages((prev) =>
        Array.from(
          new Map(
            prev
              .map((m) => (m.id === optimistic.id ? { ...saved, status: 'sent' as const } : m))
              .map((m) => [m.id, m]),
          ).values(),
        ),
      )
      setTimeout(() => animatingRef.current.delete(saved.id), 350)
      void stopTyping(conversationId, me)
      // Best-effort push notification.
      if (otherId && otherUser) {
        void notifyNewMessage({
          sender: senderProfile,
          targetUserId: otherId,
          text,
          conversationId,
        })
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id ? { ...m, status: 'error' as const } : m,
        ),
      )
      showToast('Message could not be sent. Check your connection.', 'error')
    } finally {
      setSending(false)
    }
  }, [conversationId, me, input, sending, senderProfile, otherId, otherUser, showToast])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (!conversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <button
            onClick={() => navigate('/chats')}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Conversation</span>
        </div>
        <ChatSkeleton />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}      <header className="flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <button
          onClick={() => navigate('/chats')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <Link to={`/user/${otherId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={otherUser?.name ?? '…'} photoURL={otherUser?.photoURL} online={online} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
              {otherUser?.name ?? '…'}
            </p>
            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
              {typing
                ? <span className="font-medium text-indigo-500">{otherUser?.name?.split(' ')[0] ?? ''} is typing…</span>
                : online
                  ? 'Online'
                  : formatMessageTime(lastSeen)}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-1">
          <button
            className="hidden h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex"
            aria-label="Call"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            className="hidden h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex"
            aria-label="Video"
          >
            <Video className="h-5 w-5" />
          </button>
          <Link
            to={`/user/${otherId}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Profile"
          >
            <MoreVertical className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4 dark:bg-slate-950"
      >
        {hasOlder && (
          <div className="mb-4 flex justify-center">
            <button
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-indigo-600 shadow-sm ring-1 ring-slate-200 hover:bg-indigo-50 dark:bg-slate-900 dark:text-indigo-400 dark:ring-slate-800 dark:hover:bg-slate-800"
            >
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Send className="h-7 w-7" />}
              title="No messages yet"
              description={`Say hello to ${otherUser?.name ?? 'this user'} and start the conversation.`}
            />
          </div>
        )}

        <div className="space-y-1">
          {messages.map((msg, idx) => {
            const mine = msg.senderId === me
            const showTime =
              idx === 0 ||
              (messages[idx - 1]?.senderId !== msg.senderId) ||
              ((messages[idx - 1]?.createdAt?.toMillis() ?? 0) < (msg.createdAt?.toMillis() ?? 0) - 5 * 60_000)
            const isNew = animatingRef.current.has(msg.id)
            return (
              <div key={msg.id}>
                {showTime && msg.createdAt && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[70%] ${
                      isNew ? 'msg-enter' : ''
                    } ${
                      mine
                        ? 'rounded-br-md bg-indigo-600 text-white'
                        : 'rounded-bl-md bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                    {mine && (
                      <span className="ml-2 inline-flex items-center">
                        <MessageStatusIcon message={msg} isNew={isNew} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white px-3 py-3 pb-safe dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-end gap-2">
          <button
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 sm:flex"
            aria-label="Attach"
            onClick={() => showToast('File sharing is coming soon.', 'info')}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />

          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
