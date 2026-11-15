import '@fontsource-variable/nunito'
import '@fontsource-variable/quicksand'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/tokens.css'
import './styles/base.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Started fine: allow a future recovery reload and drop its cache-busting query.
try {
  sessionStorage.removeItem('missme:recovered')
} catch {
  // optional
}
if (location.search.includes('r=')) history.replaceState(null, '', location.pathname)
