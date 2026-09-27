import { useState } from 'react'
import { ArrowUp, LockKeyhole, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Crest } from './Crest'

export function Access({ onSuccess }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    if (code.toUpperCase() === 'SLS14') {
      onSuccess()
    } else {
      setError(true)
    }
  }

  return (
    <main className="access-screen">
      <section className="access-card" aria-labelledby="access-title">
        <Crest />
        <div className="eyebrow">Sunday League Society</div>
        <h1 id="access-title">Enter team access code</h1>
        <p>Step through the tunnel. Your squad and private league are waiting.</p>
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
          <button type="button" onClick={() => setCode('SLS14')}>
            SLS14
          </button>
        </p>
      </section>
    </main>
  )
}