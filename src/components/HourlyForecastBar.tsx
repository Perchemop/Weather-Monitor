import React, { useState } from 'react';
import { Clock, Wind, CloudRain } from 'lucide-react';
import { HourlyForecastItem, RiskLevel } from '../types';

interface HourlyForecastBarProps {
  hourly: HourlyForecastItem[];
  windUnit?: 'km/h' | 'mph' | 'm/s';
}

export const HourlyForecastBar: React.FC<HourlyForecastBarProps> = ({
  hourly,
  windUnit = 'km/h'
}) => {
  const [viewCount, setViewCount] = useState<6 | 12 | 24>(6);

  if (!hourly || hourly.length === 0) {
    return null;
  }

  const items = hourly.slice(0, viewCount);

  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500 text-white';
      case 'HIGH':
        return 'bg-orange-500 text-slate-950 font-bold';
      case 'MODERATE':
        return 'bg-amber-400 text-slate-950 font-bold';
      case 'LOW':
      default:
        return 'bg-emerald-600 text-white';
    }
  };

  const formatWind = (kmh: number) => {
    if (windUnit === 'mph') return `${Math.round(kmh * 0.621371)}m`;
    if (windUnit === 'm/s') return `${(kmh / 3.6).toFixed(0)}s`;
    return `${Math.round(kmh)}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header with Switcher */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
            NEXT {viewCount} HOURS OUTLOOK
          </h3>
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-xs font-mono">
          <button
            id="view-6h-btn"
            onClick={() => setViewCount(6)}
            className={`px-2.5 py-1 rounded transition-colors ${
              viewCount === 6 ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            6 Hours
          </button>
          <button
            id="view-12h-btn"
            onClick={() => setViewCount(12)}
            className={`px-2.5 py-1 rounded transition-colors ${
              viewCount === 12 ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            12 Hours
          </button>
          <button
            id="view-24h-btn"
            onClick={() => setViewCount(24)}
            className={`px-2.5 py-1 rounded transition-colors ${
              viewCount === 24 ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            24 Hours
          </button>
        </div>
      </div>

      {/* Horizontal Hourly Cards */}
      <div className="grid grid-flow-col auto-cols-[minmax(110px,1fr)] gap-2.5 overflow-x-auto pb-2 no-scrollbar">
        {items.map((item, idx) => {
          const date = new Date(item.time);
          const timeStr = date.toLocaleTimeString([], { hour: 'numeric' });

          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border text-center transition-all flex flex-col justify-between ${
                item.riskLevel === 'CRITICAL'
                  ? 'bg-red-950/40 border-red-800/80'
                  : item.riskLevel === 'HIGH'
                  ? 'bg-orange-950/30 border-orange-800/80'
                  : item.riskLevel === 'MODERATE'
                  ? 'bg-amber-950/20 border-amber-800/60'
                  : 'bg-slate-950/70 border-slate-800/80'
              }`}
            >
              <div>
                <div className="text-xs font-mono font-bold text-slate-300 mb-1.5">
                  {timeStr}
                </div>

                {/* Risk Badge */}
                <div
                  className={`inline-block text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded tracking-wider mb-2.5 ${getRiskBadge(
                    item.riskLevel
                  )}`}
                >
                  {item.riskLevel}
                </div>

                {/* Temperature */}
                <div className="text-sm font-mono font-bold text-slate-100 mb-2">
                  {Math.round(item.temperature)}°C
                </div>
              </div>

              {/* Wind & Rain Metrics */}
              <div className="space-y-1 pt-2 border-t border-slate-800/70 text-[11px] font-mono text-slate-400">
                <div className="flex items-center justify-between" title="Sustained Wind / Peak Gust">
                  <Wind className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="font-semibold text-slate-200">
                    {formatWind(item.windSpeed)} / <span className="text-orange-400">{formatWind(item.windGusts)}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between" title="Rain Probability">
                  <CloudRain className="w-3 h-3 text-sky-400 shrink-0" />
                  <span className={item.rainProbability > 40 ? 'text-sky-300 font-semibold' : 'text-slate-400'}>
                    {Math.round(item.rainProbability)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
