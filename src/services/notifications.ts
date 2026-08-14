import { auth } from '@/firebase/auth'
import { getUserProfile } from './users'
import { getConversation } from './conversations'
import type { UserProfile } from '@/types'

const RELAY_URL = import.meta.env.VITE_NOTIFICATION_RELAY_URL ?? ''

function isRelayConfigured(): boolean {
  return RELAY_URL.trim().length > 0
}

async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  try {
    return await user.getIdToken()
  } catch {
    return null
  }
}

interface SendNotificationInput {
  kind: 'message' | 'friend_request' | 'friend_request_accepted'
  targetUserId: string
  text?: string
  conversationId?: string
  sender: UserProfile
}

/**
 * Asks the self-hosted relay to deliver a push notification to `targetUserId`.
 * The relay verifies the sender's identity, checks friendship + blocks, reads
 * the recipient's FCM tokens and sends via Firebase Cloud Messaging.
 *
 * This is best-effort: if no relay is configured, or the call fails, the app
 * simply continues (real-time delivery still works via Firestore listeners).
 */
export async function sendPushNotification(input: SendNotificationInput): Promise<boolean> {
  if (!isRelayConfigured()) return false
  if (!input.targetUserId) return false

  const token = await getIdToken()
  if (!token) return false

  try {
    const res = await fetch(`${RELAY_URL}/api/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: input.kind,
        targetUserId: input.targetUserId,
        text: input.text,
        conversationId: input.conversationId,
        senderName: input.sender.name,
        senderUsername: input.sender.username,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Convenience: notify the recipient of a new direct message.
 */
export async function notifyNewMessage(opts: {
  sender: UserProfile
  targetUserId: string
  text: string
  conversationId: string
}): Promise<boolean> {
  const target = await getUserProfile(opts.targetUserId)
  if (!target) return false
  if (target.settings?.messageNotifications === false) return false

  return sendPushNotification({
    kind: 'message',
    targetUserId: opts.targetUserId,
    text: opts.text,
    conversationId: opts.conversationId,
    sender: opts.sender,
  })
}

/**
 * Convenience: notify a user that they received a friend request.
 */
export async function notifyFriendRequest(opts: {
  sender: UserProfile
  targetUserId: string
}): Promise<boolean> {
  const target = await getUserProfile(opts.targetUserId)
  if (!target) return false
  if (target.settings?.friendRequestNotifications === false) return false

  return sendPushNotification({
    kind: 'friend_request',
    targetUserId: opts.targetUserId,
    sender: opts.sender,
  })
}

/**
 * Convenience: notify a user that their friend request was accepted.
 */
export async function notifyFriendRequestAccepted(opts: {
  fromUid: string
  toUid: string
  name?: string
}): Promise<boolean> {
  const sender = await getUserProfile(opts.fromUid)
  if (!sender) return false
  const target = await getUserProfile(opts.toUid)
  if (!target) return false
  if (target.settings?.friendRequestNotifications === false) return false

  const profile: UserProfile = sender
  return sendPushNotification({
    kind: 'friend_request_accepted',
    targetUserId: opts.toUid,
    sender: { ...profile, name: opts.name ?? profile.name },
  })
}

/**
 * Registers this device's FCM token with the relay so the recipient can be
 * reached when the app is closed. No-op when the relay is not configured.
 */
export async function registerDeviceToken(fcmToken: string, platform: 'web' | 'android'): Promise<boolean> {
  if (!isRelayConfigured()) return false
  const token = await getIdToken()
  if (!token) return false

  try {
    const res = await fetch(`${RELAY_URL}/api/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fcmToken, platform }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function resolveConversationId(
  conversationId: string,
): Promise<string | null> {
  const convo = await getConversation(conversationId)
  return convo?.id ?? null
}

/**
 * Broadcasts an announcement push notification to all users via the relay.
 * Only callable by admin users (the relay verifies admin role server-side).
 */
export async function sendAnnouncementNotification(opts: {
  title: string
  body: string
  senderName: string
}): Promise<boolean> {
  if (!isRelayConfigured()) return false

  const token = await getIdToken()
  if (!token) return false

  try {
    const res = await fetch(`${RELAY_URL}/api/announce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        senderName: opts.senderName,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
