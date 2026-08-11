export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/
export const NAME_MAX = 50
export const BIO_MAX = 160
export const MESSAGE_MAX = 4000

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function validateUsername(username: string): string | null {
  const u = username.trim()
  if (u.length === 0) return 'Username is required.'
  if (u.length < USERNAME_MIN) {
    return `Username must be at least ${USERNAME_MIN} characters.`
  }
  if (u.length > USERNAME_MAX) {
    return `Username must be at most ${USERNAME_MAX} characters.`
  }
  if (!USERNAME_REGEX.test(u)) {
    return 'Username may only contain letters, numbers and underscores.'
  }
  return null
}

export function validateName(name: string): string | null {
  const n = name.trim()
  if (n.length === 0) return 'Display name is required.'
  if (n.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters.`
  return null
}

export function validateBio(bio: string): string | null {
  const b = bio.trim()
  if (b.length > BIO_MAX) return `Bio must be at most ${BIO_MAX} characters.`
  return null
}

export function validateEmail(email: string): string | null {
  const e = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Enter a valid email address.'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'Password must be at least 6 characters.'
  return null
}

export function validateMessage(text: string): string | null {
  const t = text.trim()
  if (t.length === 0) return 'Message cannot be empty.'
  if (t.length > MESSAGE_MAX) return `Message is too long (max ${MESSAGE_MAX} characters).`
  return null
}
