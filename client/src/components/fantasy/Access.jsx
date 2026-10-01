import { useState } from 'react'
import { ArrowUp, LockKeyhole, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/config/brand'
import { KEYS, getStored, setStored } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { BrandLogo } from './BrandLogo'

// Demo access code. Not a security control — it ships in the bundle. Renamed
// from SLS14 (the old Sunday League initials, and this is Fantasy
// Fortress Season 2) to FFS2. Real per-team login IDs are still to come.
const DEMO_CODE = 'FFS2'
const CODE_LENGTH = DEMO_CODE.length

export function Access({ onSuccess }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    if (code.toUpperCase() === DEMO_CODE) {
      // Remember the unlock so returning visitors don't retype a string that is
      // already visible in the bundle. Adds no security — it only removes a
      // pointless repeated step until real auth lands.
      setStored(KEYS.unlocked, '1')
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
              <X aria-hidden="true" /> Invalid code. Try the demo code below.
            </div>
          )}
          <Button type="submit" size="lg" className="cta-button">
            Enter league hub <ArrowUp data-icon="inline-end" />
          </Button>
        </form>
        <p className="demo-code">
          Demo access{' '}
          <button
            type="button"
            onClick={() => {
              setCode(DEMO_CODE)
              setStored(KEYS.unlocked, '1')
              onSuccess()
            }}
          >
            {DEMO_CODE}
          </button>
        </p>
      </section>
    </main>
  )
}