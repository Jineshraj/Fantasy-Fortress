import { useState } from 'react'
import { ArrowUp, LockKeyhole, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/config/brand'
import { cn } from '@/lib/utils'
import { BrandLogo } from './BrandLogo'

// Demo access code. Not a security control — it ships in the bundle. Kept
// working for now; real per-team login IDs are still to come.
const DEMO_CODE = 'SLS14'

export function Access({ onSuccess }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    if (code.toUpperCase() === DEMO_CODE) {
      onSuccess()
    } else {
      setError(true)
    }
  }

  return (
    <main className="access-screen">
      <section className="access-card" aria-labelledby="access-title">
        <BrandLogo />
        <div className="eyebrow">{BRAND.full}</div>
        <h1 id="access-title">Enter team access code</h1>
        <p>Step through the gates. Your squad and private league are waiting.</p>
        <form onSubmit={submit} className="access-form">
          <label htmlFor="team-code">Team access code</label>
          <div className={cn('code-wrap', error && 'code-error')}>
            <LockKeyhole aria-hidden="true" />
            <input
              id="team-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.slice(0, 5).toUpperCase())
                setError(false)
              }}
              placeholder="•••••"
              autoComplete="one-time-code"
              aria-invalid={error}
            />
          </div>
          {error && (
            <div role="alert" className="error-toast">
              <X aria-hidden="true" /> Invalid code. Try the demo code below.
            </div>
          )}
          <Button type="submit" size="lg" className="cta-button">
            Enter league hub <ArrowUp data-icon="inline-end" />
          </Button>
        </form>
        <p className="demo-code">
          Demo access{' '}
          <button type="button" onClick={() => setCode(DEMO_CODE)}>
            {DEMO_CODE}
          </button>
        </p>
      </section>
    </main>
  )
}