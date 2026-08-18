import { useState } from 'react'

interface ImageMessageProps {
  src: string
  alt?: string
  width?: number | null
  height?: number | null
}

export function ImageMessage({ src, alt = 'Image', width, height }: ImageMessageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  // Calculate display dimensions with max constraints
  const maxWidth = 280
  const maxHeight = 320
  const w = width ?? maxWidth
  const h = height ?? maxHeight
  const scale = Math.min(1, maxWidth / w, maxHeight / h)
  const displayW = Math.round(w * scale)
  const displayH = Math.round(h * scale)

  if (error) {
    return (
      <div className="flex h-24 w-48 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
        <p className="text-xs text-slate-400">Failed to load image</p>
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: displayW, height: displayH }}>
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700"
          style={{ width: displayW, height: displayH }}
        />
      )}
      <img
        src={src}
        alt={alt}
        width={displayW}
        height={displayH}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`rounded-lg object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ width: displayW, height: displayH }}
      />
    </div>
  )
}
