import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { getFirebaseConfigError } from '@/firebase/config'
import { startPresence, stopPresence } from '@/services/presence'
import { NotificationInit } from '@/components/notifications/NotificationInit'
import AppShell from '@/components/layout/AppShell'
import { Spinner } from '@/components/common/Button'

const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const ProfileSetup = lazy(() => import('@/pages/ProfileSetup'))
const Chats = lazy(() => import('@/pages/Chats'))
const Chat = lazy(() => import('@/pages/Chat'))
const Friends = lazy(() => import('@/pages/Friends'))
const Requests = lazy(() => import('@/pages/Requests'))
const Search = lazy(() => import('@/pages/Search'))
const UserProfile = lazy(() => import('@/pages/UserProfile'))
const Settings = lazy(() => import('@/pages/Settings'))

function FullScreenLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950">
      <Spinner size="lg" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullScreenLoader />}>{children}</Suspense>
}

function ConfigError() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Nexus Chat</h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {getFirebaseConfigError()}
      </p>
      <p className="mt-2 max-w-md text-xs text-slate-400 dark:text-slate-500">
        See the README for setup instructions.
      </p>
    </div>
  )
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullScreenLoader message="Checking your session…" />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { profile, loading } = useCurrentUserProfile(user?.uid)

  if (loading) return <FullScreenLoader message="Loading your profile…" />

  // Authenticated but no profile doc → must complete setup.
  if (user && !profile) {
    return <Navigate to="/setup" replace />
  }

  return <>{children}</>
}

function SetupGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { profile, loading } = useCurrentUserProfile(user?.uid)

  if (loading) return <FullScreenLoader message="Loading your profile…" />

  // Already has a profile → skip setup.
  if (user && profile) return <Navigate to="/" replace />

  return <>{children}</>
}

function AppRoutes() {
  const { user, status } = useAuth()
  const { profile } = useCurrentUserProfile(user?.uid)
  const location = useLocation()

  // Start presence heartbeats once the profile exists. Deliberately depends
  // only on uid + whether the profile exists (not the profile object) so that
  // presence's own writes to online/lastSeen don't restart the loop.
  const profileReady = Boolean(user && profile)
  useEffect(() => {
    if (user && profileReady) {
      startPresence(user.uid)
    } else {
      stopPresence()
    }
    return () => stopPresence()
  }, [user?.uid, profileReady])

  if (status === 'loading') return <FullScreenLoader message="Starting Nexus Chat…" />

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LazyPage>
              <Login />
            </LazyPage>
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <LazyPage>
              <Signup />
            </LazyPage>
          </PublicOnly>
        }
      />
      <Route
        path="/setup"
        element={
          user ? (
            <SetupGate>
              <LazyPage>
                <ProfileSetup />
              </LazyPage>
            </SetupGate>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        element={
          user ? (
            <RequireProfile>
              <AppShell />
            </RequireProfile>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route path="/" element={<Navigate to="/chats" replace />} />
        <Route path="/chats" element={<LazyPage><Chats /></LazyPage>} />
        <Route path="/chat/:conversationId" element={<LazyPage><Chat /></LazyPage>} />
        <Route path="/friends" element={<LazyPage><Friends /></LazyPage>} />
        <Route path="/requests" element={<LazyPage><Requests /></LazyPage>} />
        <Route path="/search" element={<LazyPage><Search /></LazyPage>} />
        <Route path="/user/:userId" element={<LazyPage><UserProfile /></LazyPage>} />
        <Route path="/settings" element={<LazyPage><Settings /></LazyPage>} />
      </Route>
      <Route path="*" element={<Navigate to={location.pathname === '/setup' ? '/setup' : '/'} replace />} />
    </Routes>
  )
}

export default function App() {
  const error = getFirebaseConfigError()
  if (error) return <ConfigError />

  return (
    <BrowserRouter>
      <NotificationInit />
      <AppRoutes />
    </BrowserRouter>
  )
}
