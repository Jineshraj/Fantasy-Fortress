import { AlertTriangle, RefreshCw } from 'lucide-react'

/** Full-screen failure with a retry. Used for boot-blocking data errors. */
export function ErrorState({ title = 'Could not load the data', message, onRetry, retrying }) {
  return (
    <section className="page-section">
      <div className="error-panel" role="alert">
        <AlertTriangle aria-hidden="true" />
        <strong>{title}</strong>
        <p>{message || 'The database did not respond. Check your connection and try again.'}</p>
        {onRetry && (
          <button type="button" className="cta-button error-retry" onClick={onRetry} disabled={retrying}>
            <RefreshCw aria-hidden="true" className={retrying ? 'spin' : ''} />
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        )}
      </div>
    </section>
  )
}

/** Inline failure for one screen, leaving the rest of the app usable. */
export function InlineError({ message, onRetry, retrying }) {
  return (
    <div className="empty-state error-state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <strong>Something went wrong</strong>
      <p>{message || 'This section failed to load.'}</p>
      {onRetry && (
        <button type="button" className="text-retry" onClick={onRetry} disabled={retrying}>
          <RefreshCw aria-hidden="true" className={retrying ? 'spin' : ''} />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  )
}

/** A real empty state — distinct from an error. "Not scored yet" is normal. */
export function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="empty-state">
      {Icon && <Icon aria-hidden="true" />}
      <strong>{title}</strong>
      {message && <p>{message}</p>}
    </div>
  )
}

/** Skeleton rows so the layout doesn't jump when data lands. */
export function SkeletonList({ rows = 6, variant = 'row' }) {
  return (
    <div className={variant === 'card' ? 'skeleton-list cards' : 'skeleton-list'} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i} />
      ))}
    </div>
  )
}

export function LoadingBlock({ label = 'Loading…', rows = 6, variant = 'row' }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <SkeletonList rows={rows} variant={variant} />
    </div>
  )
}
