import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Send, MoreVertical, Phone, Video,
  Reply, Pencil, Trash2, SmilePlus, X, Check, CheckCheck,
} from 'lucide-react'
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
  replyToMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markMessagesDelivered,
  markMessagesRead,
} from '@/services/messages'
import { startTyping, stopTyping, subscribeToTyping } from '@/services/typing'
import { notifyNewMessage } from '@/services/notifications'
import { otherMember } from '@/utils'
import { formatMessageTime } from '@/utils/time'
import { validateMessage } from '@/utils/validators'
import type { Message, MessageReplyTo } from '@/types'

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥']

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

interface ContextMenuProps {
  message: Message
  me: string
  position: { x: number; y: number }
  onClose: () => void
  onReply: (msg: Message) => void
  onEdit: (msg: Message) => void
  onDelete: (msg: Message) => void
  onReact: (msg: Message, emoji: string) => void
}

function ContextMenu({ message, me, position, onClose, onReply, onEdit, onDelete, onReact }: ContextMenuProps) {
  const mine = message.senderId === me
  const [showEmoji, setShowEmoji] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        className="absolute min-w-[160px] rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
        style={{ left: Math.min(position.x, window.innerWidth - 180), top: Math.min(position.y, window.innerHeight - 200) }}
      >
        <button
          onClick={() => { onReply(message); onClose() }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Reply className="h-4 w-4" /> Reply
        </button>
        <button
          onClick={() => setShowEmoji(!showEmoji)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <SmilePlus className="h-4 w-4" /> React
        </button>
        {showEmoji && (
          <div className="flex gap-1 px-2 pb-1">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onReact(message, emoji); onClose() }}
                className="h-8 w-8 rounded-lg text-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {mine && (
          <>
            <button
              onClick={() => { onEdit(message); onClose() }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => { onDelete(message); onClose() }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </>
        )}
      </div>
    </div>
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
  const [replyTo, setReplyTo] = useState<MessageReplyTo | null>(null)
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [contextMenu, setContextMenu] = useState<{ message: Message; x: number; y: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldStickRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const prevCountRef = useRef(0)
  const animatingRef = useRef<Set<string>>(new Set())
  const sendingRef = useRef(false)

  // ── Messages subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return
    setMessages([])
    setHasOlder(false)
    seenRef.current = new Set()
    animatingRef.current = new Set()
    sendingRef.current = false
    shouldStickRef.current = true

    const unsub = subscribeToMessages(
      conversationId,
      (msgs) => {
        // While a send is in progress, ignore subscription updates to avoid
        // the optimistic + real duplicate flash. The send handler will
        // replace the optimistic with the real message when it resolves.
        if (sendingRef.current) return
        setMessages((prev) => {
          const merged = new Map(prev.map((m) => [m.id, m]))
          for (const m of msgs) merged.set(m.id, m)
          return Array.from(merged.values()).sort((a, b) => {
            return (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
          })
        })
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
        // Instant scroll — no smooth, no jump
        el.scrollTop = el.scrollHeight
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

  // ── Send / Reply / Edit ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!conversationId || !me || !senderProfile) return
    const text = input.trim()
    const err = validateMessage(text)
    if (err || sending) return

    // If editing, save the edit instead
    if (editingMsg) {
      const origText = editingMsg.text
      if (text === origText) { setEditingMsg(null); setInput(''); return }
      try {
        await editMessage(conversationId, editingMsg.id, text)
        setMessages((prev) => prev.map((m) =>
          m.id === editingMsg.id ? { ...m, text, edited: true } : m,
        ))
        setEditingMsg(null)
        setInput('')
        showToast('Message edited.', 'success')
      } catch {
        showToast('Could not edit message.', 'error')
      }
      return
    }

    setSending(true)
    sendingRef.current = true

    // Build replyTo metadata if replying
    const replyMeta = replyTo ? { ...replyTo } : null

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
      replyTo: replyMeta,
    }
    animatingRef.current.add(optimistic.id)
    setMessages((prev) => [...prev, optimistic])
    setInput('')
    setReplyTo(null)
    shouldStickRef.current = true
    inputRef.current?.focus()

    try {
      let saved: Message
      if (replyMeta) {
        saved = await replyToMessage(conversationId, me, text, replyMeta)
      } else {
        saved = await sendMessage(conversationId, me, text)
      }
      animatingRef.current.add(saved.id)
      animatingRef.current.delete(optimistic.id)
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== optimistic.id)
        return [...next, { ...saved, status: 'sent' as const }]
      })
      setTimeout(() => animatingRef.current.delete(saved.id), 350)
      void stopTyping(conversationId, me)
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
      sendingRef.current = false
      setSending(false)
    }
  }, [conversationId, me, input, sending, senderProfile, otherId, otherUser, showToast, replyTo, editingMsg])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
    if (e.key === 'Escape' && editingMsg) {
      setEditingMsg(null)
      setInput('')
    }
  }

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault()
    setContextMenu({ message: msg, x: e.clientX, y: e.clientY })
  }

  const handleStartEdit = (msg: Message) => {
    setEditingMsg(msg)
    setInput(msg.text)
    setReplyTo(null)
    inputRef.current?.focus()
  }

  const handleDelete = async (msg: Message) => {
    if (!conversationId) return
    try {
      await deleteMessage(conversationId, msg.id)
      setMessages((prev) => prev.map((m) =>
        m.id === msg.id ? { ...m, deleted: true, text: '' } : m,
      ))
      showToast('Message deleted.', 'success')
    } catch {
      showToast('Could not delete message.', 'error')
    }
  }

  const handleReact = async (msg: Message, emoji: string) => {
    if (!conversationId || !me) return
    try {
      await toggleReaction(conversationId, msg.id, me, emoji)
    } catch {
      showToast('Could not add reaction.', 'error')
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
            const isEditing = editingMsg?.id === msg.id

            if (msg.deleted) {
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
                    <p className="max-w-[80%] px-3.5 py-2 text-sm italic text-slate-400 dark:text-slate-500">
                      This message was deleted.
                    </p>
                  </div>
                </div>
              )
            }

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
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    {/* Reply quote */}
                    {msg.replyTo && (
                      <div className={`mb-1.5 rounded-lg border-l-2 px-2.5 py-1 text-xs ${
                        mine
                          ? 'border-white/40 bg-white/10 text-white/70'
                          : 'border-indigo-400 bg-indigo-50 text-slate-500 dark:bg-indigo-950/30 dark:text-slate-400'
                      }`}>
                        <p className="font-medium">{msg.replyTo.senderId === me ? 'You' : otherUser?.name?.split(' ')[0]}</p>
                        <p className="truncate">{msg.replyTo.text}</p>
                      </div>
                    )}

                    {/* Message text or edit input */}
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={1}
                          className="w-full resize-none rounded-lg bg-white/10 px-2 py-1 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/40"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              void handleSend()
                            }
                            if (e.key === 'Escape') {
                              setEditingMsg(null)
                              setInput('')
                            }
                          }}
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setEditingMsg(null); setInput('') }}
                            className="rounded-md px-2 py-0.5 text-xs text-white/60 hover:text-white/80"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => void handleSend()}
                            className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/30"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                    )}

                    {/* Edited indicator + status */}
                    {!isEditing && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        {msg.edited && <span className="text-[10px] opacity-60">(edited)</span>}
                        {mine && <MessageStatusIcon message={msg} isNew={isNew} />}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reactions */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(
                      msg.reactions.reduce<Record<string, number>>((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
                        return acc
                      }, {}),
                    ).map(([emoji, count]) => {
                      const myReact = msg.reactions!.some((r) => r.emoji === emoji && r.uid === me)
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReact(msg, emoji)}
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs ring-1 transition-colors ${
                            myReact
                              ? 'bg-indigo-100 ring-indigo-300 text-indigo-700 dark:bg-indigo-900/40 dark:ring-indigo-600 dark:text-indigo-300'
                              : 'bg-slate-100 ring-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-400'
                          }`}
                        >
                          <span>{emoji}</span>
                          {count > 1 && <span>{count}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white px-3 py-3 pb-safe dark:border-slate-800 dark:bg-slate-900">
        {/* Reply preview */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 dark:bg-indigo-950/30">
            <Reply className="h-4 w-4 shrink-0 text-indigo-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                Replying to {replyTo.senderId === me ? 'yourself' : otherUser?.name?.split(' ')[0]}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{replyTo.text}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="shrink-0 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Edit banner */}
        {editingMsg && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
            <Pencil className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="flex-1 text-xs font-medium text-amber-600 dark:text-amber-400">Editing message</p>
            <button onClick={() => { setEditingMsg(null); setInput('') }} className="shrink-0 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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
            placeholder={editingMsg ? 'Edit message…' : 'Type a message…'}
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          message={contextMenu.message}
          me={me}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onReply={(msg) => {
            setReplyTo({
              messageId: msg.id,
              senderId: msg.senderId,
              text: msg.text,
            })
            setEditingMsg(null)
            inputRef.current?.focus()
          }}
          onEdit={handleStartEdit}
          onDelete={(msg) => setDeleteTarget(msg)}
          onReact={handleReact}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Delete message?</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              This action cannot be undone. The message will be removed for everyone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleDelete(deleteTarget); setDeleteTarget(null) }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
