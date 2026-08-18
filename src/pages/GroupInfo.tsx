import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Crown,
  LogOut,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useGroup } from '@/hooks/useGroup'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import {
  updateGroupName,
  updateGroupPhoto,
  addMembers,
  removeMember,
  leaveGroup,
  promoteToAdmin,
  demoteAdmin,
  deleteGroup,
  isAdmin as checkIsAdmin,
} from '@/services/groups'
import { searchUsersByUsername, getUserProfile } from '@/services/users'
import { validateChatImage } from '@/services/chatMedia'
import { GROUP_MAX_MEMBERS, type UserProfile } from '@/types'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

function MemberRow({
  member,
  isMe,
  isCreator,
  isMemberAdmin,
  callerIsAdmin,
  onRemove,
  onPromote,
  onDemote,
}: {
  member: UserProfile
  isMe: boolean
  isCreator: boolean
  isMemberAdmin: boolean
  callerIsAdmin: boolean
  onRemove: () => void
  onPromote: () => void
  onDemote: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative">
        <Avatar
          name={member.name}
          photoURL={member.photoURL}
          size="sm"
          online={member.online}
        />
        {isMemberAdmin && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400">
            <Crown className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
          {member.name}
          {isMe && <span className="ml-1 text-xs text-slate-400">(You)</span>}
        </p>
        <p className="truncate text-xs text-slate-400">@{member.username}</p>
      </div>
      {callerIsAdmin && !isMe && !isCreator && (
        <div className="flex items-center gap-1">
          {!isMemberAdmin ? (
            <button
              onClick={onPromote}
              className="rounded-lg p-1.5 text-amber-500 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10"
              title="Make admin"
            >
              <Shield className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onDemote}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Remove admin"
            >
              <Shield className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10"
            title="Remove from group"
          >
            <UserMinus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function GroupInfo() {
  const navigate = useNavigate()
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()
  const me = user?.uid ?? ''

  const { group, loading: groupLoading } = useGroup(groupId ?? '')
  const [memberProfiles, setMemberProfiles] = useState<UserProfile[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  // Edit states
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Add member states
  const [showAddMember, setShowAddMember] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [addResults, setAddResults] = useState<UserProfile[]>([])

  const amAdmin = group ? checkIsAdmin(group, me) : false
  const amCreator = group?.createdBy === me

  // Fetch member profiles
  useEffect(() => {
    if (!group?.members) {
      setLoadingMembers(false)
      return
    }
    let active = true
    Promise.all(
      group.members.map((id) => getUserProfile(id)),
    ).then((profiles) => {
      if (active) {
        setMemberProfiles(profiles.filter(Boolean) as UserProfile[])
        setLoadingMembers(false)
      }
    }).catch(() => {
      if (active) setLoadingMembers(false)
    })
    return () => { active = false }
  }, [group?.members])

  async function handleSaveName() {
    if (!groupId || !newName.trim()) return
    try {
      await updateGroupName(groupId, newName.trim())
      setEditingName(false)
      showToast('Group name updated.', 'success')
    } catch {
      showToast('Failed to update name.', 'error')
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !groupId) return
    const err = validateChatImage(file)
    if (err) {
      showToast(err, 'error')
      return
    }
    try {
      const storage = getStorage()
      const path = `group-photos/${groupId}_${Date.now()}.webp`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file, { contentType: 'image/webp' })
      const url = await getDownloadURL(storageRef)
      await updateGroupPhoto(groupId, url)
      showToast('Photo updated.', 'success')
    } catch {
      showToast('Failed to update photo.', 'error')
    }
  }

  async function handleAddMember(uid: string) {
    if (!groupId) return
    try {
      await addMembers(groupId, [uid])
      setShowAddMember(false)
      setAddQuery('')
      setAddResults([])
      showToast('Member added.', 'success')
    } catch {
      showToast('Failed to add member.', 'error')
    }
  }

  async function handleRemoveMember(uid: string) {
    if (!groupId) return
    try {
      await removeMember(groupId, me, uid)
      showToast('Member removed.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove member.', 'error')
    }
  }

  async function handleLeave() {
    if (!groupId) return
    try {
      await leaveGroup(groupId, me)
      navigate('/chats', { replace: true })
      showToast('Left the group.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to leave group.', 'error')
    }
  }

  async function handleDelete() {
    if (!groupId) return
    try {
      await deleteGroup(groupId)
      navigate('/chats', { replace: true })
      showToast('Group deleted.', 'success')
    } catch {
      showToast('Failed to delete group.', 'error')
    }
  }

  async function handleSearchAdd(q: string) {
    if (!q.trim()) {
      setAddResults([])
      return
    }
    try {
      const found = await searchUsersByUsername(q)
      const inGroup = new Set(group?.members ?? [])
      setAddResults(
        found.filter((u) => !inGroup.has(u.uid) && u.uid !== me && !u.banned),
      )
    } catch {
      showToast('Search failed.', 'error')
    }
  }

  if (groupLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-slate-400">Group not found.</p>
      </div>
    )
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
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Group Info</h1>
      </header>

      {/* Group photo + name */}
      <section className="border-b border-slate-200 px-4 py-5 dark:border-slate-800">
        <div className="flex flex-col items-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => amAdmin && photoInputRef.current?.click()}
              className={`flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 ${
                amAdmin ? 'hover:bg-slate-200 dark:hover:bg-slate-700' : ''
              } dark:bg-slate-800`}
              disabled={!amAdmin}
            >
              {group.groupPhotoURL ? (
                <img src={group.groupPhotoURL} alt="" className="h-24 w-24 rounded-full object-cover" />
              ) : (
                <Users className="h-10 w-10 text-slate-400" />
              )}
            </button>
            {amAdmin && (
              <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white">
                <Camera className="h-3.5 w-3.5" />
              </span>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>

          <div className="mt-3 text-center">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                  className="text-center"
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveName}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{group.groupName}</h2>
                {amAdmin && (
                  <button
                    onClick={() => { setNewName(group.groupName ?? ''); setEditingName(true) }}
                    className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-sm text-slate-400">{group.members.length} members</p>
          </div>
        </div>
      </section>

      {/* Add members */}
      {amAdmin && group.members.length < GROUP_MAX_MEMBERS && (
        <section className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <button
            onClick={() => setShowAddMember(!showAddMember)}
            className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" />
            Add Members
          </button>
          {showAddMember && (
            <div className="mt-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  type="text"
                  value={addQuery}
                  onChange={(e) => {
                    setAddQuery(e.target.value)
                    void handleSearchAdd(e.target.value)
                  }}
                  placeholder="Search by username..."
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </div>
              {addResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {addResults.slice(0, 5).map((u) => (
                    <button
                      key={u.uid}
                      onClick={() => handleAddMember(u.uid)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <Avatar name={u.name} photoURL={u.photoURL} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{u.name}</p>
                        <p className="truncate text-xs text-slate-400">@{u.username}</p>
                      </div>
                      <Plus className="h-4 w-4 text-indigo-600" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Members list */}
      <section className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Members ({group.members.length})
          </h3>
        </div>
        {loadingMembers ? (
          <div className="space-y-2 px-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl p-2">
                <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {memberProfiles.map((m) => (
              <MemberRow
                key={m.uid}
                member={m}
                isMe={m.uid === me}
                isCreator={m.uid === group.createdBy}
                isMemberAdmin={(group.admins ?? []).includes(m.uid)}
                callerIsAdmin={amAdmin}
                onRemove={() => handleRemoveMember(m.uid)}
                onPromote={() => promoteToAdmin(groupId!, m.uid).then(() => showToast('Promoted to admin.', 'success'))}
                onDemote={() => demoteAdmin(groupId!, m.uid).then(() => showToast('Admin removed.', 'success'))}
              />
            ))}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
        {!amCreator ? (
          <Button variant="danger" onClick={handleLeave} className="w-full">
            <LogOut className="h-4 w-4" />
            Leave Group
          </Button>
        ) : (
          <Button variant="danger" onClick={handleDelete} className="w-full">
            <Trash2 className="h-4 w-4" />
            Delete Group
          </Button>
        )}
      </div>
    </div>
  )
}
