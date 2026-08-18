import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Check, Search, Users, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useFriendships } from '@/hooks/useFriendships'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { createGroup } from '@/services/groups'
import { validateChatImage } from '@/services/chatMedia'
import { GROUP_MAX_MEMBERS, type UserProfile } from '@/types'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

function FriendRow({
  friend,
  selected,
  onToggle,
}: {
  friend: UserProfile
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <Avatar name={friend.name} photoURL={friend.photoURL} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900 dark:text-slate-100">{friend.name}</p>
        <p className="truncate text-xs text-slate-400">@{friend.username}</p>
      </div>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected
            ? 'border-indigo-600 bg-indigo-600 text-white'
            : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </div>
    </button>
  )
}

export default function CreateGroup() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const me = user?.uid ?? ''

  const { friendships } = useFriendships(me)
  const [friendProfiles, setFriendProfiles] = useState<UserProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')
  const [groupPhoto, setGroupPhoto] = useState<File | null>(null)
  const [groupPhotoPreview, setGroupPhotoPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Search within friends
  const [searchQuery, setSearchQuery] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Fetch friend profiles
  useEffect(() => {
    if (friendships.length === 0) {
      setLoadingProfiles(false)
      return
    }
    const friendIds = friendships.map((f) => f.members.find((id) => id !== me) ?? '')
    let active = true
    Promise.all(friendIds.map((id) => import('@/services/users').then((m) => m.getUserProfile(id))))
      .then((profiles) => {
        if (active) {
          setFriendProfiles(profiles.filter(Boolean) as UserProfile[])
          setLoadingProfiles(false)
        }
      })
      .catch(() => {
        if (active) setLoadingProfiles(false)
      })
    return () => { active = false }
  }, [friendships, me])

  const filteredFriends = friendProfiles.filter((f) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return f.name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q)
  })

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) {
        next.delete(uid)
      } else {
        if (next.size >= GROUP_MAX_MEMBERS) {
          showToast(`Maximum ${GROUP_MAX_MEMBERS} members.`, 'error')
          return prev
        }
        next.add(uid)
      }
      return next
    })
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateChatImage(file)
    if (err) {
      showToast(err, 'error')
      return
    }
    setGroupPhoto(file)
    setGroupPhotoPreview(URL.createObjectURL(file))
  }

  async function handleCreate() {
    const trimmed = groupName.trim()
    if (!trimmed) {
      showToast('Please enter a group name.', 'error')
      return
    }
    if (selected.size < 1) {
      showToast('Select at least one friend.', 'error')
      return
    }

    setCreating(true)
    try {
      let photoURL: string | undefined | null = undefined
      if (groupPhoto) {
        const storage = getStorage()
        const path = `group-photos/${Date.now()}.webp`
        const storageRef = ref(storage, path)
        await uploadBytes(storageRef, groupPhoto, { contentType: 'image/webp' })
        photoURL = await getDownloadURL(storageRef)
      }

      const groupId = await createGroup({
        creatorId: me,
        name: trimmed,
        memberIds: Array.from(selected),
        photoURL,
      })
      navigate(`/chat/${groupId}`, { replace: true })
      showToast('Group created!', 'success')
    } catch (err) {
      showToast('Failed to create group.', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">New Group</h1>
          <p className="text-xs text-slate-400">{selected.size} of {GROUP_MAX_MEMBERS} selected</p>
        </div>
      </header>

      {/* Group photo + name */}
      <section className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              aria-label="Add group photo"
            >
              {groupPhotoPreview ? (
                <img src={groupPhotoPreview} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <Camera className="h-7 w-7 text-slate-400" />
              )}
            </button>
            {groupPhotoPreview && (
              <button
                type="button"
                onClick={() => {
                  setGroupPhoto(null)
                  setGroupPhotoPreview(null)
                }}
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <Input
              label="Group Name"
              placeholder="Enter group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>
      </section>

      {/* Friends search */}
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search friends..."
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Friends list */}
      <div className="flex-1 overflow-y-auto">
        {loadingProfiles ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl p-2">
                <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">
              {searchQuery ? 'No friends match your search.' : 'No friends to add.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredFriends.map((f) => (
              <FriendRow
                key={f.uid}
                friend={f}
                selected={selected.has(f.uid)}
                onToggle={() => toggle(f.uid)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create button */}
      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
        <Button
          onClick={handleCreate}
          loading={creating}
          disabled={selected.size < 1 || !groupName.trim()}
          className="w-full"
        >
          Create Group
        </Button>
      </div>
    </div>
  )
}
