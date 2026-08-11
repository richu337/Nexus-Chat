import admin from 'firebase-admin'

const db = admin.firestore()

// ── Device tokens ──────────────────────────────────────────────────────────
// Tokens live under devices/{uid}/{tokenHash} so each user owns their devices.

export async function addDevice(uid, fcmToken, platform) {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(fcmToken).digest('hex')
  const ref = db.collection('devices').doc(uid).collection('tokens').doc(hash)
  await ref.set({
    token: fcmToken,
    platform,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

export async function removeDevice(uid, fcmToken) {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(fcmToken).digest('hex')
  const ref = db.collection('devices').doc(uid).collection('tokens').doc(hash)
  await ref.delete()
}

async function getDeviceTokens(uid) {
  const snap = await db.collection('devices').doc(uid).collection('tokens').get()
  return snap.docs.map((d) => d.data().token).filter(Boolean)
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getBlockId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

async function isBlockedBetween(a, b) {
  const id = await getBlockId(a, b)
  const snap = await db.collection('blocks').doc(id).get()
  return snap.exists
}

async function isConversationMember(conversationId, uid) {
  const snap = await db.collection('conversations').doc(conversationId).get()
  if (!snap.exists) return false
  const members = snap.data().members ?? []
  return members.includes(uid)
}

// ── Notification senders ───────────────────────────────────────────────────

async function send(uid, payload) {
  const tokens = await getDeviceTokens(uid)
  if (tokens.length === 0) return

  const message = {
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data ?? {},
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  }

  const response = await admin.messaging().sendEachForMulticast(message)
  // Remove tokens that are no longer valid.
  const invalid = tokens.filter((_, i) => response.responses[i]?.error?.code === 'messaging/registration-token-not-registered')
  for (const token of invalid) {
    await removeDevice(uid, token).catch(() => {})
  }
}

export async function sendMessageNotification({
  senderId,
  senderName,
  senderUsername,
  targetUserId,
  text,
  conversationId,
}) {
  // Recipient must exist and not have blocked the sender.
  const blocked = await isBlockedBetween(senderId, targetUserId)
  if (blocked) return

  const member = await isConversationMember(conversationId, targetUserId)
  if (!member) return

  const senderRef = db.collection('users').doc(senderId)
  const senderSnap = await senderRef.get()
  const sender = senderSnap.exists ? senderSnap.data() : {}

  const displayName = senderName || sender.name || 'Someone'

  await send(targetUserId, {
    title: displayName,
    body: text || 'New message',
    data: {
      kind: 'message',
      conversationId,
      senderId,
    },
  })
}

export async function sendFriendRequestNotification({
  senderId,
  senderName,
  senderUsername,
  targetUserId,
}) {
  const blocked = await isBlockedBetween(senderId, targetUserId)
  if (blocked) return

  const senderRef = db.collection('users').doc(senderId)
  const senderSnap = await senderRef.get()
  const sender = senderSnap.exists ? senderSnap.data() : {}

  const displayName = senderName || sender.name || 'Someone'

  await send(targetUserId, {
    title: 'New friend request',
    body: `${displayName} (@${senderUsername || '…'}) sent you a friend request`,
    data: {
      kind: 'friend_request',
      senderId,
    },
  })
}

export async function sendFriendRequestAcceptedNotification({
  senderId,
  senderName,
  senderUsername,
  targetUserId,
}) {
  const blocked = await isBlockedBetween(senderId, targetUserId)
  if (blocked) return

  const senderRef = db.collection('users').doc(senderId)
  const senderSnap = await senderRef.get()
  const sender = senderSnap.exists ? senderSnap.data() : {}

  const displayName = senderName || sender.name || 'Someone'

  await send(targetUserId, {
    title: 'Friend request accepted',
    body: `${displayName} (@${senderUsername || '…'}) accepted your friend request`,
    data: {
      kind: 'friend_request_accepted',
      senderId,
    },
  })
}
