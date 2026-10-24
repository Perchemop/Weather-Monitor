import React from 'react'
import { ShieldAlert, AlertTriangle, Zap, CheckCircle2, X } from 'lucide-react'
import { AlertItem } from '../types'

interface ActiveAlertsPanelProps {
  alerts: AlertItem[]
  onDismissAlert?: (id: string) => void
  onViewAllAlerts?: () => void
}

const ActiveAlertsPanelComponent: React.FC<ActiveAlertsPanelProps> = ({
  alerts,
  onDismissAlert,
  onViewAllAlerts,
}) => {
  return (
    <div id="active-alerts-panel" className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-800/70 pb-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-200">
          <ShieldAlert className={`h-4 w-4 ${alerts.length > 0 ? 'text-red-400' : 'text-slate-500'}`} />
          Active alerts
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              alerts.length > 0 ? 'bg-red-500/15 text-red-300' : 'bg-slate-800/80 text-slate-400'
            }`}
          >
            {alerts.length}
          </span>
        </h3>

        {onViewAllAlerts && alerts.length > 0 && (
          <button
            id="btn-view-alert-history"
            onClick={onViewAllAlerts}
            className="rounded text-xs font-medium text-slate-400 transition-colors hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
          >
            History →
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <div className="text-sm font-semibold text-slate-200">All clear</div>
            <div className="mt-0.5 text-xs text-slate-500">
              No configured weather thresholds are currently exceeded.
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {alerts.map((alert) => {
            const isCritical = alert.severity === 'CRITICAL'
            const isHigh = alert.severity === 'HIGH'

            const accent = isCritical
              ? 'border-red-500/60 bg-red-950/30'
              : isHigh
                ? 'border-orange-500/60 bg-orange-950/25'
                : 'border-amber-500/50 bg-amber-950/20'
            const chip = isCritical
              ? 'bg-red-500 text-white'
              : isHigh
                ? 'bg-orange-500 text-slate-950'
                : 'bg-amber-400 text-slate-950'
            const iconColor = isCritical ? 'text-red-400' : isHigh ? 'text-orange-400' : 'text-amber-400'

            return (
              <div
                key={alert.id}
                id={`alert-card-${alert.id}`}
                className={`flex flex-col gap-3 rounded-xl border-l-4 border ${accent} p-4 sm:flex-row sm:items-center sm:justify-between`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {isCritical ? (
                      <Zap className={`h-5 w-5 ${iconColor}`} />
                    ) : (
                      <AlertTriangle className={`h-5 w-5 ${iconColor}`} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{alert.title}</span>
                      <span
                        className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${chip}`}
                      >
                        {alert.severity}
                      </span>
                    </div>

                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">{alert.message}</p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-500">
                      <span>
                        Observed <span className="font-semibold text-slate-300">{alert.observedValue}</span>
                      </span>
                      <span>
                        Threshold <span className="text-slate-300">{alert.thresholdValue}</span>
                      </span>
                      <span>
                        Window <span className="text-slate-300">{alert.expectedDuration}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {onDismissAlert && (
                    <button
                      id={`btn-dismiss-alert-${alert.id}`}
                      onClick={() => onDismissAlert(alert.id)}
                      className="touch-square flex items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/70 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
                      title="Acknowledge and dismiss alert"
                      aria-label={`Dismiss alert: ${alert.title}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const ActiveAlertsPanel = React.memo(ActiveAlertsPanelComponent)
