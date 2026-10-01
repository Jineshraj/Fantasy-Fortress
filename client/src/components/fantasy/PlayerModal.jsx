import { useEffect, useRef } from 'react'
import { Circle, Hand, Shield, Square, X } from 'lucide-react'
import { PlayerPhoto } from './Imagery'

const EVENT_ICONS = {
  goals: Circle,
  assists: Hand,
  cleanSheet: Shield,
  yellowCards: Square,
  redCards: X,
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function PlayerModal({ item, onClose }) {
  const dialogRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    // Remember what had focus so it can be restored on close.
    openerRef.current = document.activeElement
    const dialog = dialogRef.current
    dialog?.querySelector(FOCUSABLE)?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      // Keep Tab inside the dialog — otherwise focus walks out into the page
      // behind the overlay.
      if (event.key !== 'Tab' || !dialog) return
      const nodes = [...dialog.querySelectorAll(FOCUSABLE)].filter(
        (n) => n.offsetWidth > 0 || n.offsetHeight > 0
      )
      if (nodes.length === 0) return
      const edge = event.shiftKey ? nodes[0] : nodes[nodes.length - 1]
      if (document.activeElement === edge) {
        event.preventDefault()
        ;(event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Return focus to the card that opened the dialog.
      openerRef.current?.focus?.()
    }
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
        ref={dialogRef}
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
