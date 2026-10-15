import React from 'react';
import { ProviderComparison } from '../types';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRightLeft,
  Lock,
  RefreshCw,
  Info
} from 'lucide-react';
import { STATIC_MODE } from '../static/mode';

interface CrossReferenceCardProps {
  comparison: ProviderComparison | null;
  hasApiKey: boolean;
  onRefresh?: () => void;
  isChecking?: boolean;
}

export const CrossReferenceCard: React.FC<CrossReferenceCardProps> = ({
  comparison,
  hasApiKey,
  onRefresh,
  isChecking = false
}) => {
  if (!comparison) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Dual-Provider Weather Cross-Reference</h3>
              <p className="text-xs text-slate-400">
                {STATIC_MODE
                  ? 'Open-Meteo is the active data source. Dual-provider cross-referencing requires the server build.'
                  : hasApiKey
                    ? 'Initializing WeatherAPI main reference and Open-Meteo cross-reference...'
                    : 'Open-Meteo active. Configure WEATHER_API_KEY in server environment for dual-model cross-referencing.'}
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isChecking}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              Cross-Check Now
            </button>
          )}
        </div>
      </div>
    );
  }

  const isFallback = comparison.isFallbackActive;
  const isHighConcordance = comparison.concordance === 'HIGH';
  const isModerate = comparison.concordance === 'MODERATE';

  const p = comparison.primaryReading;
  const c = comparison.crossRefReading;
  const v = comparison.variance;

  return (
    <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-5 backdrop-blur-sm shadow-lg space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              isFallback
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            }`}
          >
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">Dual-Provider Cross-Reference</h3>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  isFallback
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : isHighConcordance
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                }`}
              >
                {isFallback
                  ? 'AUTOMATIC FALLBACK ACTIVE'
                  : `${comparison.concordance} CONCORDANCE (${comparison.confidenceScore}% AGREEMENT)`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Main Reference: <span className="text-slate-200 font-medium">{comparison.primaryProvider}</span> • Cross-Check: <span className="text-slate-200 font-medium">{comparison.crossRefProvider}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/80 border border-slate-800 rounded-md text-[11px] text-slate-400">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Key Secured in Server Env</span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isChecking}
              title="Trigger immediate dual-model sync"
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 rounded-md border border-slate-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">Sync Models</span>
            </button>
          )}
        </div>
      </div>

      {/* Fallback notification if active */}
      {isFallback && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-300">Automatic Fallback Engaged</div>
            <p className="text-amber-200/90 leading-relaxed">
              {comparison.fallbackReason || 'WeatherAPI primary reference is temporarily unreachable. Open-Meteo has taken over active risk monitoring automatically with 0% downtime.'}
            </p>
          </div>
        </div>
      )}

      {/* Cross-Reference Comparison Matrix */}
      {c && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="pb-2 text-slate-400 font-medium">Atmospheric Metric</th>
                <th className="pb-2 text-emerald-400 font-semibold">WeatherAPI (Main Ref)</th>
                <th className="pb-2 text-cyan-400 font-semibold">Open-Meteo (Cross-Ref)</th>
                <th className="pb-2 text-slate-300 font-semibold">Variance (Δ)</th>
                <th className="pb-2 text-slate-400 font-medium">Safety Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {/* Temperature */}
              <tr className="hover:bg-slate-800/20">
                <td className="py-2 text-slate-300 font-sans font-medium flex items-center gap-1.5">
                  Temperature
                </td>
                <td className="py-2 text-slate-100 font-medium">{p.temperature.toFixed(1)}°C</td>
                <td className="py-2 text-slate-300">{c.temperature.toFixed(1)}°C</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] ${v.tempDelta > 2 ? 'bg-amber-500/10 text-amber-400 font-semibold' : 'text-slate-300'}`}>
                    {v.tempDelta > 0 ? `±${v.tempDelta}°C` : '0°C'}
                  </span>
                </td>
                <td className="py-2 font-sans text-slate-400">
                  {v.tempDelta <= 1 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Strict Agreement
                    </span>
                  ) : (
                    'Normal microclimate variance'
                  )}
                </td>
              </tr>

              {/* Wind Speed */}
              <tr className="hover:bg-slate-800/20">
                <td className="py-2 text-slate-300 font-sans font-medium">Sustained Wind</td>
                <td className="py-2 text-slate-100 font-medium">{p.windSpeed.toFixed(1)} km/h</td>
                <td className="py-2 text-slate-300">{c.windSpeed.toFixed(1)} km/h</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] ${v.windDelta > 10 ? 'bg-amber-500/10 text-amber-400 font-semibold' : 'text-slate-300'}`}>
                    {v.windDelta > 0 ? `±${v.windDelta} km/h` : '0 km/h'}
                  </span>
                </td>
                <td className="py-2 font-sans text-slate-400">
                  {Math.max(p.windSpeed, c.windSpeed) >= 40 ? (
                    <span className="text-amber-400 font-medium">Elevated threshold flagged</span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Safe Working Band
                    </span>
                  )}
                </td>
              </tr>

              {/* Wind Gusts */}
              <tr className="hover:bg-slate-800/20">
                <td className="py-2 text-slate-300 font-sans font-medium">Peak Gusts</td>
                <td className="py-2 text-slate-100 font-semibold">{p.windGusts.toFixed(1)} km/h</td>
                <td className="py-2 text-slate-300">{c.windGusts.toFixed(1)} km/h</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] ${v.gustDelta > 15 ? 'bg-amber-500/10 text-amber-400 font-semibold' : 'text-slate-300'}`}>
                    {v.gustDelta > 0 ? `±${v.gustDelta} km/h` : '0 km/h'}
                  </span>
                </td>
                <td className="py-2 font-sans text-slate-400">
                  {Math.max(p.windGusts, c.windGusts) >= 45 ? (
                    <span className="text-amber-400 font-medium">Conservative crane limits enforced</span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Sub-threshold
                    </span>
                  )}
                </td>
              </tr>

              {/* Rain Probability */}
              <tr className="hover:bg-slate-800/20">
                <td className="py-2 text-slate-300 font-sans font-medium">Rain Probability</td>
                <td className="py-2 text-slate-100 font-medium">{p.rainProbability}%</td>
                <td className="py-2 text-slate-300">{c.rainProbability}%</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] ${v.rainProbDelta > 25 ? 'bg-amber-500/10 text-amber-400 font-semibold' : 'text-slate-300'}`}>
                    {v.rainProbDelta > 0 ? `±${v.rainProbDelta}%` : '0%'}
                  </span>
                </td>
                <td className="py-2 font-sans text-slate-400">
                  {Math.max(p.rainProbability, c.rainProbability) >= 60 ? (
                    <span className="text-blue-400 font-medium">Precipitation watch active</span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Dry Window
                    </span>
                  )}
                </td>
              </tr>

              {/* Pressure */}
              <tr className="hover:bg-slate-800/20">
                <td className="py-2 text-slate-300 font-sans font-medium">Atmospheric Pressure</td>
                <td className="py-2 text-slate-100 font-medium">{p.pressure.toFixed(1)} hPa</td>
                <td className="py-2 text-slate-300">{c.pressure.toFixed(1)} hPa</td>
                <td className="py-2">
                  <span className="text-slate-300 text-[11px]">
                    {v.pressureDelta > 0 ? `±${v.pressureDelta} hPa` : '0 hPa'}
                  </span>
                </td>
                <td className="py-2 font-sans text-slate-400">
                  {p.pressure > 1020 ? 'Stable High Pressure system' : 'Frontal boundary monitor'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Notes & Consensus Protocol */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/70 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>
            {comparison.notes}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 shrink-0 text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Conservative Fail-Safe Protocol Enabled</span>
        </div>
      </div>
    </div>
  );
};
