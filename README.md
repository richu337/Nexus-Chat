# Nexus Chat

A modern, real-time messaging application for **web** and **Android**, built with
React + TypeScript + Vite + Tailwind CSS + Capacitor + Firebase.

Nexus Chat is a production-oriented MVP covering the complete core messaging
experience:

```
Open app → Login (Google / email) → Create profile (@username) →
Search friend → Send request → Friend accepts → Friends list →
Press Message → Conversation created → Real-time text chat →
Read receipts → Push notifications
```

> **Priority:** Correctness → Security → Real-time → Good UX → Performance → Advanced features.

---

## Stack

| Layer         | Technology                                            |
| ------------- | ----------------------------------------------------- |
| Frontend      | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide   |
| Mobile        | Capacitor 8 (Android)                                  |
| Auth          | Firebase Authentication (Google + email/password)     |
| Database      | Cloud Firestore (real-time listeners)                 |
| Files         | Firebase Storage (profile pictures)                    |
| Push          | FCM via a small Node/Express relay server              |
| Backend       | Node.js + Express (only for FCM; real-time uses Firestore) |

---

## Getting started

### 1. Prerequisites

- Node.js 20+
- A Firebase project (https://console.firebase.google.com)
- Android Studio (for the Android app)
- Java 17+ (for the Android build)

### 2. Create a Firebase project

1. Create a project in the Firebase console.
2. **Add a Web app** → copy its config values.
3. Enable **Authentication** → sign-in methods: **Email/Password** and **Google**.
4. Enable **Cloud Firestore**, **Firebase Storage**, and **Firebase Cloud Messaging**.
5. Add the **Web push (VAPID) key**: Project settings → Cloud Messaging → *Web push certificates*.

### 3. Configure the frontend

```bash
cp .env.example .env
```

Fill in every `VITE_FIREBASE_*` value from the Firebase web-app config, plus
`VITE_FIREBASE_VAPID_KEY`.

### 4. Install & run

```bash
npm install
npm run dev          # web at http://localhost:5173
```

### 5. Deploy Firestore + Storage rules

```bash
npm install -g firebase-tools
firebase login
firebase use <project-id>

# Copy your project id into .firebaserc, then:
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only storage
```

The rules in `firestore.rules`, `firestore.indexes.json`, and `storage.rules`
enforce all access control **server-side** — never rely on the client alone.

---

## Push notifications

Notifications need the relay server because Firebase Cloud Messaging can only be
sent server-side with a service account.

### 1. Configure the relay

```bash
cd server
npm install
cp .env.example .env
```

Create a **service account key**: Firebase Console → Project settings →
Service accounts → *Generate new private key*, save it as
`server/service-account.json`.

### 2. Run the relay

```bash
npm run server
```

### 3. Point the app at it

```dotenv
VITE_NOTIFICATION_RELAY_URL=http://localhost:3000
```

Notifications are **best-effort** — if the relay is offline or unconfigured,
the app still works fully in real time over Firestore.

---

## Android build

### 1. Add `google-services.json`

Download `google-services.json` (Project settings → Your apps → Android app,
if none exists, add an Android app) and place it in `android/app/`.

### 2. Build

```bash
npm run android:sync   # build web + sync to Android
npx cap open android   # open Android Studio
```

In Android Studio, run the `app` configuration on an emulator or device.

Android 13+ asks for **notification permission** at first launch; the app
handles denial gracefully (real-time messaging still works).

---

## Features

- **Auth:** Google sign-in, email/password, password reset, error handling.
- **Profile setup:** unique case-insensitive `@username` (reserved via a
  `usernames` collection in a transaction), display name, avatar upload, bio.
- **Discovery:** username search only — no global directory.
- **Friends:** send/accept/reject/cancel requests; friends list; remove friend.
- **Blocks:** block/unblock with server-side enforcement of requests, messages,
  and new conversations.
- **Chats:** deterministic 1:1 conversation IDs (never duplicated), real-time
  messages, paginated history ("load older"), typing indicator, unread badges.
- **Message status:** `Sending → Sent → Delivered → Read` driven by real events.
- **Presence:** online / last-seen with throttled heartbeats and cleanup.
- **Push:** FCM message + friend-request notifications, deep-linking into the
  correct conversation.
- **Settings:** edit profile, change email, theme (light/dark/system),
  notification & privacy toggles, logout, account deletion (full data cleanup).
- **Security:** Firestore + Storage rules enforce ownership, friendship,
  conversation membership, and block checks.

---

## Project structure

```
src/
├── components/
│   ├── auth/          # Login/Signup layout
│   ├── chat/          # (message UI lives in pages/Chat + hooks)
│   ├── common/        # Avatar, Button, Input, Skeleton, EmptyState
│   ├── layout/        # AppShell (sidebar + bottom nav)
│   ├── notifications/ # FCM + Capacitor push wiring
│   └── theme/         # ThemeProvider (light/dark/system)
├── pages/             # Login, Signup, ProfileSetup, Chats, Chat, Friends,
│                      # Requests, Search, UserProfile, Settings
├── firebase/          # config, auth, firestore, storage, messaging
├── services/          # users, friends, conversations, messages, presence,
│                      # typing, notifications, accountDeletion
├── hooks/             # useAuth, usePresence, useUnread, etc.
├── types/             # shared entity types
└── utils/             # validators, time formatting, id helpers
server/                # Node/Express FCM relay
```

---

## Environment variables

| Variable                        | Where      | Purpose                          |
| ------------------------------- | ---------- | -------------------------------- |
| `VITE_FIREBASE_API_KEY`         | frontend   | Firebase web config              |
| `VITE_FIREBASE_AUTH_DOMAIN`     | frontend   | Firebase web config              |
| `VITE_FIREBASE_PROJECT_ID`      | frontend   | Firebase web config              |
| `VITE_FIREBASE_STORAGE_BUCKET`  | frontend   | Firebase web config              |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | frontend | Firebase web config          |
| `VITE_FIREBASE_APP_ID`          | frontend   | Firebase web config              |
| `VITE_FIREBASE_VAPID_KEY`       | frontend   | Web push (FCM)                   |
| `VITE_NOTIFICATION_RELAY_URL`   | frontend   | Optional push relay URL          |
| `FIREBASE_PROJECT_ID`           | server     | Admin SDK project id             |
| `GOOGLE_APPLICATION_CREDENTIALS`| server     | Service account key path         |
| `PORT`                          | server     | Relay port (default 3000)        |

---

## Security model (Firestore rules)

- Users can only read/write their **own** profile.
- Username reservations are owned by the matching `uid`.
- Friend requests can only be created by the sender, not to self/friends, and
  never across a block.
- Conversations/messages are only readable by **members**; message `create`
  requires membership, sender == self, valid text, and no block.
- Typing heartbeats and status updates are restricted to conversation members.
- Storage: profile pictures in `profile-pictures/{uid}/...`, chat media only for
  conversation members, everything else denied.

---

## Future roadmap (not in this MVP)

Groups, image/video/file/voice messages, reactions, replies, editing/deletion,
search, AI assistant (summaries, suggestions, voice-to-text), E2E encryption,
and a Windows desktop app. The service layer is structured so these extend the
existing modules without a rewrite.
