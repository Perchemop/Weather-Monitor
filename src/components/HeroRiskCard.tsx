import React, { useState } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  Flame,
  Wind,
  CloudRain,
  Sun,
  Zap,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { RiskAssessment, RiskLevel } from '../types';

interface HeroRiskCardProps {
  risk: RiskAssessment | null;
  locationName: string;
  isLoading?: boolean;
}

export const HeroRiskCard: React.FC<HeroRiskCardProps> = ({ risk, locationName, isLoading = false }) => {
  const [showFactors, setShowFactors] = useState(false);

  if (isLoading || !risk) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 animate-pulse shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-slate-800 rounded" />
            <div className="h-8 w-64 bg-slate-800 rounded" />
          </div>
          <div className="h-10 w-28 bg-slate-800 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="h-20 bg-slate-950/60 rounded-xl border border-slate-800/60" />
          <div className="h-20 bg-slate-950/60 rounded-xl border border-slate-800/60" />
          <div className="h-20 bg-slate-950/60 rounded-xl border border-slate-800/60" />
        </div>
        <div className="mt-4 text-center text-xs font-mono text-slate-500">
          Evaluating microclimate crane & site safety envelopes...
        </div>
      </div>
    );
  }

  const getRiskConfig = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return {
          title: 'CRITICAL WEATHER RISK',
          bg: 'bg-gradient-to-br from-red-950/80 via-red-900/40 to-slate-900',
          border: 'border-red-600/80',
          badgeBg: 'bg-red-500 text-white',
          textColor: 'text-red-400',
          accentBg: 'bg-red-500/10 border-red-500/30',
          icon: Zap
        };
      case 'HIGH':
        return {
          title: 'HIGH WEATHER RISK',
          bg: 'bg-gradient-to-br from-amber-950/80 via-orange-950/40 to-slate-900',
          border: 'border-orange-500/80',
          badgeBg: 'bg-orange-500 text-slate-950',
          textColor: 'text-orange-400',
          accentBg: 'bg-orange-500/10 border-orange-500/30',
          icon: AlertTriangle
        };
      case 'MODERATE':
        return {
          title: 'MODERATE WEATHER RISK',
          bg: 'bg-gradient-to-br from-amber-950/50 via-slate-900 to-slate-900',
          border: 'border-amber-500/60',
          badgeBg: 'bg-amber-500 text-slate-950',
          textColor: 'text-amber-400',
          accentBg: 'bg-amber-500/10 border-amber-500/30',
          icon: AlertTriangle
        };
      case 'LOW':
      default:
        return {
          title: 'LOW WEATHER RISK',
          bg: 'bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900',
          border: 'border-emerald-600/60',
          badgeBg: 'bg-emerald-600 text-white',
          textColor: 'text-emerald-400',
          accentBg: 'bg-emerald-500/10 border-emerald-500/30',
          icon: ShieldCheck
        };
    }
  };

  const config = getRiskConfig(risk.level);
  const StatusIcon = config.icon;

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'WIND':
      case 'GUST':
        return Wind;
      case 'RAIN':
        return CloudRain;
      case 'TEMPERATURE':
        return Flame;
      case 'UV':
        return Sun;
      case 'STORM':
        return Zap;
      default:
        return Info;
    }
  };

  return (
    <div
      id="hero-risk-card"
      className={`rounded-xl border ${config.border} ${config.bg} p-5 sm:p-7 shadow-lg relative overflow-hidden transition-all`}
    >
      {/* Background visual watermarks */}
      <div className="absolute -right-8 -bottom-8 opacity-5 pointer-events-none">
        <StatusIcon className="w-64 h-64 text-white" />
      </div>

      <div className="relative z-10">
        {/* Header line */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-slate-400">
              CURRENT CONSTRUCTION RISK
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs font-mono text-slate-400">{locationName}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Deterministic Score:</span>
            <span className="font-mono text-xs font-bold text-slate-200 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              {risk.score} / 100
            </span>
          </div>
        </div>

        {/* Big Level Display */}
        <div className="flex flex-wrap items-baseline gap-3 sm:gap-4 my-2">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white flex items-center gap-3">
            <StatusIcon className={`w-8 h-8 sm:w-12 sm:h-12 ${config.textColor} shrink-0`} />
            <span>{config.title}</span>
          </h2>
        </div>

        {/* Why / Summary explanation */}
        <p className="text-base sm:text-lg text-slate-200 font-medium mt-2 max-w-3xl leading-snug">
          {risk.summary}
        </p>

        {/* Peak Period Callout */}
        {risk.peakPeriod && (
          <div className="mt-4 inline-flex flex-wrap items-center gap-2.5 px-3.5 py-2 rounded-lg bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm">
            <span className="font-mono font-bold uppercase tracking-wider text-amber-400">
              Peak Period:
            </span>
            <span className="text-slate-100 font-semibold">
              {risk.peakPeriod.start} – {risk.peakPeriod.end}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-300 font-mono font-medium">
              {risk.peakPeriod.metric}
            </span>
          </div>
        )}

        {/* Action button to view risk factors */}
        <div className="mt-5 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
          <button
            id="toggle-risk-factors-btn"
            onClick={() => setShowFactors(!showFactors)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors py-1 px-2 rounded hover:bg-slate-800/60"
          >
            <span>{showFactors ? 'Hide evaluated risk factors' : 'View evaluated risk factors'}</span>
            {showFactors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <span className="text-xs font-mono text-slate-400">
            Calculated: {new Date(risk.calculatedAt).toLocaleTimeString()}
          </span>
        </div>

        {/* Expandable Risk Factors Breakdown */}
        {showFactors && (
          <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fadeIn">
            {risk.factors.length === 0 ? (
              <p className="text-xs text-slate-400 font-mono col-span-full">
                No active adverse factors detected. All atmospheric parameters are below baseline thresholds.
              </p>
            ) : (
              risk.factors.map((f) => {
                const CatIcon = getCategoryIcon(f.category);
                return (
                  <div
                    key={f.id}
                    className="p-3 rounded-lg bg-slate-900/90 border border-slate-700/80 flex items-start gap-2.5"
                  >
                    <div className="p-1.5 rounded bg-slate-800 text-amber-400 shrink-0 mt-0.5">
                      <CatIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-200 truncate">{f.label}</span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                            f.severity === 'CRITICAL'
                              ? 'bg-red-500/20 text-red-300'
                              : f.severity === 'HIGH'
                              ? 'bg-orange-500/20 text-orange-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {f.severity}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 font-mono mt-0.5">
                        Observed: <strong className="text-white">{f.value}</strong> (Threshold: {f.threshold})
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Mandatory Safety Language Disclaimer */}
        <div className="mt-4 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Safety Notice: </strong>
          {risk.safetyDisclaimer}
        </div>
      </div>
    </div>
  );
};
