import { Crest } from './Crest'

export function Header({ lastUpdated }) {
  return (
    <header className="topbar">
      <div className="brand">
        <Crest compact />
        <span>Sunday League Society</span>
      </div>
      {lastUpdated && <div className="sync-stamp">{lastUpdated}</div>}
    </header>
  )
}