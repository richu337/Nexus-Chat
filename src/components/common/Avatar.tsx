import { useMemo } from 'react'
import { initials } from '@/utils'

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

interface AvatarProps {
  name: string
  photoURL?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  online?: boolean
}

const SIZE_MAP = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-24 w-24 text-2xl',
} as const

export function Avatar({ name, photoURL, size = 'md', className = '', online }: AvatarProps) {
  const color = useMemo(() => colorFor(name || '?'), [name])

  return (
    <div className={`relative shrink-0 ${className}`}>
      {photoURL ? (
        <img
          src={photoURL}
          alt={name}
          loading="lazy"
          className={`${SIZE_MAP[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${SIZE_MAP[size]} ${color} flex items-center justify-center rounded-full font-semibold text-white`}
          aria-hidden
        >
          {initials(name || '?')}
        </div>
      )}
      {typeof online === 'boolean' && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 block rounded-full ring-2 ring-white dark:ring-slate-900 ${
            online ? 'h-3 w-3 bg-emerald-500' : 'h-2.5 w-2.5 bg-slate-400'
          }`}
          aria-hidden
        />
      )}
    </div>
  )
}
