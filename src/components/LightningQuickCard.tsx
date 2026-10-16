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
      className={`p-4 rounded-xl border ${style.ring} ${style.bg} transition-colors`}
      aria-label="Lightning and storm status"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${style.bg} border ${style.ring}`}>
            <CloudLightning className={`w-5 h-5 ${style.text} ${thunderstorm ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold uppercase tracking-wider text-slate-300">
                Lightning &amp; Storm
              </span>
              <span className={`text-2xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${style.ring} ${style.text}`}>
                {level}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {thunderstorm ? 'Thunderstorm detected on site' : summaryFactor ? summaryFactor.label : style.label}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenMap}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Open lightning map</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-950/50 border border-slate-800/80 py-1.5">
          <div className="text-2xs font-mono uppercase text-slate-500">LPI</div>
          <div className={`text-sm font-bold ${style.text}`}>{lpi}</div>
          <div className="text-[10px] font-mono text-slate-600">J/kg</div>
        </div>
        <div className="rounded-lg bg-slate-950/50 border border-slate-800/80 py-1.5">
          <div className="text-2xs font-mono uppercase text-slate-500">CAPE</div>
          <div className={`text-sm font-bold ${style.text}`}>{cape}</div>
          <div className="text-[10px] font-mono text-slate-600">J/kg</div>
        </div>
        <div className="rounded-lg bg-slate-950/50 border border-slate-800/80 py-1.5">
          <div className="text-2xs font-mono uppercase text-slate-500">Storm</div>
          <div className={`text-sm font-bold ${style.text}`}>{thunderstorm ? 'ACTIVE' : '—'}</div>
          <div className="text-[10px] font-mono text-slate-600">WMO code</div>
        </div>
      </div>
    </div>
  );
};

export default LightningQuickCard;
