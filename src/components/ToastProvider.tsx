import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  severity?: string
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Stable fallback used when a component calls `useToast()` outside the provider. */
const FALLBACK_TOAST: ToastContextValue = {
  showToast: (msg: string) => {
    if (import.meta.env.DEV) console.log('[Toast]', msg)
  },
  success: (msg: string) => {
    if (import.meta.env.DEV) console.log('[Toast Success]', msg)
  },
  error: (msg: string) => {
    if (import.meta.env.DEV) console.error('[Toast Error]', msg)
  },
  warning: (msg: string) => {
    if (import.meta.env.DEV) console.warn('[Toast Warning]', msg)
  },
  info: (msg: string) => console.info('[Toast Info]', msg),
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pausedIds, setPausedIds] = useState<Set<string>>(new Set())
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const remainingRef = useRef<Record<string, number>>({})
  const startRef = useRef<Record<string, number>>({})

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id])
      delete timersRef.current[id]
    }
  }, [])

  // Schedule auto-dismiss for non-critical toasts.
  useEffect(() => {
    toasts.forEach((t) => {
      if (t.severity === 'CRITICAL') return
      if (timersRef.current[t.id]) return
      remainingRef.current[t.id] = 4000
      startRef.current[t.id] = Date.now()
      timersRef.current[t.id] = setTimeout(() => removeToast(t.id), 4000)
    })
  }, [toasts, removeToast])

  // Pause / resume on hover or focus.
  useEffect(() => {
    pausedIds.forEach((id) => {
      const timer = timersRef.current[id]
      if (timer) {
        clearTimeout(timer)
        delete timersRef.current[id]
        const elapsed = Date.now() - (startRef.current[id] || Date.now())
        remainingRef.current[id] = Math.max(0, (remainingRef.current[id] || 4000) - elapsed)
      }
    })
    toasts.forEach((t) => {
      if (t.severity === 'CRITICAL') return
      if (pausedIds.has(t.id)) return
      if (timersRef.current[t.id]) return
      const ms = remainingRef.current[t.id]
      if (ms && ms > 0) {
        startRef.current[t.id] = Date.now()
        timersRef.current[t.id] = setTimeout(() => removeToast(t.id), ms)
      }
    })
  }, [pausedIds, toasts, removeToast])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 4000, severity?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      setToasts((prev) => [...prev, { id, message, type, severity }])
    },
    [],
  )

  const success = useCallback((message: string) => showToast(message, 'success'), [showToast])
  const error = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast])
  const info = useCallback((message: string) => showToast(message, 'info'), [showToast])

  // Memoise the context value so adding/removing a toast doesn't re-render every
  // consumer (the whole app subtree) through a fresh object identity.
  const value = useMemo(
    () => ({ showToast, success, error, warning, info }),
    [showToast, success, error, warning, info],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast Notification Container */}
      <div
        id="toast-notification-enclave"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          let bgColor = 'bg-slate-900 border-slate-700 text-slate-100'
          let icon = <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />

          if (toast.type === 'success') {
            bgColor = 'bg-slate-900 border-emerald-500/40 text-emerald-100'
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          } else if (toast.type === 'error') {
            bgColor = 'bg-slate-900 border-red-500/40 text-red-100'
            icon = <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          } else if (toast.type === 'warning') {
            bgColor = 'bg-slate-900 border-amber-500/40 text-amber-100'
            icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-toast-in ${bgColor}`}
              role="alert"
              onMouseEnter={() => setPausedIds((prev) => new Set(prev).add(toast.id))}
              onMouseLeave={() => setPausedIds((prev) => {
                const next = new Set(prev)
                next.delete(toast.id)
                return next
              })}
              onFocus={() => setPausedIds((prev) => new Set(prev).add(toast.id))}
              onBlur={() => setPausedIds((prev) => {
                const next = new Set(prev)
                next.delete(toast.id)
                return next
              })}
            >
              {icon}
              <div className="flex-1 text-xs font-medium leading-relaxed">{toast.message}</div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="touch-square inline-flex items-center justify-center text-slate-400 hover:text-slate-200 p-0.5 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Graceful fallback if invoked outside provider
    return FALLBACK_TOAST
  }
  return ctx
}
