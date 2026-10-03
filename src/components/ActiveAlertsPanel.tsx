import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Zap, CheckCircle2, X, Sparkles, ChevronDown, ChevronUp, HardHat } from 'lucide-react';
import { AlertItem, AiAlertExplanationResponse } from '../types';

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
  const [expandedExplanationId, setExpandedExplanationId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, AiAlertExplanationResponse>>({});
  const [loadingExpl, setLoadingExpl] = useState<Record<string, boolean>>({});

  const handleToggleExplanation = async (alertId: string) => {
    if (expandedExplanationId === alertId) {
      setExpandedExplanationId(null);
      return;
    }

    setExpandedExplanationId(alertId);

    if (!explanations[alertId]) {
      setLoadingExpl((prev) => ({ ...prev, [alertId]: true }));
      try {
        const res = await fetch('/api/ai/alert-explanation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId })
        });
        if (res.ok) {
          const data: AiAlertExplanationResponse = await res.json();
          setExplanations((prev) => ({ ...prev, [alertId]: data }));
        }
      } catch (err) {
        console.warn('Failed to load alert explanation:', err);
      } finally {
        setLoadingExpl((prev) => ({ ...prev, [alertId]: false }));
      }
    }
  };

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
            const isExpanded = expandedExplanationId === alert.id;
            const explanation = explanations[alert.id];
            const isLoadingThis = loadingExpl[alert.id];

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
                    <button
                      id={`btn-explain-alert-${alert.id}`}
                      onClick={() => handleToggleExplanation(alert.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 transition-colors border border-slate-700"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{isExpanded ? 'Hide Guidance' : 'AI Safety Guidance'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

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

                {/* Expandable AI Explanation Panel */}
                {isExpanded && (
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 text-xs">
                    {isLoadingThis ? (
                      <div className="flex items-center gap-2 py-2 text-slate-400 font-mono">
                        <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span>Querying operational safety guidelines...</span>
                      </div>
                    ) : explanation ? (
                      <div className="rounded-lg bg-slate-950/70 p-3.5 border border-slate-800 text-slate-300 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Operational Hazard Breakdown
                          </span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {explanation.source === 'GEMINI_AI' ? 'Gemini 3.8 Flash' : 'Safety Rules'}
                          </span>
                        </div>

                        <p className="leading-relaxed text-slate-300">
                          {explanation.explanation}
                        </p>

                        {explanation.recommendedActions && explanation.recommendedActions.length > 0 && (
                          <div className="pt-2 border-t border-slate-800/60">
                            <div className="font-semibold text-slate-200 mb-1.5 flex items-center gap-1">
                              <HardHat className="w-3.5 h-3.5 text-amber-400" />
                              Recommended Mitigation Actions:
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                              {explanation.recommendedActions.map((act, idx) => (
                                <li key={idx} className="leading-normal">{act}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="text-[10px] text-slate-300 pt-1 flex items-center justify-between border-t border-slate-800/40">
                          <span>Advisory safety guidance. Does not supersede formal SWMS or engineer limits.</span>
                          <span>Mandatory Level: {alert.severity}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
