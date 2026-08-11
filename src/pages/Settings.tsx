import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Moon,
  Sun,
  Monitor,
  LogOut,
  Trash2,
  Camera,
  UserRound,
  KeyRound,
  Bell,
  Shield,
  Mail,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { useTheme } from '@/components/theme/ThemeProvider'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/common/Button'
import { Input, Textarea } from '@/components/common/Input'
import { logout, changeUserEmail } from '@/firebase/auth'
import { updateProfile, updateUserSettings } from '@/services/users'
import { uploadProfilePicture, validateAvatar } from '@/firebase/storage'
import { stopPresence } from '@/services/presence'
import { deleteAccount } from '@/services/accountDeletion'
import {
  validateName,
  validateBio,
  validateUsername,
  validateEmail,
  normalizeUsername,
} from '@/utils/validators'
import { isUsernameAvailable } from '@/services/users'
import { isNativePlatform } from '@/utils/platform'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-4 py-5 dark:border-slate-800 lg:px-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { theme, setTheme } = useTheme()
  const { profile, refresh } = useCurrentUserProfile(user?.uid)
  const fileInput = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [photoURL, setPhotoURL] = useState<string | null>(profile?.photoURL ?? null)
  const [editErrors, setEditErrors] = useState<{ name?: string; username?: string; bio?: string }>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [email, setEmail] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')

  const settings = profile?.settings

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nameErr = validateName(name)
    const usernameErr = validateUsername(username)
    const bioErr = validateBio(bio)
    setEditErrors({ name: nameErr ?? undefined, username: usernameErr ?? undefined, bio: bioErr ?? undefined })
    if (nameErr || usernameErr || bioErr) return

    setSaving(true)
    try {
      const newLower = normalizeUsername(username)
      if (newLower !== profile?.usernameLowercase) {
        const available = await isUsernameAvailable(newLower)
        if (!available) {
          setEditErrors({ username: 'This username is already taken.' })
          return
        }
      }
      await updateProfile(user!.uid, { name: name.trim(), username: newLower, bio: bio.trim() || null, photoURL })
      await refresh()
      setEditing(false)
      showToast('Profile updated.', 'success')
    } catch (err) {
      if (err instanceof Error && err.message === 'username-taken') {
        setEditErrors({ username: 'This username is already taken.' })
      } else {
        showToast('Could not update profile.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateAvatar(file)
    if (err) {
      showToast(err, 'error')
      return
    }
    setUploading(true)
    try {
      const url = await uploadProfilePicture(user!.uid, file)
      setPhotoURL(url)
      await updateProfile(user!.uid, { photoURL: url })
      await refresh()
      showToast('Profile picture updated.', 'success')
    } catch {
      showToast('Could not upload picture.', 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleLogout() {
    try {
      stopPresence()
      await logout()
      navigate('/login', { replace: true })
    } catch {
      showToast('Could not log out.', 'error')
    }
  }

  async function handleChangeEmail() {
    if (!validateEmail(email)) {
      showToast('Enter a valid email address.', 'error')
      return
    }
    try {
      await changeUserEmail(user!, email.trim())
      showToast('Email updated.', 'success')
      setEmail('')
    } catch {
      showToast('Could not update email. You may need to re-authenticate.', 'error')
    }
  }

  async function handleChangePassword() {
    // Requires a fresh login; use the reset email flow instead for reliability.
    showToast('Use "Forgot password" on the login screen to reset your password.', 'info')
  }

  async function handleDeleteAccount() {
    if (confirmDelete.trim().toLowerCase() !== 'delete') {
      showToast('Type "delete" to confirm.', 'error')
      return
    }
    try {
      await deleteAccount(user!.uid)
      stopPresence()
      showToast('Your account has been deleted.', 'success')
      // After auth account removal, the auth state listener redirects to login.
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not delete account. Please try again.',
        'error',
      )
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
      </header>

      {/* Account */}
      <Section title="Account">
        {!editing ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInput.current?.click()}
              className="group relative"
              aria-label="Change profile picture"
              disabled={uploading}
            >
              <Avatar name={profile?.name ?? user?.displayName ?? 'You'} photoURL={profile?.photoURL} size="lg" />
              <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white opacity-0 shadow group-hover:opacity-100">
                {uploading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Camera className="h-3.5 w-3.5" />}
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFile}
            />
            <div className="flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {profile?.name ?? user?.displayName ?? 'You'}
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                @{profile?.username ?? '…'}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        ) : (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} error={editErrors.name} />
            <div>
              <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} error={editErrors.username} />
              {!editErrors.username && (
                <p className="mt-1.5 text-xs text-slate-400">nexus.chat/@{username}</p>
              )}
            </div>
            <Textarea label="Bio" rows={3} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} error={editErrors.bio} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>
                <UserRound className="h-4 w-4" aria-hidden /> Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Section>

      {/* Security */}
      <Section title="Security">
        <div className="space-y-3">
          <div>
            <Row icon={<Mail className="h-5 w-5" aria-hidden />} label="Email address">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {profile?.email ?? user?.email ?? ''}
              </span>
            </Row>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="New email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="max-w-xs"
              />
              <Button variant="secondary" size="sm" onClick={() => void handleChangeEmail()}>
                Update
              </Button>
            </div>
          </div>
          <Row icon={<KeyRound className="h-5 w-5" aria-hidden />} label="Password">
            <Button variant="secondary" size="sm" onClick={() => void handleChangePassword()}>
              Reset
            </Button>
          </Row>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Row icon={<Bell className="h-5 w-5" aria-hidden />} label="Message notifications">
          <Toggle
            checked={settings?.messageNotifications ?? true}
            onChange={(v) => {
              void updateUserSettings(user!.uid, { messageNotifications: v }).then(() => refresh())
            }}
          />
        </Row>
        <Row icon={<Bell className="h-5 w-5" aria-hidden />} label="Friend request notifications">
          <Toggle
            checked={settings?.friendRequestNotifications ?? true}
            onChange={(v) => {
              void updateUserSettings(user!.uid, { friendRequestNotifications: v }).then(() => refresh())
            }}
          />
        </Row>
      </Section>

      {/* Privacy */}
      <Section title="Privacy">
        <Row icon={<Shield className="h-5 w-5" aria-hidden />} label="Show online status">
          <Toggle
            checked={settings?.showOnlineStatus ?? true}
            onChange={(v) => {
              void updateUserSettings(user!.uid, { showOnlineStatus: v }).then(() => refresh())
            }}
          />
        </Row>
        <Row icon={<Shield className="h-5 w-5" aria-hidden />} label="Show last seen">
          <Toggle
            checked={settings?.showLastSeen ?? true}
            onChange={(v) => {
              void updateUserSettings(user!.uid, { showLastSeen: v }).then(() => refresh())
            }}
          />
        </Row>
        <Row icon={<Shield className="h-5 w-5" aria-hidden />} label="Profile discoverability">
          <Toggle
            checked={settings?.profileDiscoverable ?? true}
            onChange={(v) => {
              void updateUserSettings(user!.uid, { profileDiscoverable: v }).then(() => refresh())
            }}
          />
        </Row>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <div className="flex gap-2">
          {(
            [
              { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
              { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
              { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                theme === opt.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Device */}
      <Section title="Device">
        <Row icon={<Monitor className="h-5 w-5" aria-hidden />} label="Platform">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {isNativePlatform() ? 'Android' : 'Web'}
          </span>
        </Row>
      </Section>

      {/* Danger zone */}
      <Section title="Account">
        <div className="space-y-3">
          <Button variant="secondary" size="md" onClick={() => void handleLogout()}>
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </Button>

          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">Delete account</p>
            <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-300/80">
              This permanently deletes your profile, friends, requests and conversations. This cannot be undone.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="text"
                placeholder='Type "delete" to confirm'
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleDeleteAccount()}
                disabled={confirmDelete.trim().toLowerCase() !== 'delete'}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete account
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
