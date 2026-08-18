import { useState } from 'react'
import { Megaphone, Trash2, Send, Search, Ban, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import { createAnnouncement, deleteAnnouncement } from '@/services/announcements'
import { sendAnnouncementNotification } from '@/services/notifications'
import { searchUsersByUsername } from '@/services/users'
import { banUser, unbanUser, getBannedUsers } from '@/services/bans'
import { Button } from '@/components/common/Button'
import { Input, Textarea } from '@/components/common/Input'
import { useToast } from '@/hooks/useToast'
import { formatTime } from '@/utils/time'
import { debounce } from '@/utils/time'
import { useRef, useEffect } from 'react'
import type { UserProfile } from '@/types'

export default function Admin() {
  const { user } = useAuth()
  const { profile } = useCurrentUserProfile(user?.uid)
  const { announcements, loading } = useAnnouncements()
  const { showToast } = useToast()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Ban management state
  const [banQuery, setBanQuery] = useState('')
  const [banResults, setBanResults] = useState<UserProfile[]>([])
  const [bannedUsers, setBannedUsers] = useState<{ uid: string; name: string; username: string; email: string }[]>([])
  const [loadingBanned, setLoadingBanned] = useState(true)
  const [busyBanUid, setBusyBanUid] = useState<string | null>(null)

  // Load banned users on mount
  useEffect(() => {
    void loadBannedUsers()
  }, [])

  async function loadBannedUsers() {
    setLoadingBanned(true)
    try {
      const list = await getBannedUsers()
      setBannedUsers(list)
    } catch {
      // ignore
    } finally {
      setLoadingBanned(false)
    }
  }

  const runBanSearch = useRef(
    debounce(async (q: string) => {
      if (!q.trim()) {
        setBanResults([])
        return
      }
      try {
        const found = await searchUsersByUsername(q)
        setBanResults(found.filter((u) => u.uid !== user?.uid))
      } catch {
        showToast('Search failed.', 'error')
      }
    }, 400),
  )

  useEffect(() => {
    void runBanSearch.current(banQuery)
  }, [banQuery, runBanSearch])

  async function handleBan(uid: string) {
    setBusyBanUid(uid)
    try {
      await banUser(uid)
      showToast('User banned.', 'success')
      setBanResults((prev) => prev.filter((u) => u.uid !== uid))
      await loadBannedUsers()
    } catch {
      showToast('Could not ban user.', 'error')
    } finally {
      setBusyBanUid(null)
    }
  }

  async function handleUnban(uid: string) {
    setBusyBanUid(uid)
    try {
      await unbanUser(uid)
      showToast('User unbanned.', 'success')
      await loadBannedUsers()
    } catch {
      showToast('Could not unban user.', 'error')
    } finally {
      setBusyBanUid(null)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()

    if (!trimmedTitle) {
      showToast('Title is required.', 'error')
      return
    }
    if (!trimmedBody) {
      showToast('Message body is required.', 'error')
      return
    }
    if (trimmedTitle.length > 200) {
      showToast('Title must be 200 characters or less.', 'error')
      return
    }
    if (trimmedBody.length > 5000) {
      showToast('Message must be 5000 characters or less.', 'error')
      return
    }

    setSending(true)
    try {
      await createAnnouncement({
        title: trimmedTitle,
        body: trimmedBody,
        senderId: user!.uid,
        senderName: profile?.name ?? 'Admin',
      })

      // Fire-and-forget push notification to all users
      void sendAnnouncementNotification({
        title: trimmedTitle,
        body: trimmedBody,
        senderName: profile?.name ?? 'Admin',
      })

      setTitle('')
      setBody('')
      showToast('Announcement sent to all users.', 'success')
    } catch {
      showToast('Failed to send announcement.', 'error')
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteAnnouncement(id)
      showToast('Announcement deleted.', 'success')
    } catch {
      showToast('Failed to delete announcement.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:px-6">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin — Announcements</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Send a public message that reaches every user in real time.
        </p>
      </header>

      {/* Composer */}
      <section className="border-b border-slate-200 px-4 py-5 dark:border-slate-800 lg:px-6">
        <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
          <Input
            label="Title"
            placeholder="Announcement title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <Textarea
            label="Message"
            placeholder="Write your announcement…"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {body.length}/5000
            </span>
            <Button type="submit" size="sm" loading={sending} disabled={!title.trim() || !body.trim()}>
              <Send className="h-4 w-4" aria-hidden />
              Send to all users
            </Button>
          </div>
        </form>
      </section>

      {/* Ban Users */}
      <section className="border-b border-slate-200 px-4 py-5 dark:border-slate-800 lg:px-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Ban Users
        </h2>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            type="text"
            value={banQuery}
            onChange={(e) => setBanQuery(e.target.value)}
            placeholder="Search @username to ban…"
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </div>

        {/* Search results */}
        {banResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {banResults.map((u) => (
              <div key={u.uid} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-white">{u.name}</p>
                  <p className="truncate text-xs text-slate-400">@{u.username}</p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busyBanUid === u.uid}
                  onClick={() => void handleBan(u.uid)}
                >
                  <Ban className="h-3.5 w-3.5" /> Ban
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Banned users list */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Banned users ({bannedUsers.length})
          </p>
          {loadingBanned ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : bannedUsers.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
              No banned users.
            </p>
          ) : (
            <div className="space-y-2">
              {bannedUsers.map((u) => (
                <div key={u.uid} className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{u.name}</p>
                    <p className="truncate text-xs text-slate-400">@{u.username} · {u.email}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyBanUid === u.uid}
                    onClick={() => void handleUnban(u.uid)}
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Unban
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Past announcements */}
      <section className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Sent announcements
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : announcements.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            No announcements sent yet.
          </p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                      {a.body}
                    </p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      Sent by {a.senderName} · {formatTime(a.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 disabled:opacity-50"
                    aria-label="Delete announcement"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
