import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Safety Enclave ErrorBoundary] Uncaught render error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-wide">Application Render Halted</h2>
                <p className="text-xs text-slate-400">Deterministic safety state preserved</p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-xs font-mono text-red-300 break-words space-y-1">
              <div className="text-2xs uppercase tracking-wider text-slate-500">Error Diagnostic</div>
              <div>{this.state.error?.message || 'An unexpected client error occurred.'}</div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-500/20 cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700 cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
              >
                Dismiss & Retry
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
