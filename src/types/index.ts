import type { Timestamp } from 'firebase/firestore'

// ─── User ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string
  name: string
  username: string
  usernameLowercase: string
  email: string
  photoURL: string | null
  bio: string | null
  role: UserRole
  banned: boolean
  online: boolean
  lastSeen: Timestamp | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  settings: UserSettings
}

export interface UserSettings {
  messageNotifications: boolean
  friendRequestNotifications: boolean
  showOnlineStatus: boolean
  showLastSeen: boolean
  profileDiscoverable: boolean
}

export const defaultUserSettings: UserSettings = {
  messageNotifications: true,
  friendRequestNotifications: true,
  showOnlineStatus: true,
  showLastSeen: true,
  profileDiscoverable: true,
}

// ─── Friends ───────────────────────────────────────────────────────────────

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export interface FriendRequest {
  id: string
  senderId: string
  receiverId: string
  status: FriendRequestStatus
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export interface Friendship {
  id: string
  members: string[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export interface Block {
  id: string
  blockerId: string
  blockedId: string
  createdAt: Timestamp | null
}

export type RelationshipStatus =
  | 'self'
  | 'friend'
  | 'request-sent'
  | 'request-received'
  | 'none'
  | 'blocked-them'
  | 'blocked-by'
  | 'blocked-both'

// ─── Admin / Announcements ─────────────────────────────────────────────────

export type UserRole = 'user' | 'admin'

export interface Announcement {
  id: string
  title: string
  body: string
  senderId: string
  senderName: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

// ─── Conversations ─────────────────────────────────────────────────────────

export type MessageType = 'text' | 'image'
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error'
export type ConversationType = 'direct' | 'group'

export interface Conversation {
  id: string
  type: ConversationType
  members: string[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  lastMessage: string | null
  lastMessageType: MessageType
  lastMessageSenderId: string | null
  lastMessageAt: Timestamp | null
  lastReadAt: Record<string, Timestamp>
  unreadCount: Record<string, number>
  // Group-specific fields (null for direct conversations)
  groupName: string | null
  groupPhotoURL: string | null
  createdBy: string | null
  admins: string[]
}

export interface MessageReplyTo {
  messageId: string
  senderId: string
  text: string
}

export interface MessageReaction {
  uid: string
  emoji: string
  createdAt: Timestamp | null
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  text: string
  type: MessageType
  status: MessageStatus
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deliveredAt: Timestamp | null
  readAt: Timestamp | null
  replyTo?: MessageReplyTo | null
  reactions?: MessageReaction[]
  edited?: boolean
  deleted?: boolean
  deletedAt?: Timestamp | null
  // Image-specific fields
  imageURL?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export const GROUP_MAX_MEMBERS = 50

// ─── Misc ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  user: UserProfile
  relationship: RelationshipStatus
}

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastData {
  id: number
  kind: ToastKind
  message: string
}

export interface PresenceData {
  online: boolean
  lastSeen: Timestamp | null
}
