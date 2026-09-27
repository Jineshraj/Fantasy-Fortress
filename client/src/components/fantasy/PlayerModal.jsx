import { useEffect } from 'react'
import { X } from 'lucide-react'

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
    ['Price', `£${item.price}M`],
    ['GW', item.points],
  ]

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
          <div className="modal-shirt shirt">
            <span>{item.clubCode}</span>
          </div>
          <div>
            <span className="position-tag">{item.pos} · {item.club}</span>
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
      </div>
    </div>
  )
}