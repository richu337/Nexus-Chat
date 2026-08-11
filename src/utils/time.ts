import type { Timestamp } from 'firebase/firestore'

export function timestampToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  return null
}

export function formatTime(ts: Timestamp | null | undefined): string {
  const date = timestampToDate(ts)
  if (!date) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - thatDay.getTime()) / 86400000)

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (diffDays === 1) {
    return 'Yesterday'
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatLastSeen(ts: Timestamp | null | undefined, online: boolean): string {
  if (online) return 'Online'
  const date = timestampToDate(ts)
  if (!date) return 'Offline'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Last seen just now'
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    return `Last seen ${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    return `Last seen ${h} hour${h === 1 ? '' : 's'} ago`
  }
  const d = Math.floor(seconds / 86400)
  if (d === 1) return 'Last seen yesterday'
  if (d < 7) return `Last seen ${d} days ago`
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

export function formatMessageTime(ts: Timestamp | null | undefined): string {
  const date = timestampToDate(ts)
  if (!date) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatChatHeaderTime(ts: Timestamp | null | undefined): string {
  const date = timestampToDate(ts)
  if (!date) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - thatDay.getTime()) / 86400000)
  if (diffDays === 0) {
    return `Last active today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  if (diffDays === 1) return 'Last active yesterday'
  return `Last active ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

export function msToSeconds(ms: number): number {
  return Math.floor(ms / 1000)
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, limit: number) {
  let inThrottle = false
  return (...args: A) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}
