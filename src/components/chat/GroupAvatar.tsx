import { useMemo } from 'react'

const PALETTE = [
  'bg-indigo-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-fuchsia-500',
]

function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const SIZE_MAP = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
} as const

interface GroupAvatarProps {
  groupPhotoURL?: string | null
  groupName?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function GroupAvatar({
  groupPhotoURL,
  groupName,
  size = 'md',
  className = '',
}: GroupAvatarProps) {
  const displayName = groupName || 'Group'
  const color = useMemo(() => colorFor(displayName), [displayName])

  return (
    <div className={`relative shrink-0 ${className}`}>
      {groupPhotoURL ? (
        <img
          src={groupPhotoURL}
          alt={displayName}
          loading="lazy"
          className={`${SIZE_MAP[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${SIZE_MAP[size]} ${color} flex items-center justify-center rounded-full font-semibold text-white`}
          aria-hidden
        >
          {initials(displayName)}
        </div>
      )}
    </div>
  )
}
