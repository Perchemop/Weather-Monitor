import React, { useState } from 'react'
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
  ChevronUp,
} from 'lucide-react'
import { RiskAssessment, RiskLevel } from '../types'

interface HeroRiskCardProps {
  risk: RiskAssessment | null
  locationName: string
  isLoading?: boolean
}

const HeroRiskCardComponent: React.FC<HeroRiskCardProps> = ({ risk, locationName, isLoading = false }) => {
  const [showFactors, setShowFactors] = useState(false)

  if (isLoading || !risk) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-2.5">
            <div className="h-3 w-36 bg-slate-800 rounded" />
            <div className="h-9 w-64 bg-slate-800 rounded" />
          </div>
          <div className="h-9 w-24 bg-slate-800 rounded-lg" />
        </div>
        <div className="h-4 w-full max-w-xl bg-slate-800/80 rounded mt-5" />
        <div className="h-4 w-2/3 max-w-md bg-slate-800/60 rounded mt-2.5" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div className="h-16 rounded-xl bg-slate-950/60 border border-slate-800/60" />
          <div className="h-16 rounded-xl bg-slate-950/60 border border-slate-800/60" />
          <div className="h-16 rounded-xl bg-slate-950/60 border border-slate-800/60" />
        </div>
      </div>
    )
  }

  const getRiskConfig = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return {
          title: 'Critical weather risk',
          bg: 'bg-gradient-to-br from-red-950/70 via-red-900/20 to-slate-900/40',
          border: 'border-red-600/50',
          glow: 'shadow-[0_0_40px_-12px_rgba(220,38,38,0.35)]',
          badgeBg: 'bg-red-500 text-white',
          textColor: 'text-red-400',
          softText: 'text-red-300/90',
          icon: Zap,
        }
      case 'HIGH':
        return {
          title: 'High weather risk',
          bg: 'bg-gradient-to-br from-orange-950/60 via-amber-950/20 to-slate-900/40',
          border: 'border-orange-500/50',
          glow: 'shadow-[0_0_40px_-12px_rgba(249,115,22,0.3)]',
          badgeBg: 'bg-orange-500 text-slate-950',
          textColor: 'text-orange-400',
          softText: 'text-orange-300/90',
          icon: AlertTriangle,
        }
      case 'MODERATE':
        return {
          title: 'Moderate weather risk',
          bg: 'bg-gradient-to-br from-amber-950/40 via-slate-900/40 to-slate-900/40',
          border: 'border-amber-500/40',
          glow: 'shadow-[0_0_40px_-14px_rgba(245,158,11,0.25)]',
          badgeBg: 'bg-amber-500 text-slate-950',
          textColor: 'text-amber-400',
          softText: 'text-amber-300/90',
          icon: AlertTriangle,
        }
      case 'LOW':
      default:
        return {
          title: 'Low weather risk',
          bg: 'bg-gradient-to-br from-emerald-950/40 via-slate-900/40 to-slate-900/40',
          border: 'border-emerald-600/40',
          glow: 'shadow-[0_0_40px_-14px_rgba(16,185,129,0.25)]',
          badgeBg: 'bg-emerald-600 text-white',
          textColor: 'text-emerald-400',
          softText: 'text-emerald-300/90',
          icon: ShieldCheck,
        }
    }
  }

  const config = getRiskConfig(risk.level)
  const StatusIcon = config.icon

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'WIND':
      case 'GUST':
        return Wind
      case 'RAIN':
        return CloudRain
      case 'TEMPERATURE':
        return Flame
      case 'UV':
        return Sun
      case 'STORM':
        return Zap
      default:
        return Info
    }
  }

  const scoreTone =
    risk.level === 'LOW' ? 'text-emerald-300' : risk.level === 'MODERATE' ? 'text-amber-300' : config.softText

  return (
    <section
      id="hero-risk-card"
      aria-label="Current construction risk"
      className={`relative overflow-hidden rounded-2xl border ${config.border} ${config.bg} ${config.glow} p-5 sm:p-7`}
    >
      {/* Ambient watermark */}
      <div className="absolute -right-10 -bottom-12 opacity-[0.04] pointer-events-none select-none">
        <StatusIcon className="w-72 h-72 text-white" />
      </div>

      <div className="relative">
        {/* Context line */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            Current risk <span className="text-slate-600">·</span>{' '}
            <span className="normal-case tracking-normal">{locationName}</span>
          </p>
          <p className={`text-xs tabular-nums ${scoreTone}`}>
            Score {risk.score}
            <span className="text-slate-600"> / 100</span>
          </p>
        </div>

        {/* Level */}
        <div className="flex items-center gap-3.5 mt-3">
          <span
            className={`flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border ${config.border} bg-slate-950/40`}
          >
            <StatusIcon className={`w-6 h-6 sm:w-7 sm:h-7 ${config.textColor}`} />
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white">{config.title}</h2>
        </div>

        {/* Summary */}
        <p className="mt-3 max-w-3xl text-sm sm:text-base leading-relaxed text-slate-200/95">
          {risk.summary}
        </p>

        {/* Peak period */}
        {risk.peakPeriod && (
          <div className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-slate-700/60 bg-slate-950/50 px-3.5 py-2 text-xs sm:text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Peak period
            </span>
            <span className="font-semibold tabular-nums text-slate-100">
              {risk.peakPeriod.start} – {risk.peakPeriod.end}
            </span>
            <span className={`font-medium ${config.softText}`}>{risk.peakPeriod.metric}</span>
          </div>
        )}

        {/* Factors toggle */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/40 pt-3.5">
          <button
            id="toggle-risk-factors-btn"
            onClick={() => setShowFactors(!showFactors)}
            aria-expanded={showFactors}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 -mx-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
          >
            <span>{showFactors ? 'Hide risk factors' : `Risk factors (${risk.factors.length})`}</span>
            {showFactors ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="text-xs tabular-nums text-slate-500">
            Calculated {new Date(risk.calculatedAt).toLocaleTimeString()}
          </span>
        </div>

        {/* Risk factors */}
        {showFactors && (
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 animate-fadeIn">
            {risk.factors.length === 0 ? (
              <p className="col-span-full rounded-xl border border-slate-800/70 bg-slate-950/40 p-3.5 text-xs text-slate-400">
                No adverse factors detected — all monitored parameters are within safe thresholds.
              </p>
            ) : (
              risk.factors.map((f) => {
                const CatIcon = getCategoryIcon(f.category)
                return (
                  <div
                    key={f.id}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-800/70 bg-slate-950/50 p-3"
                  >
                    <CatIcon className={`mt-0.5 h-4 w-4 shrink-0 ${config.softText}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-100">{f.label}</span>
                        <span
                          className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                            f.severity === 'CRITICAL'
                              ? 'bg-red-500/15 text-red-300'
                              : f.severity === 'HIGH'
                                ? 'bg-orange-500/15 text-orange-300'
                                : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {f.severity}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-slate-400">
                        Observed <span className="font-semibold tabular-nums text-slate-200">{f.value}</span>
                        <span className="text-slate-600"> · threshold </span>
                        <span className="tabular-nums">{f.threshold}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Safety notice */}
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400/90">
          <span className="font-semibold text-slate-300">Safety notice. </span>
          {risk.safetyDisclaimer}
        </p>
      </div>
    </section>
  )
}

export const HeroRiskCard = React.memo(HeroRiskCardComponent)
