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
import { prefetchRest, prefetchStandings, revalidate, retryPrefetch } from '@/data/live'
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
// A slow load is not an error. Only when Tier 1 (the league table) has not
// settled after this long do we surface the retry panel. There is deliberately
// no shorter "forced completion" timer.
const TIER1_TIMEOUT_MS = 30000

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
  // Returning visitors skip the gate. The ?lock or ?reset param allows returning to the gate.
  const [stage, setStage] = useState(() => {
    if (typeof window === 'undefined') return 'access'
    const params = new URLSearchParams(window.location.search)
    if (params.has('lock') || params.has('reset')) {
      try { window.localStorage.removeItem(KEYS.unlocked) } catch {}
      return 'access'
    }
    return getStored(KEYS.unlocked) === '1' ? 'splash' : 'access'
  })
  const [boot, setBoot] = useState({
    status: 'idle',
    data: null,
    error: null,
    progress: { done: [], failed: [] },
  })
  const [retrying, setRetrying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Survives StrictMode's dev-only effect remount, so async boot handlers can
  // tell "really unmounted" apart from "this effect was re-run".
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Tier 1 starts on mount — even while the access gate is showing — so a
  // first-time visitor's unlock does not begin from a cold cache. This effect
  // only warms the data; the splash effect below owns rendering and failure.
  useEffect(() => {
    let cancelled = false
    prefetchStandings((progress) => {
      if (!cancelled) setBoot((b) => ({ ...b, progress }))
    }).catch(() => {
      /* failure is surfaced by the splash/retry flow */
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The splash is a gate over Tier 1 only. Once standings land we render the
  // hub and warm the remaining tiers in the background; the table never waits
  // on player stats, fixtures history, or H2H scores.
  //
  // Each boot is keyed by `attempt`: a retry bumps it and reruns this effect.
  // A mount-lifetime ref (not a "started" flag) keeps this correct under
  // StrictMode's development double-invoke.
  useEffect(() => {
    if (stage !== 'splash') return
    const shownAt = Date.now()
    let revealTimer = null

    const finish = (statusUpdate) => {
      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - shownAt))
      revealTimer = setTimeout(() => {
        if (!mountedRef.current) return
        if (statusUpdate) setBoot(statusUpdate)
        setRetrying(false)
        setStage('hub')
      }, wait)
    }

    const onProgress = (progress) => {
      if (mountedRef.current) setBoot((b) => ({ ...b, progress }))
    }

    // Real failure only: a slow network keeps the splash up, it never fakes an
    // error. If Tier 1 is still pending after the timeout, show the retry panel.
    const failureTimer = setTimeout(() => {
      if (!mountedRef.current) return
      setBoot((b) => ({
        ...b,
        status: 'error',
        error: b.error || 'The league table is taking too long to load.',
      }))
      setRetrying(false)
      setStage('hub')
    }, TIER1_TIMEOUT_MS)

    const gate = attempt > 0 ? retryPrefetch(onProgress) : prefetchStandings(onProgress)
    gate
      .then(({ standings }) => {
        if (!mountedRef.current) return
        clearTimeout(failureTimer)
        setBoot((b) => ({ ...b, status: 'ready', data: { standings }, error: null }))
        // A retry already re-ran the background tiers; the first boot warms
        // them here. Never awaited for first paint.
        if (attempt === 0) prefetchRest(onProgress).catch(() => {})
        finish()
      })
      .catch((err) => {
        if (!mountedRef.current) return
        clearTimeout(failureTimer)
        finish({
          status: 'error',
          data: null,
          error: err?.message || 'Could not reach the database.',
          progress: { done: [], failed: [] },
        })
      })

    return () => {
      clearTimeout(failureTimer)
      if (revealTimer) clearTimeout(revealTimer)
    }
  }, [stage, attempt])

  const onRetry = useCallback(() => {
    setRetrying(true)
    setAttempt((a) => a + 1)
    setStage('splash')
  }, [])

  const teams = boot.data?.standings?.teams ?? []
  const latestGw = boot.data?.standings?.latestGw ?? 1

  // Gameweek lives in the URL (?gw=N). Invalid values fall back to the latest
  // scored week and are rewritten out of the address bar.
  const gw = clampGw(searchParams.get('gw'), latestGw)

  const setGw = useCallback(
    (next) => {
      const currentVal = clampGw(searchParams.get('gw'), latestGw)
      const resolved = typeof next === 'function' ? next(currentVal) : next
      const params = new URLSearchParams(searchParams)
      params.set('gw', String(resolved))
      // replace: paging weeks is a view option, not history. 3→4→5 should not
      // cost three back-button presses.
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams, latestGw]
  )

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
  }, [refreshing, setGw])

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

  const stampInfo = useMemo(
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

  // Contextual visibility (uiux-improvements.md Item 3): the stepper only
  // appears where the screen is actually gameweek-scoped. Competitions own
  // their stage week; /table in Overall mode shows only its "through GW N"
  // metadata. `visible` unmounts the bar — it is never hidden with CSS.
  const isTable = location.pathname === ROUTES.table
  const tableMode = searchParams.get('view') === 'gw' ? 'gw' : 'overall'
  const onTeamPage = location.pathname.startsWith('/team/')
  const gwBarVisible = !isCompetition && !onTeamPage && (!isTable || tableMode === 'gw')

  // Keep the week when switching primary tabs, so tapping "Squad" from a
  // shared /table?gw=3 link lands on /squad?gw=3.
  const withGw = (to) => (searchParams.get('gw') ? `${to}?gw=${searchParams.get('gw')}` : to)

  return (
    <main className="app-shell">
      <ScrollRestoration />
      <Header
        stamp={stampInfo?.text ?? null}
        stampStale={stampInfo?.stale ?? false}
        onRefresh={runRefresh}
        refreshing={refreshing}
        competitions={COMPETITIONS}
        activeCompetition={activeCompetition}
        onCompetition={(id) => navigate(id === 'h2h' ? ROUTES.h2h : ROUTES.cup)}
      />

      <ScopeBar
        visible={gwBarVisible}
        gw={gw}
        latestGw={latestGw}
        onChange={setGw}
        gameweeks={Array.from({ length: latestGw }, (_, i) => i + 1)}
      />

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
            <Route
              path="/team/:slug"
              element={
                <TeamRoute
                  teams={teams}
                  gw={gw}
                  latestGw={latestGw}
                  onGwChange={setGw}
                />
              }
            />
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
function TeamRoute({ teams, gw, latestGw, onGwChange }) {
  const { slug } = useParams()
  const team = findTeamBySlug(teams, slug)
  if (!team) return <Navigate to={DEFAULT_ROUTE} replace />
  return <TeamView team={team} gw={gw} latestGw={latestGw} onGwChange={onGwChange} />
}