import { useEffect, useRef } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { ClubMark, PlayerPhoto } from './Imagery'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * "Who owns who?" for a single real fixture.
 *
 * All state (which fixture is open, load status, error) lives in
 * `Fixtures.jsx`; this component is a presentational dialog that preserves the
 * same focus trap / Escape / backdrop / focus-restoration contract as the
 * player modal.
 */
export function FixtureOwnershipModal({ fixture, rows, status, error, onRetry, onClose }) {
  const dialogRef = useRef(null)
  const openerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    openerRef.current = document.activeElement
    const dialog = dialogRef.current
    dialog?.querySelector(FOCUSABLE)?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
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
      openerRef.current?.focus?.()
    }
  }, [])

  const homeRows = (rows || []).filter((r) => r.side === 'home')
  const awayRows = (rows || []).filter((r) => r.side === 'away')
  const title = `${fixture.home.code} vs ${fixture.away.code}`

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
        aria-labelledby="ownership-modal-title"
        className="player-modal ownership-modal"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close ownership details"
        >
          <X />
        </button>

        <div className="modal-hero ownership-hero">
          <ClubMark code={fixture.home.code} url={fixture.home.badgeUrl} />
          <div>
            <span className="position-tag">
              GW {fixture.gameweek} · {fixture.status}
            </span>
            <h2 id="ownership-modal-title">{title}</h2>
            <p className="modal-total">
              {fixture.home.name} vs {fixture.away.name}
              <b className="numeric">
                {fixture.score
                  ? `${fixture.score[0]}–${fixture.score[1]}`
                  : fixture.kickoff || '—'}
              </b>
            </p>
          </div>
          <ClubMark code={fixture.away.code} url={fixture.away.badgeUrl} />
        </div>

        {status === 'loading' && <LoadingBlock label="Loading ownership" rows={5} />}

        {status === 'error' && (
          <InlineError message={error || 'Ownership unavailable'} onRetry={onRetry} />
        )}

        {status === 'empty' && (
          <EmptyState
            icon={ShieldCheck}
            title="No owners synced"
            message={`No players from either club have GW${fixture.gameweek} stats yet.`}
          />
        )}

        {status === 'ready' && (
          <div className="ownership-list">
            {[
              { side: 'home', club: fixture.home, rows: homeRows },
              { side: 'away', club: fixture.away, rows: awayRows },
            ].map(
              (group) =>
                group.rows.length > 0 && (
                  <section className="ownership-group" key={group.side}>
                    <h3>
                      <ClubMark code={group.club.code} url={group.club.badgeUrl} />
                      {group.club.code} · {group.club.name}
                    </h3>
                    {group.rows.map((r) => (
                      <div className="ownership-row" key={`${r.playerName}::${r.fantasyTeamName}`}>
                        <PlayerPhoto
                          player={{ name: r.playerName, photoUrl: r.photoUrl, clubCode: r.clubCode }}
                        />
                        <span className="ownership-player">
                          <strong>{r.playerName}</strong>
                          <small>
                            {r.clubCode} · {r.ownerLabel}
                          </small>
                        </span>
                        <b className="ownership-points numeric">
                          {r.points ?? '—'}
                          {r.points !== null ? ' pts' : ''}
                        </b>
                      </div>
                    ))}
                  </section>
                )
            )}
            {homeRows.length === 0 && awayRows.length === 0 && (
              <EmptyState
                icon={ShieldCheck}
                title="No owners synced"
                message={`No players from either club have GW${fixture.gameweek} stats yet.`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
