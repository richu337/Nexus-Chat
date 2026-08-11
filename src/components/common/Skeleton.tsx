export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800 ${className}`} />
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col p-4" role="status" aria-label="Loading conversation">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 pb-4">
        <Skeleton className="ml-auto h-9 w-2/3" />
        <Skeleton className="ml-auto h-9 w-1/2" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="ml-auto h-9 w-2/5" />
      </div>
    </div>
  )
}
