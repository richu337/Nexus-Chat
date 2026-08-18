import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { validateChatImage, getImageDimensions } from '@/services/chatMedia'

interface ImagePickerProps {
  onImageSelected: (file: File, preview: string, width: number, height: number) => void
  disabled?: boolean
}

export function ImagePicker({ onImageSelected, disabled }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateChatImage(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    try {
      const dims = await getImageDimensions(file)
      const preview = URL.createObjectURL(file)
      onImageSelected(file, preview, dims.width, dims.height)
    } catch {
      setError('Failed to read image.')
    }

    // Reset input so the same file can be selected again
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleChange}
        className="hidden"
        aria-label="Pick an image"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 disabled:opacity-50"
        aria-label="Send image"
      >
        <ImagePlus className="h-5 w-5" />
      </button>
      {error && (
        <p className="mt-1 text-xs text-rose-500">{error}</p>
      )}
    </div>
  )
}

interface ImagePreviewBarProps {
  preview: string
  onCancel: () => void
}

export function ImagePreviewBar({ preview, onCancel }: ImagePreviewBarProps) {
  return (
    <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
      <img
        src={preview}
        alt="Preview"
        className="h-16 w-16 rounded-lg object-cover"
      />
      <p className="flex-1 text-sm text-slate-600 dark:text-slate-300">Image ready to send</p>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        aria-label="Cancel image"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
