import { useEffect, useRef } from 'react'
import { subscribeToConversations, incrementUnread } from '@/services/conversations'
import { useAuth } from './useAuth'

/**
 * Watches the user's conversations in real time. Whenever a new message
 * arrives for a conversation the user is NOT currently viewing, it atomically
 * increments that conversation's unread counter for the user.
 *
 * The counter is reset to 0 by markConversationRead when the chat is opened.
 * This only drives the badge while the app is online; on a cold start the
 * Chats page reconciles counts with countUnreadMessages.
 */
export function useConversationWatcher(openConversationId?: string): void {
  const { user } = useAuth()
  const uid = user?.uid
  const openRef = useRef(openConversationId)
  const seenRef = useRef(new Map<string, number>())

  openRef.current = openConversationId

  useEffect(() => {
    if (!uid) return

    const unsub = subscribeToConversations(uid, (convos) => {
      for (const convo of convos) {
        const lastAt = convo.lastMessageAt?.toMillis() ?? 0
        const sender = convo.lastMessageSenderId
        const prev = seenRef.current.get(convo.id) ?? 0

        // New incoming message, conversation not open → increment unread.
        if (
          lastAt > prev &&
          sender &&
          sender !== uid &&
          convo.id !== openRef.current
        ) {
          void incrementUnread(convo.id, uid).catch(() => {})
        }

        seenRef.current.set(convo.id, lastAt)
      }
    })

    return () => unsub()
  }, [uid])
}
