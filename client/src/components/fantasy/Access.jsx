import { useState } from 'react'
import { ArrowUp, ArrowRight, LockKeyhole, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/config/brand'
import { KEYS, setStored } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { BrandLogo } from './BrandLogo'

// Access code validation. Real per-team login IDs will map directly to individual teams.
const DEMO_CODE = 'FFS2'
const CODE_LENGTH = DEMO_CODE.length

export function Access({ onSuccess }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    if (code.toUpperCase() === DEMO_CODE) {
      setStored(KEYS.unlocked, '1')
      setStored(KEYS.role, 'manager')
      onSuccess()
    } else {
      setError(true)
    }
  }

  const continueAsGuest = () => {
    setStored(KEYS.unlocked, '1')
    setStored(KEYS.role, 'guest')
    onSuccess()
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
                setCode(e.target.value.slice(0, CODE_LENGTH).toUpperCase())
                setError(false)
              }}
              placeholder={'•'.repeat(CODE_LENGTH)}
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={CODE_LENGTH}
              spellCheck={false}
              autoCapitalize="characters"
              aria-invalid={error}
            />
          </div>
          {error && (
            <div role="alert" className="error-toast">
              <X aria-hidden="true" /> Invalid access code. Please try again or explore as guest.
            </div>
          )}
          <Button type="submit" size="lg" className="cta-button">
            Enter league hub <ArrowUp data-icon="inline-end" />
          </Button>
        </form>

        <div className="access-divider" role="separator" aria-label="or">
          <span>or</span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="guest-button"
          onClick={continueAsGuest}
        >
          <User aria-hidden="true" className="guest-icon" />
          <span>Explore as Guest</span>
          <ArrowRight aria-hidden="true" className="guest-arrow" />
        </Button>
      </section>
    </main>
  )
}