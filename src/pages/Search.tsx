import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search as SearchIcon, UserSearch, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'
import { searchUsersByUsername } from '@/services/users'
import { debounce } from '@/utils/time'
import type { UserProfile } from '@/types'

export default function Search() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const me = user?.uid ?? ''

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const runSearch = useRef(
    debounce(async (q: string) => {
      if (!q.trim()) {
        setResults([])
        setSearched(false)
        return
      }
      setSearching(true)
      try {
        const found = await searchUsersByUsername(q)
        setResults(
          found.filter(
            (u) => u.uid !== me && u.settings?.profileDiscoverable !== false && !u.banned,
          ),
        )
        setSearched(true)
      } catch {
        showToast('Search failed. Please try again.', 'error')
      } finally {
        setSearching(false)
      }
    }, 400),
  )

  useEffect(() => {
    void runSearch.current(query)
  }, [query, runSearch])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Find People</h1>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search @username"
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            aria-label="Search by username"
          />
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Search by exact or partial username to find people.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {searching ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl p-2">
                <div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : !query.trim() ? (
          <EmptyState
            icon={<UserSearch className="h-7 w-7" />}
            title="Search by username"
            description="Type a username like @rayhan to find people on Nexus Chat."
          />
        ) : searched && results.length === 0 ? (
          <EmptyState
            icon={<UserRound className="h-7 w-7" />}
            title="No users found"
            description={`No one matched "@${query.toLowerCase().replace(/^@/, '')}". Try a different username.`}
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {results.map((u) => (
              <div key={u.uid} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/user/${u.uid}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={u.name} photoURL={u.photoURL} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                      {u.name}
                    </p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      @{u.username}
                    </p>
                  </div>
                </Link>
                <Link
                  to={`/user/${u.uid}`}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  View Profile
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
