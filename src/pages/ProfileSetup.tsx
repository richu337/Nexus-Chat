import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, UserRound } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { Input, Textarea } from '@/components/common/Input'
import { Avatar } from '@/components/common/Avatar'
import { createProfile, isUsernameAvailable } from '@/services/users'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { validateUsername, validateName, validateBio, normalizeUsername } from '@/utils/validators'
import { uploadProfilePicture, validateAvatar } from '@/firebase/storage'

export default function ProfileSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [photoURL, setPhotoURL] = useState<string | null>(user?.photoURL ?? null)
  const [errors, setErrors] = useState<{ name?: string; username?: string; bio?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  if (!user) return null

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!user) return
    const err = validateAvatar(file)
    if (err) {
      showToast(err, 'error')
      return
    }
    setUploading(true)
    try {
      const url = await uploadProfilePicture(user.uid, file)
      setPhotoURL(url)
    } catch {
      showToast('Could not upload profile picture. Try again.', 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nameErr = validateName(name)
    const usernameErr = validateUsername(username)
    const bioErr = validateBio(bio)
    setErrors({ name: nameErr ?? undefined, username: usernameErr ?? undefined, bio: bioErr ?? undefined })
    if (nameErr || usernameErr || bioErr) return

    const normalized = normalizeUsername(username)

    setSubmitting(true)
    try {
      const available = await isUsernameAvailable(normalized)
      if (!available) {
        setErrors({ username: 'This username is already taken.' })
        return
      }
      await createProfile({
        name,
        username: normalized,
        bio,
        photoURL,
      })
      showToast('Profile created. Welcome to Nexus Chat!', 'success')
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof Error && err.message === 'username-taken') {
        setErrors({ username: 'This username is already taken.' })
      } else {
        showToast('Could not create your profile. Please try again.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Create your profile</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose a unique username to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="group relative"
              aria-label="Upload profile picture"
            >
              <Avatar name={name || '?'} photoURL={photoURL} size="xl" />
              <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg group-hover:bg-indigo-500">
                {uploading ? (
                  <Check className="h-4 w-4 animate-pulse" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {uploading ? 'Uploading…' : 'Add profile picture'}
            </button>
          </div>

          <Input
            id="setup-name"
            label="Display name"
            placeholder="Rayhan Jaleel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />

          <div>
            <Input
              id="setup-username"
              label="Username"
              placeholder="rayhan"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              error={errors.username}
            />
            {!errors.username && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                {username ? `nexus.chat/@${username}` : 'Letters, numbers and underscores'}
              </p>
            )}
          </div>

          <Textarea
            id="setup-bio"
            label="Bio (optional)"
            placeholder="Say something about yourself…"
            rows={3}
            maxLength={160}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            error={errors.bio}
          />

          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            <UserRound className="h-4 w-4" aria-hidden />
            Continue
          </Button>
        </form>
      </div>
    </div>
  )
}
