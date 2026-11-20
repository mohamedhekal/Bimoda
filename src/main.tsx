import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { initRemoteConfig } from './firebase/remoteConfig'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

void initRemoteConfig() // operator-controlled values; defaults apply until (or unless) the fetch succeeds

// PWA app shell: production builds only, so dev hot-reload is never served from a stale cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(async () => {
        const reg = await navigator.serviceWorker.ready
        const urls = performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .filter((n) => n.startsWith(location.origin + '/assets/'))
        reg.active?.postMessage({ type: 'CACHE_URLS', urls })
      })
      .catch(() => undefined)
  })
}
