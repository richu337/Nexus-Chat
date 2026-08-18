import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'

const CHAT_IMAGE_MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const CHAT_IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

export function validateChatImage(file: File): string | null {
  if (!CHAT_IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return 'Images must be JPEG, PNG, WebP or GIF.'
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return 'Images must be smaller than 25 MB.'
  }
  return null
}

/**
 * Returns the natural width and height of an image file.
 */
export function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image.'))
    }
    img.src = url
  })
}

/**
 * Compresses an image for chat delivery. Resizes to max 1200px on the
 * longest side and compresses to WebP at 80% quality.
 */
export async function compressChatImage(
  file: File,
  maxDim = 1200,
): Promise<Blob> {
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
      canvas.toBlob(resolve, 'image/webp', 0.8),
    )
    return blob ?? file
  } catch {
    return file
  }
}

/**
 * Uploads a chat image to Firebase Storage under the conversation's media folder.
 * Returns the download URL, original dimensions, and storage path.
 */
export async function uploadChatImage(
  conversationId: string,
  file: File,
): Promise<{ url: string; width: number; height: number; path: string }> {
  const dims = await getImageDimensions(file)
  const blob = await compressChatImage(file)
  const path = `chat-media/${conversationId}/img_${Date.now()}.webp`
  const storage = getStorage()
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, blob, { contentType: 'image/webp' })
  const url = await getDownloadURL(storageRef)
  return { url, width: dims.width, height: dims.height, path }
}

/**
 * Deletes a chat image from Firebase Storage given its download URL.
 */
export async function deleteChatImage(url: string): Promise<void> {
  try {
    const parsed = new URL(url)
    const path = decodeURIComponent(parsed.pathname.split('/o/')[1] ?? '')
    if (!path) return
    const storage = getStorage()
    const storageRef = ref(storage, path)
    await deleteObject(storageRef)
  } catch {
    // Best-effort cleanup
  }
}
