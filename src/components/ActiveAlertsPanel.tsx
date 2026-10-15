import React from 'react';
import { ShieldAlert, AlertTriangle, Zap, CheckCircle2, X } from 'lucide-react';
import { AlertItem } from '../types';

interface ActiveAlertsPanelProps {
  alerts: AlertItem[];
  onDismissAlert?: (id: string) => void;
  onViewAllAlerts?: () => void;
}

export const ActiveAlertsPanel: React.FC<ActiveAlertsPanelProps> = ({
  alerts,
  onDismissAlert,
  onViewAllAlerts
}) => {
  return (
    <div id="active-alerts-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
            ACTIVE SITE ALERTS ({alerts.length})
          </h3>
        </div>

        {onViewAllAlerts && (
          <button
            id="btn-view-alert-history"
            onClick={onViewAllAlerts}
            className="text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
          >
            View Alert History →
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center gap-3 text-slate-400">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="text-sm font-bold text-slate-200">NO ACTIVE ALERTS</div>
            <div className="text-xs text-slate-400 mt-0.5">
              No configured weather thresholds are currently being exceeded.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const isCritical = alert.severity === 'CRITICAL';
            const isHigh = alert.severity === 'HIGH';

            return (
              <div
                key={alert.id}
                id={`alert-card-${alert.id}`}
                className={`p-4 rounded-lg border transition-all ${
                  isCritical
                    ? 'bg-red-950/40 border-red-800 text-red-200'
                    : isHigh
                    ? 'bg-orange-950/40 border-orange-800 text-orange-200'
                    : 'bg-amber-950/30 border-amber-800 text-amber-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        isCritical
                          ? 'bg-red-500/20 text-red-400'
                          : isHigh
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {isCritical ? <Zap className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-100">{alert.title}</span>
                        <span
                          className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                            isCritical
                              ? 'bg-red-500 text-white'
                              : isHigh
                              ? 'bg-orange-500 text-slate-950'
                              : 'bg-amber-500 text-slate-950'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                        {alert.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-mono text-slate-400">
                        <span>
                          <strong className="text-slate-200">Observed:</strong> {alert.observedValue}
                        </span>
                        <span>•</span>
                        <span>
                          <strong className="text-slate-200">Threshold:</strong> {alert.thresholdValue}
                        </span>
                        <span>•</span>
                        <span>
                          <strong className="text-slate-200">Window:</strong> {alert.expectedDuration}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {onDismissAlert && (
                      <button
                        id={`btn-dismiss-alert-${alert.id}`}
                        onClick={() => onDismissAlert(alert.id)}
                        className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700"
                        title="Acknowledge / Dismiss Alert"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
