import { useCallback, useContext, createContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ToastData, ToastKind } from '@/types'

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++counter.current
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const kindStyles =
    toast.kind === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : toast.kind === 'error'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
        : 'border-slate-500/40 bg-slate-500/10 text-slate-100'

  return (
    <button
      onClick={onDismiss}
      className={`pointer-events-auto rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-lg backdrop-blur transition-all ${kindStyles}`}
    >
      {toast.message}
    </button>
  )
}
