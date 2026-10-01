import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { CalendarDays, ListOrdered, Medal, Swords, Trophy, Users } from 'lucide-react'
import { Access } from './Access'
import { Header } from './Header'
import { ScopeBar } from './ScopeBar'
import { Leaderboard } from './Leaderboard'
import { Squad } from './Squad'
import { Splash } from './Splash'
import { TeamView } from './TeamView'
import { Fixtures } from './Fixtures'
import { H2H } from './H2H'
import { SuperCup } from './SuperCup'
import { StatsLeaders } from './StatsLeaders'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ScrollRestoration } from '@/components/ui/ScrollRestoration'
import { ErrorState } from '@/components/ui/states'
import { prefetchAll, revalidate, retryPrefetch } from '@/data/live'
import { DEFAULT_ROUTE, ROUTES, TITLE_SUFFIX, clampGw, findTeamBySlug, routeTitle } from '@/lib/routes'
import { KEYS, getStored } from '@/lib/storage'

// Primary nav follows the weekly habit loop. Competitions live in the header.
const TABS = [
  { to: ROUTES.table, label: 'Table', Icon: ListOrdered },
  { to: ROUTES.squad, label: 'Squad', Icon: Users },
  { to: ROUTES.fixtures, label: 'Fix', Icon: CalendarDays },
  { to: ROUTES.stats, label: 'Stats', Icon: Medal },
]

const COMPETITIONS = [
  { to: ROUTES.h2h, label: 'H2H League', Icon: Swords },
  { to: ROUTES.cup, label: 'Super Cup', Icon: Trophy },
]

const COMPETITION_ID = { [ROUTES.h2h]: 'h2h', [ROUTES.cup]: 'supercup' }

const MIN_SPLASH_MS = 900
const MAX_SPLASH_MS = 7000

const relTime = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// Anything older than two days means the nightly sync has probably stopped, and
// a stale-looking-but-plausible stamp is worse than saying so.
const STALE_MINUTES = 60 * 24 * 2

const stampFrom = (updatedAt, latestGw) => {
  if (!updatedAt) return { text: `GW ${latestGw} · unknown`, stale: true }
  const d = new Date(updatedAt)
  if (Number.isNaN(d.getTime())) return { text: `GW ${latestGw} · unknown`, stale: true }
  return {
    text: `GW ${latestGw} · ${relTime(updatedAt)}`,
    stale: (Date.now() - d.getTime()) / 60000 > STALE_MINUTES,
  }
}

export function FantasyApp() {
  // Returning visitors skip the gate. The code is already public in the bundle,
  // so this adds no security — real auth replaces the whole mechanism.
  const [stage, setStage] = useState(() =>
    typeof window !== 'undefined' && getStored(KEYS.unlocked) === '1' ? 'splash' : 'access'
  )
  const [boot, setBoot] = useState({
    status: 'idle',
    data: null,
    error: null,
    progress: { done: [], failed: [] },
  })
  const [retrying, setRetrying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Start the requests immediately — the splash is a gate over real work now,
  // not a fixed timer that ran before anything was fetched.
  const started = useRef(false)
  useEffect(() => {
    if (stage === 'access' || started.current) return
    started.current = true
    const shownAt = Date.now()
    let cancelled = false

    // Hold the splash open briefly so the crest animation reads, but never
    // longer than MAX_SPLASH_MS (enforced by the effect below).
    const reveal = () => {
      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - shownAt))
      setTimeout(() => {
        if (!cancelled) setStage('hub')
      }, wait)
    }

    prefetchAll((progress) => {
      if (!cancelled) setBoot((b) => ({ ...b, progress }))
    })
      .then((result) => {
        if (cancelled) return
        setBoot({ status: 'ready', data: result, error: null, progress: { done: [], failed: [] } })
        reveal()
      })
      .catch((err) => {
        if (cancelled) return
        setBoot((b) => ({ ...b, status: 'error', error: err?.message || 'Could not reach the database.' }))
        reveal()
      })

    return () => {
      cancelled = true
    }
  }, [stage])

  // Never let a slow network trap the user on the loading screen. If the
  // prefetch hangs past MAX_SPLASH_MS we drop into the hub anyway; `boot.data`
  // will still be null, which renders the retry panel rather than a dead splash.
  useEffect(() => {
    if (stage !== 'splash') return
    const t = setTimeout(() => setStage('hub'), MAX_SPLASH_MS)
    return () => clearTimeout(t)
  }, [stage])

  const onRetry = useCallback(() => {
    setRetrying(true)
    setStage('splash')
    retryPrefetch((progress) => setBoot((b) => ({ ...b, progress })))
      .then((result) => setBoot({ status: 'ready', data: result, error: null, progress: { done: [], failed: [] } }))
      .catch((err) => setBoot({ status: 'error', error: err?.message || 'Could not reach the database.' }))
      .finally(() => {
        setRetrying(false)
        setStage('hub')
      })
  }, [])

  const teams = boot.data?.standings?.teams ?? []
  const latestGw = boot.data?.standings?.latestGw ?? 1

  // Background refresh. Deliberately keeps the current data on screen while the
  // request is in flight, so refreshing never blanks the UI. A failure is
  // swallowed — stale data plus a working retry beats an empty screen.
  const runRefresh = useCallback(() => {
    if (refreshing) return
    setRefreshing(true)
    revalidate()
      .then((result) => {
        setBoot((b) => ({ ...b, status: 'ready', data: result, error: null }))
        setGw((prev) => (prev >= result.standings.latestGw ? prev : result.standings.latestGw))
      })
      .catch(() => {
        /* keep what we have; the stamp still shows its age */
      })
      .finally(() => setRefreshing(false))
  }, [refreshing])

  // Pick up a nightly sync that landed while the tab was in the background.
  // Throttled so alt-tabbing doesn't hammer the database.
  const lastCheck = useRef(0)
  useEffect(() => {
    if (stage !== 'hub' || !boot.data) return
    const onVisible = () => {
      if (document.hidden) return
      const since = Date.now() - lastCheck.current
      if (since < 120000) return
      lastCheck.current = Date.now()
      runRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [stage, boot.data, runRefresh])

  // Gameweek lives in the URL (?gw=N). Invalid values fall back to the latest
  // scored week and are rewritten out of the address bar.
  const gw = clampGw(searchParams.get('gw'), latestGw)
  useEffect(() => {
    if (stage !== 'hub' || !boot.data) return
    const raw = searchParams.get('gw')
    if (raw !== null && Number.parseInt(raw, 10) !== gw) {
      const next = new URLSearchParams(searchParams)
      next.set('gw', String(gw))
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, gw, searchParams, boot.data])

  const setGw = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams)
      params.set('gw', String(next))
      // replace: paging weeks is a view option, not history. 3→4→5 should not
      // cost three back-button presses.
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const stamp = useMemo(
    () => (boot.data ? stampFrom(boot.data.standings.updatedAt, latestGw) : null),
    [boot.data, latestGw]
  )

  useEffect(() => {
    document.title = `${routeTitle(location.pathname)} · ${TITLE_SUFFIX}`
  }, [location.pathname])

  if (stage === 'access') return <Access onSuccess={() => setStage('splash')} />
  if (stage === 'splash') return <Splash done={boot.progress.done} failed={boot.progress.failed} />

  if (boot.status === 'error' || !boot.data) {
    return (
      <main className="app-shell">
        <Header stamp={null} />
        <div className="app-content">
          <ErrorState
            title="League data unavailable"
            message={boot.error}
            onRetry={onRetry}
            retrying={retrying}
          />
        </div>
      </main>
    )
  }

  const activeCompetition = COMPETITION_ID[location.pathname] ?? null
  const isCompetition = activeCompetition !== null

  // Keep the week when switching primary tabs, so tapping "Squad" from a
  // shared /table?gw=3 link lands on /squad?gw=3.
  const withGw = (to) => (searchParams.get('gw') ? `${to}?gw=${searchParams.get('gw')}` : to)

  return (
    <main className="app-shell">
      <ScrollRestoration />
      <Header
        stamp={stamp?.text}
        stampStale={stamp?.stale}
        onRefresh={runRefresh}
        refreshing={refreshing}
        competitions={COMPETITIONS}
        activeCompetition={activeCompetition}
        onCompetition={(id) => navigate(id === 'h2h' ? ROUTES.h2h : ROUTES.cup)}
      />

      {/* Hidden on competitions: bracket stages are pinned to their own
          gameweeks, so a global week control there would do nothing. */}
      {!isCompetition && (
        <ScopeBar
          gw={gw}
          latestGw={latestGw}
          onChange={setGw}
          gameweeks={Array.from({ length: latestGw }, (_, i) => i + 1)}
        />
      )}

      <div className="app-content">
        <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route path={ROUTES.home} element={<Navigate to={DEFAULT_ROUTE} replace />} />
            <Route
              path={ROUTES.table}
              element={<Leaderboard teams={teams} latestGw={latestGw} gw={gw} />}
            />
            <Route path={ROUTES.squad} element={<Squad teams={teams} gw={gw} />} />
            <Route path={ROUTES.fixtures} element={<Fixtures gw={gw} />} />
            <Route path={ROUTES.stats} element={<StatsLeaders gw={gw} />} />
            <Route path={ROUTES.h2h} element={<H2H />} />
            <Route path={ROUTES.cup} element={<SuperCup />} />
            <Route path="/team/:slug" element={<TeamRoute teams={teams} gw={gw} />} />
            {/* Unknown or stale link (renamed team, hand-typed path) */}
            <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
          </Routes>
        </ErrorBoundary>
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={withGw(to)}
            className={({ isActive }) => {
              // A team drill-down (/team/:slug) is part of the Table section.
              // NavLink's default isActive is a path-exact comparison, so
              // /table would go dark on /team/choakers-fc and leave the user
              // with no nav context. Override it.
              const onTeamPage = location.pathname.startsWith('/team/')
              return (onTeamPage ? to === ROUTES.table : isActive) ? 'active' : ''
            }}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </main>
  )
}

// Resolves /team/:slug to a real team. A slug that no longer matches any team
// (renamed franchise, stale shared link) redirects to the table rather than
// rendering an empty screen.
function TeamRoute({ teams, gw }) {
  const { slug } = useParams()
  const team = findTeamBySlug(teams, slug)
  if (!team) return <Navigate to={DEFAULT_ROUTE} replace />
  return <TeamView team={team} gw={gw} />
}