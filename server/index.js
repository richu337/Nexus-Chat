import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import admin from 'firebase-admin'
import {
  addDevice,
  removeDevice,
  sendMessageNotification,
  sendFriendRequestNotification,
  sendFriendRequestAcceptedNotification,
  broadcastAnnouncement,
} from './services.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// ── Static update bundles (OTA) ─────────────────────────────────────────────
// Serve the `server/bundles/` folder so the app can fetch latest.json and
// dist.zip for over-the-air updates. Created by `npm run release`.
app.use('/update', express.static(path.join(__dirname, 'bundles'), { maxAge: '1h' }))

// ── Firebase Admin init ────────────────────────────────────────────────────
let projectId = process.env.FIREBASE_PROJECT_ID

if (admin.apps.length === 0) {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

  let credential
  if (inline) {
    credential = admin.credential.cert(JSON.parse(inline))
    projectId = projectId || JSON.parse(inline).project_id
  } else if (credPath) {
    credential = admin.credential.cert(credPath)
  } else {
    // Last resort: default credentials (GCLOUD env / metadata server).
    credential = admin.credential.applicationDefault()
  }

  admin.initializeApp({
    credential,
    projectId,
  })
}

// ── Middleware: verify Firebase ID token ───────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' })
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

async function requireAdmin(req, res, next) {
  const db = admin.firestore()
  const userSnap = await db.collection('users').doc(req.user.uid).get()
  if (!userSnap.exists || userSnap.data().role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' })
  }
  next()
}

// ── Routes ─────────────────────────────────────────────────────────────────

// Register this device for push notifications.
app.post('/api/devices', requireAuth, async (req, res) => {
  const { fcmToken, platform } = req.body ?? {}
  if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.length < 20) {
    return res.status(400).json({ error: 'fcmToken is required.' })
  }
  if (platform !== 'web' && platform !== 'android') {
    return res.status(400).json({ error: 'platform must be web or android.' })
  }

  try {
    await addDevice(req.user.uid, fcmToken, platform)
    return res.json({ ok: true })
  } catch (err) {
    console.error('[devices]', err)
    return res.status(500).json({ error: 'Could not register device.' })
  }
})

// Unregister a device token.
app.delete('/api/devices', requireAuth, async (req, res) => {
  const { fcmToken } = req.body ?? {}
  if (!fcmToken) return res.status(400).json({ error: 'fcmToken is required.' })

  try {
    await removeDevice(req.user.uid, fcmToken)
    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Could not unregister device.' })
  }
})

// Send a push notification to another user. The relay verifies friendship and
// block status server-side before sending, so clients cannot spoof messages.
app.post('/api/notify', requireAuth, async (req, res) => {
  const {
    kind,
    targetUserId,
    text,
    conversationId,
    senderName,
    senderUsername,
  } = req.body ?? {}

  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: 'targetUserId is required.' })
  }

  const senderId = req.user.uid

  try {
    if (kind === 'message') {
      if (!conversationId || typeof conversationId !== 'string') {
        return res.status(400).json({ error: 'conversationId is required for message notifications.' })
      }
      await sendMessageNotification({
        senderId,
        senderName,
        senderUsername,
        targetUserId,
        text: text ?? '',
        conversationId,
      })
    } else if (kind === 'friend_request') {
      await sendFriendRequestNotification({
        senderId,
        senderName,
        senderUsername,
        targetUserId,
      })
    } else if (kind === 'friend_request_accepted') {
      await sendFriendRequestAcceptedNotification({
        senderId,
        senderName,
        senderUsername,
        targetUserId,
      })
    } else {
      return res.status(400).json({ error: 'kind must be message, friend_request or friend_request_accepted.' })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('[notify]', err)
    return res.status(500).json({ error: 'Could not send notification.' })
  }
})

// Broadcast an announcement to all users via FCM. Admin-only.
app.post('/api/announce', requireAuth, requireAdmin, async (req, res) => {
  const { title, body, senderName } = req.body ?? {}

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'title is required.' })
  }
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'body is required.' })
  }

  try {
    await broadcastAnnouncement({
      title: title.trim(),
      body: body.trim(),
      senderName: senderName || 'Admin',
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[announce]', err)
    return res.status(500).json({ error: 'Could not broadcast announcement.' })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Nexus Chat notification relay listening on :${port}`)
})
