import { useEffect } from 'react'
import { Circle, Hand, Shield, Square, X } from 'lucide-react'
import { PlayerPhoto } from './Imagery'

const EVENT_ICONS = {
  goals: Circle,
  assists: Hand,
  cleanSheet: Shield,
  yellowCards: Square,
  redCards: X,
}

export function PlayerModal({ item, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const stats = [
    ['Season', item.season],
    ['GW', item.points],
    ['Minutes', item.minutes ?? 0],
  ]

  // Match event breakdown — only rendered once the DB supplies the detail
  // columns (populated by supabaseSyncService from the scoring engine).
  const events = [
    ['goals', item.goals],
    ['assists', item.assists],
    ['cleanSheet', item.cleanSheet],
    ['yellowCards', item.yellowCards],
    ['redCards', item.redCards],
    ['ownGoals', item.ownGoals],
    ['penaltyMiss', item.penaltyMiss],
    ['penaltySave', item.penaltySave],
  ].filter(([key, val]) => {
    if (val === null || val === undefined) return false
    if (key === 'cleanSheet') return val === true
    return Number(val) > 0
  })

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-modal-title"
        className="player-modal"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close player details"
        >
          <X />
        </button>
        <div className="modal-hero">
          <PlayerPhoto player={item} className="modal-photo-wrap" />
          <div>
            <span className="position-tag">
              {item.pos} · {item.club}
            </span>
            <h2 id="player-modal-title">{item.name}</h2>
          </div>
        </div>
        <div className="stat-grid">
          {stats.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong className="numeric">{value}</strong>
            </div>
          ))}
        </div>
        {events.length > 0 && (
          <div className="modal-event-row">
            {events.map(([key, val]) => {
              const Icon = EVENT_ICONS[key] || Circle
              return (
                <span key={key}>
                  <Icon aria-hidden="true" />
                  <b className="numeric">{key === 'cleanSheet' ? 'CS' : val}</b>
                  {key === 'cleanSheet' ? '' : key.replace('Cards', '').replace('pen', 'Pen')}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
