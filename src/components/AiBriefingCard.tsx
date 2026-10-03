import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { RiskLevel, AiBriefingResponse } from '../types';

interface AiBriefingCardProps {
  locationId?: string;
  locationName: string;
  deterministicRiskLevel?: RiskLevel;
  className?: string;
}

export function AiBriefingCard({
  locationId,
  locationName,
  deterministicRiskLevel = 'LOW',
  className = ''
}: AiBriefingCardProps) {
  const [briefing, setBriefing] = useState<AiBriefingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId })
      });
      if (!res.ok) {
        throw new Error('Briefing service returned status ' + res.status);
      }
      const data: AiBriefingResponse = await res.json();
      setBriefing(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load briefing');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
  }, [locationId]);

  const getRiskBadgeColor = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/15 text-red-700 border-red-300 dark:border-red-900/50 dark:text-red-400';
      case 'HIGH':
        return 'bg-orange-500/15 text-orange-700 border-orange-300 dark:border-orange-900/50 dark:text-orange-400';
      case 'MODERATE':
        return 'bg-amber-500/15 text-amber-700 border-amber-300 dark:border-amber-900/50 dark:text-amber-400';
      default:
        return 'bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:border-emerald-900/50 dark:text-emerald-400';
    }
  };

  return (
    <div
      id="ai-weather-briefing-card"
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Superintendent Weather Briefing
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operational safety commentary for {locationName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {briefing && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-medium uppercase tracking-wider ${
                briefing.source === 'GEMINI_AI'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {briefing.source === 'GEMINI_AI'
                ? briefing.modelUsed || 'Gemini AI'
                : 'Deterministic Rules'}
            </span>
          )}

          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${getRiskBadgeColor(
              deterministicRiskLevel
            )}`}
          >
            {deterministicRiskLevel === 'CRITICAL' || deterministicRiskLevel === 'HIGH' ? (
              <ShieldAlert className="h-3 w-3" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            Mandatory Risk: {deterministicRiskLevel}
          </span>

          <button
            id="btn-refresh-ai-briefing"
            onClick={fetchBriefing}
            disabled={isLoading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="Refresh AI briefing"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-3.5">
        {isLoading && !briefing ? (
          <div className="flex items-center gap-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span>Analyzing microclimate parameters and safety envelopes...</span>
          </div>
        ) : error && !briefing ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {briefing?.briefing || 'Weather conditions within standard operating limits.'}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-2xs text-slate-600 dark:border-slate-800/60 dark:text-slate-300">
              <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Deterministic safety thresholds are enforced independently of AI commentary.
              </span>
              {briefing?.generatedAt && (
                <span className="text-slate-500 dark:text-slate-400">
                  Updated: {new Date(briefing.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
