import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { Spinner } from '@/components/common/Button'

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth()
  const { profile, loading } = useCurrentUserProfile(user?.uid)

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Checking permissions…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!profile || profile.role !== 'admin') return <Navigate to="/" replace />

  return <>{children}</>
}
