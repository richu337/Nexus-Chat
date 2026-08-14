import { useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import { formatTime } from '@/utils/time'

export function AnnouncementBanner() {
  const { announcements, loading } = useAnnouncements(5)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = announcements.filter((a) => !dismissed.has(a.id))

  if (loading || visible.length === 0) return null

  return (
    <div className="space-y-2 px-4 py-2 lg:px-6">
      {visible.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10"
        >
          <div className="flex items-start gap-2.5">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                  {a.title}
                </h3>
                <button
                  onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
                  className="shrink-0 rounded p-0.5 text-indigo-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-300"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-indigo-800/80 dark:text-indigo-300/80">
                {a.body}
              </p>
              <p className="mt-1 text-[11px] text-indigo-400 dark:text-indigo-500">
                {a.senderName} · {formatTime(a.createdAt)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
