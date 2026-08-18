import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initOTA } from '@/services/ota'
import { ToastProvider } from '@/hooks/useToast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import App from './App'

initOTA()

// Suppress harmless Firebase Auth IndexedDB errors when the tab goes to background.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message ?? e.reason ?? '')
  if (msg.includes('Database is closing') || msg.includes('Database is hidden')) {
    e.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
