import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initOTA } from '@/services/ota'
import { ToastProvider } from '@/hooks/useToast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import App from './App'

initOTA()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
