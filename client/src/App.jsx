import { BrowserRouter } from 'react-router-dom'
import { FantasyApp } from '@/components/fantasy/FantasyApp'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function App() {
  return (
    // Mounted above the access gate on purpose: an incoming deep link such as
    // /team/choakers-fc?gw=3 stays in the URL while the user types their code,
    // so unlocking lands them exactly where the link pointed. No redirect
    // logic needed — the gate simply never navigates.
    <BrowserRouter>
      <ErrorBoundary>
        <FantasyApp />
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App