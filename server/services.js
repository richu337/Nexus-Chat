import admin from 'firebase-admin'

// Firestore is accessed lazily so this module can be imported before
// admin.initializeApp() has run (ESM imports are hoisted).
let _db = null
function getDb() {
  if (!_db) _db = admin.firestore()
  return _db
}

// ── Device tokens ──────────────────────────────────────────────────────────
// Tokens live under devices/{uid}/{tokenHash} so each user owns their devices.

export async function addDevice(uid, fcmToken, platform) {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(fcmToken).digest('hex')
  const ref = getDb().collection('devices').doc(uid).collection('tokens').doc(hash)
  await ref.set({
    token: fcmToken,
    platform,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

export async function removeDevice(uid, fcmToken) {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(fcmToken).digest('hex')
  const ref = getDb().collection('devices').doc(uid).collection('tokens').doc(hash)
  await ref.delete()
}

async function getDeviceTokens(uid) {
  const snap = await getDb().collection('devices').doc(uid).collection('tokens').get()
  return snap.docs.map((d) => d.data().token).filter(Boolean)
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getBlockId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

async function isBlockedBetween(a, b) {
  const id = await getBlockId(a, b)
  const snap = await getDb().collection('blocks').doc(id).get()
  return snap.exists
}

async function isConversationMember(conversationId, uid) {
  const snap = await getDb().collection('conversations').doc(conversationId).get()
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

  const senderRef = getDb().collection('users').doc(senderId)
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

  const senderRef = getDb().collection('users').doc(senderId)
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

  const senderRef = getDb().collection('users').doc(senderId)
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

// ── Announcement broadcast ──────────────────────────────────────────────────

export async function broadcastAnnouncement({ title, body, senderName }) {
  // Collect all device tokens from all users.
  const devicesSnap = await getDb().collection('devices').get()
  const allTokens = []

  for (const userDoc of devicesSnap.docs) {
    const tokensSnap = await userDoc.ref.collection('tokens').get()
    for (const t of tokensSnap.docs) {
      const token = t.data().token
      if (token) allTokens.push(token)
    }
  }

  if (allTokens.length === 0) return

  // FCM has a 500-token limit per multicast; batch them.
  const BATCH_SIZE = 500
  for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
    const batch = allTokens.slice(i, i + BATCH_SIZE)
    const message = {
      tokens: batch,
      notification: {
        title: `📢 ${senderName || 'Admin'}`,
        body: `${title}\n\n${body}`,
      },
      data: { kind: 'announcement' },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    }

    await admin.messaging().sendEachForMulticast(message).catch(() => {})
  }
}

