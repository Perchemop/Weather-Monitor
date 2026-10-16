import React from 'react';
import { CloudLightning, Zap, ArrowRight } from 'lucide-react';
import { CurrentWeather, RiskAssessment, RiskLevel } from '../types';

interface LightningQuickCardProps {
  current: CurrentWeather | null;
  risk: RiskAssessment | null;
  onOpenMap: () => void;
}

const LEVEL_STYLES: Record<RiskLevel, { ring: string; text: string; bg: string; label: string }> = {
  LOW: { ring: 'border-slate-700', text: 'text-slate-300', bg: 'bg-slate-800/60', label: 'No storm activity' },
  MODERATE: { ring: 'border-amber-700/60', text: 'text-amber-300', bg: 'bg-amber-950/40', label: 'Developing storm energy' },
  HIGH: { ring: 'border-orange-600/60', text: 'text-orange-300', bg: 'bg-orange-950/40', label: 'Elevated lightning risk' },
  CRITICAL: { ring: 'border-red-600/60', text: 'text-red-300', bg: 'bg-red-950/40', label: 'Severe lightning risk' }
};

/**
 * Compact dashboard "quick-tab" for lightning/storm status. Reads the STORM
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
      className={`group relative p-5 rounded-2xl border ${style.ring} ${style.bg} shadow-sm transition-all hover:shadow-md hover:border-slate-600/60`}
      aria-label="Lightning and storm status"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-slate-900/80 to-slate-950/80 border ${style.ring} shadow-sm`}>
            <CloudLightning className={`w-5 h-5 ${style.text} ${thunderstorm ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-slate-100">
                Lightning &amp; Storm
              </span>
              <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md border ${style.ring} ${style.text}`}>
                {level}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {thunderstorm ? 'Thunderstorm detected on site' : summaryFactor ? summaryFactor.label : style.label}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenMap}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700/80 text-xs font-medium text-slate-200 hover:text-white transition-all shadow-sm hover:shadow cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Open lightning map</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-2.5 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">LPI</div>
          <div className={`text-lg font-semibold tabular-nums ${style.text}`}>{lpi}</div>
          <div className="text-[10px] font-mono text-slate-600">J/kg</div>
        </div>
        <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-2.5 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">CAPE</div>
          <div className={`text-lg font-semibold tabular-nums ${style.text}`}>{cape}</div>
          <div className="text-[10px] font-mono text-slate-600">J/kg</div>
        </div>
        <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-2.5 text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Storm</div>
          <div className={`text-lg font-semibold tabular-nums ${style.text}`}>{thunderstorm ? 'ACTIVE' : '—'}</div>
          <div className="text-[10px] font-mono text-slate-600">WMO</div>
        </div>
      </div>
    </div>
  );
};

export default LightningQuickCard;
