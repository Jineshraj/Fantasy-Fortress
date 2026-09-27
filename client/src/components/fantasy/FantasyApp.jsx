import { useEffect, useState } from 'react'
import { CalendarDays, ListOrdered, Swords, Trophy, Users } from 'lucide-react'
import { Access } from './Access'
import { Header } from './Header'
import { Leaderboard } from './Leaderboard'
import { MyTeam } from './MyTeam'
import { Splash } from './Splash'
import { TeamView } from './TeamView'
import { Fixtures } from './Fixtures'
import { H2H } from './H2H'
import { SuperCup } from './SuperCup'

const TABS = [
  { id: 'leaderboard', label: 'Table', Icon: ListOrdered },
  { id: 'fixtures', label: 'Fix', Icon: CalendarDays },
  { id: 'h2h', label: 'H2H', Icon: Swords },
  { id: 'supercup', label: 'Cup', Icon: Trophy },
  { id: 'team', label: 'Team', Icon: Users },
]

const LAST_UPDATED = 'GW 14 · synced Tue 02 Sep'

export function FantasyApp() {
  const [stage, setStage] = useState('access')
  const [tab, setTab] = useState('leaderboard')
  const [selectedTeam, setSelectedTeam] = useState(null)

  useEffect(() => {
    if (stage !== 'splash') return
    const timer = setTimeout(() => setStage('hub'), 2000)
    return () => clearTimeout(timer)
  }, [stage])

  if (stage === 'access') return <Access onSuccess={() => setStage('splash')} />
  if (stage === 'splash') return <Splash />

  return (
    <main className="app-shell">
      <Header lastUpdated={LAST_UPDATED} />
      <div className="app-content">
        {selectedTeam ? (
          <TeamView team={selectedTeam} onBack={() => setSelectedTeam(null)} />
        ) : tab === 'leaderboard' ? (
          <Leaderboard onTeam={setSelectedTeam} lastUpdated={LAST_UPDATED} />
        ) : tab === 'team' ? (
          <MyTeam />
        ) : tab === 'fixtures' ? (
          <Fixtures />
        ) : tab === 'h2h' ? (
          <H2H />
        ) : (
          <SuperCup />
        )}
      </div>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={tab === id && !selectedTeam ? 'active' : ''}
            onClick={() => {
              setTab(id)
              setSelectedTeam(null)
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}