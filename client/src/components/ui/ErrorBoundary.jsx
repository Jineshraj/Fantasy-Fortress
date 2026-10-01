import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Catches render-time errors so a single bad row can't white-screen the app.
 * Resets when the route key changes so navigating away clears a stuck subtree.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="app-shell">
        <div className="error-panel app-crash" role="alert">
          <AlertTriangle aria-hidden="true" />
          <strong>Something broke on screen</strong>
          <p>{this.state.error.message || 'An unexpected error occurred.'}</p>
          <button
            type="button"
            className="cta-button error-retry"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw aria-hidden="true" /> Try again
          </button>
        </div>
      </main>
    )
  }
}
