import React from 'react';
import { CloudLightning, ArrowRight } from 'lucide-react';
import { CurrentWeather, RiskAssessment, RiskLevel } from '../types';

interface LightningQuickCardProps {
  current: CurrentWeather | null;
  risk: RiskAssessment | null;
  onOpenMap: () => void;
}

const LEVEL_STYLES: Record<RiskLevel, { text: string; dot: string; label: string }> = {
  LOW: { text: 'text-slate-300', dot: 'bg-slate-500', label: 'No storm activity' },
  MODERATE: { text: 'text-amber-300', dot: 'bg-amber-400', label: 'Developing storm energy' },
  HIGH: { text: 'text-orange-300', dot: 'bg-orange-400', label: 'Elevated lightning risk' },
  CRITICAL: { text: 'text-red-300', dot: 'bg-red-400', label: 'Severe lightning risk' }
};

/**
 * Compact dashboard quick-card for lightning/storm status. Reads the STORM
 * factors the risk engine derives from Open-Meteo's Lightning Potential Index,
 * CAPE and WMO thunderstorm codes, and jumps straight to the lightning map.
 */
export const LightningQuickCard: React.FC<LightningQuickCardProps> = ({ current, risk, onOpenMap }) => {
  const stormFactors = (risk?.factors || []).filter((f) => f.category === 'STORM');
  const level: RiskLevel = stormFactors.some((f) => f.severity === 'CRITICAL')
    ? 'CRITICAL'
    : stormFactors.some((f) => f.severity === 'HIGH')
      ? 'HIGH'
      : stormFactors.some((f) => f.severity === 'MODERATE')
        ? 'MODERATE'
        : 'LOW';

  const style = LEVEL_STYLES[level];
  const thunderstorm = (current?.weatherCode ?? 0) >= 95;
  const lpi = Math.round(current?.lightningPotential ?? 0);
  const cape = Math.round(current?.cape ?? 0);
  const summaryFactor = stormFactors.sort((a, b) => b.severity.localeCompare(a.severity))[0];

  return (
    <div
      className="group flex h-full flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 transition-colors hover:border-slate-700/70"
      aria-label="Lightning and storm status"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-200">
            <CloudLightning
              className={`h-4 w-4 shrink-0 ${thunderstorm ? 'animate-pulse text-amber-300' : 'text-slate-500'}`}
            />
            Lightning & storm
          </h3>
          <p className="mt-1 truncate text-xs text-slate-500">
            {thunderstorm ? 'Thunderstorm detected on site' : summaryFactor ? summaryFactor.label : style.label}
          </p>
        </div>

        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
          {level}
        </span>
      </div>

      <dl className="mt-4 grid flex-1 grid-cols-3 divide-x divide-slate-800/60 rounded-xl border border-slate-800/60 bg-slate-950/50">
        <div className="px-3 py-2.5 text-center">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">LPI</dt>
          <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${style.text}`}>{lpi}</dd>
        </div>
        <div className="px-3 py-2.5 text-center">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">CAPE</dt>
          <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${style.text}`}>{cape}</dd>
        </div>
        <div className="px-3 py-2.5 text-center">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Storm</dt>
          <dd className={`mt-0.5 text-lg font-semibold ${style.text}`}>{thunderstorm ? 'Active' : '—'}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onOpenMap}
        className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800/60 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
      >
        <span>Open lightning map</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
};

export default LightningQuickCard;
