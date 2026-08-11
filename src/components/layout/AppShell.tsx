import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import {
  MessageSquare,
  Users,
  UserPlus,
  Settings,
  Search,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUserProfile } from '@/hooks/useUserProfile'
import { logout } from '@/firebase/auth'
import { stopPresence } from '@/services/presence'
import { reconcileAcceptedRequests } from '@/services/friends'
import { Avatar } from '@/components/common/Avatar'
import { useToast } from '@/hooks/useToast'
import { useConversationWatcher } from '@/hooks/useConversationWatcher'

const NAV_ITEMS = [
  { to: '/chats', label: 'Chats', icon: MessageSquare },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/requests', label: 'Requests', icon: UserPlus },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()
  const { profile } = useCurrentUserProfile(user?.uid)

  // The currently-open conversation, if any, so the watcher skips it.
  const openConversationId =
    location.pathname.startsWith('/chat/') ? location.pathname.split('/')[2] : undefined
  useConversationWatcher(openConversationId)

  // Repair any "accepted but no friendship" states from interrupted accepts.
  useEffect(() => {
    if (user?.uid) {
      void reconcileAcceptedRequests(user.uid).catch(() => {})
    }
  }, [user?.uid])

  async function handleLogout() {
    try {
      stopPresence()
      await logout()
      navigate('/login', { replace: true })
    } catch {
      showToast('Could not log out. Please try again.', 'error')
    }
  }

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
            <MessageSquare className="h-5 w-5 text-white" aria-hidden />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Nexus Chat
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <NavLink
            to="/search"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Search className="h-5 w-5" aria-hidden />
            Find People
          </NavLink>
          <div className="mt-1 flex items-center justify-between rounded-xl px-3 py-2.5">
            <NavLink to="/settings" className="flex items-center gap-3 text-sm font-medium">
              <Avatar name={profile?.name ?? user?.displayName ?? 'You'} photoURL={profile?.photoURL} size="sm" />
              <span className="truncate text-slate-700 dark:text-slate-200">
                {profile?.name ?? user?.displayName ?? 'You'}
              </span>
            </NavLink>
            <button
              onClick={handleLogout}
              className="text-slate-400 transition-colors hover:text-rose-500 dark:text-slate-500"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 pb-safe backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <MessageSquare className="h-4 w-4 text-white" aria-hidden />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Nexus Chat
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink
            to="/search"
            className="p-2 text-slate-500 dark:text-slate-400"
            aria-label="Find People"
          >
            <Search className="h-5 w-5" />
          </NavLink>
          <NavLink
            to="/settings"
            className="p-2 text-slate-500 dark:text-slate-400"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </NavLink>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 pb-safe backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden pb-16 pt-14 lg:pb-0 lg:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
