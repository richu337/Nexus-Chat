import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { app } from './config'

export const storage = getStorage(app)

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function validateAvatar(file: File): string | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return 'Profile pictures must be a JPEG, PNG, WebP or GIF image.'
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Profile pictures must be smaller than 5 MB.'
  }
  return null
}

/**
 * Compresses an image file down to a reasonable avatar size (256x256) to keep
 * storage light and profile loads fast. Falls back to the original blob if the
 * browser cannot process the image.
 */
export async function compressAvatar(file: File, maxDim = 256): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    )
    if (!blob) return file
    return blob
  } catch {
    return file
  }
}

export async function uploadProfilePicture(uid: string, file: File): Promise<string> {
  const blob = await compressAvatar(file)
  const path = `profile-pictures/${uid}/avatar_${Date.now()}.webp`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, blob, { contentType: 'image/webp' })
  return getDownloadURL(storageRef)
}

/**
 * Deletes a stored profile picture from a Firebase Storage download URL.
 * Extracts the object path from the URL so callers can pass photoURL directly.
 */
export async function deleteProfilePicture(photoURL: string): Promise<void> {
  try {
    const url = new URL(photoURL)
    const path = decodeURIComponent(url.pathname.split('/o/')[1] ?? '')
    if (!path) return
    const storageRef = ref(storage, path)
    await deleteObject(storageRef)
  } catch {
    // Best-effort cleanup; the object may already be gone or off-path.
  }
}
