import React, { useState } from 'react'
import { ProviderComparison } from '../types'
import { CheckCircle2, AlertTriangle, ArrowRightLeft, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { STATIC_MODE } from '../static/mode'

interface CrossReferenceCardProps {
  comparison: ProviderComparison | null
  hasApiKey: boolean
  activeProvider?: string
  onRefresh?: () => void
  isChecking?: boolean
}

const CrossReferenceCardComponent: React.FC<CrossReferenceCardProps> = ({
  comparison,
  hasApiKey,
  activeProvider,
  onRefresh,
  isChecking = false,
}) => {
  const [expanded, setExpanded] = useState(false)

  const isFallback = comparison?.isFallbackActive ?? false
  const isHighConcordance = comparison?.concordance === 'HIGH'

  const chip = isFallback
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    : isHighConcordance
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : 'bg-sky-500/10 text-sky-300 border-sky-500/30'

  const chipLabel = isFallback
    ? 'Fallback active'
    : comparison
      ? `${comparison.concordance} agreement · ${comparison.confidenceScore}%`
      : 'Awaiting cross-check'

  return (
    <section
      aria-label="Dual-provider cross-reference"
      className="rounded-2xl border border-slate-800/70 bg-slate-900/60"
    >
      {/* Compact summary header — the table stays one click away */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ArrowRightLeft className="h-4 w-4 shrink-0 text-slate-500" />
          <h3 className="text-sm font-semibold tracking-tight text-slate-200">Provider cross-reference</h3>
          <span
            className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${chip}`}
          >
            {chipLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isChecking}
              title="Trigger an immediate dual-provider sync"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-200 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}
          {comparison && (
            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
            >
              <span>{expanded ? 'Hide detail' : 'Detail'}</span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* One-line plain-language reading while collapsed */}
      {comparison && !expanded && (
        <p className="px-5 pb-4 text-xs text-slate-500">
          {activeProvider && (
            <>
              Reading from <span className="font-medium text-slate-400">{activeProvider}</span>
              <span className="text-slate-700"> · </span>
            </>
          )}
          {comparison.notes}
        </p>
      )}

      {/* Fallback notice always visible when engaged */}
      {isFallback && comparison && (
        <div className="mx-5 mb-5 flex items-start gap-3 rounded-xl border border-amber-800/40 bg-amber-950/25 p-3.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="leading-relaxed">
            <span className="font-semibold text-amber-300">Automatic fallback engaged. </span>
            {comparison.fallbackReason ||
              'The primary reference is temporarily unreachable; Open-Meteo has taken over monitoring.'}
          </p>
        </div>
      )}

      {/* Expanded comparison matrix */}
      {comparison && expanded && (
        <div className="animate-fadeIn px-5 pb-5">
          {!STATIC_MODE && (
            <p className="mb-3 text-[11px] text-slate-500">
              Main reference <span className="text-slate-300">{comparison.primaryProvider}</span>
              <span className="text-slate-600"> · </span>
              cross-check <span className="text-slate-300">{comparison.crossRefProvider}</span>
              <span className="text-slate-600"> · </span>
              key held in server environment
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-800/60">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-left text-slate-500">
                  <th className="px-3.5 py-2 font-medium">Metric</th>
                  <th className="px-3.5 py-2 font-medium">{comparison.primaryProvider}</th>
                  <th className="px-3.5 py-2 font-medium">{comparison.crossRefProvider}</th>
                  <th className="px-3.5 py-2 font-medium">Variance</th>
                  <th className="px-3.5 py-2 font-medium">Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                <Row
                  label="Temperature"
                  primary={`${comparison.primaryReading.temperature.toFixed(1)}°C`}
                  cross={`${comparison.crossRefReading.temperature.toFixed(1)}°C`}
                  delta={comparison.variance.tempDelta > 0 ? `±${comparison.variance.tempDelta}°C` : '0°C'}
                  deltaFlag={comparison.variance.tempDelta > 2}
                  ok={comparison.variance.tempDelta <= 1}
                  okLabel="Strict agreement"
                  infoLabel="Normal variance"
                />
                <Row
                  label="Sustained wind"
                  primary={`${comparison.primaryReading.windSpeed.toFixed(1)} km/h`}
                  cross={`${comparison.crossRefReading.windSpeed.toFixed(1)} km/h`}
                  delta={
                    comparison.variance.windDelta > 0 ? `±${comparison.variance.windDelta} km/h` : '0 km/h'
                  }
                  deltaFlag={comparison.variance.windDelta > 10}
                  ok={
                    Math.max(comparison.primaryReading.windSpeed, comparison.crossRefReading.windSpeed) < 40
                  }
                  okLabel="Safe working band"
                  infoLabel="Elevated — threshold flagged"
                  okWhenFalse="text-amber-400"
                />
                <Row
                  label="Peak gusts"
                  primary={`${comparison.primaryReading.windGusts.toFixed(1)} km/h`}
                  cross={`${comparison.crossRefReading.windGusts.toFixed(1)} km/h`}
                  delta={
                    comparison.variance.gustDelta > 0 ? `±${comparison.variance.gustDelta} km/h` : '0 km/h'
                  }
                  deltaFlag={comparison.variance.gustDelta > 15}
                  ok={
                    Math.max(comparison.primaryReading.windGusts, comparison.crossRefReading.windGusts) < 45
                  }
                  okLabel="Sub-threshold"
                  infoLabel="Crane limits enforced"
                  okWhenFalse="text-amber-400"
                />
                <Row
                  label="Rain probability"
                  primary={`${comparison.primaryReading.rainProbability}%`}
                  cross={`${comparison.crossRefReading.rainProbability}%`}
                  delta={
                    comparison.variance.rainProbDelta > 0 ? `±${comparison.variance.rainProbDelta}%` : '0%'
                  }
                  deltaFlag={comparison.variance.rainProbDelta > 25}
                  ok={
                    Math.max(
                      comparison.primaryReading.rainProbability,
                      comparison.crossRefReading.rainProbability,
                    ) < 60
                  }
                  okLabel="Dry window"
                  infoLabel="Precipitation watch"
                  okWhenFalse="text-sky-400"
                />
                <Row
                  label="Pressure"
                  primary={`${comparison.primaryReading.pressure.toFixed(1)} hPa`}
                  cross={`${comparison.crossRefReading.pressure.toFixed(1)} hPa`}
                  delta={
                    comparison.variance.pressureDelta > 0
                      ? `±${comparison.variance.pressureDelta} hPa`
                      : '0 hPa'
                  }
                  deltaFlag={false}
                  ok={comparison.primaryReading.pressure > 1020}
                  okLabel="Stable high"
                  infoLabel="Frontal boundary"
                />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!comparison && (
        <p className="px-5 pb-5 text-xs text-slate-500">
          {STATIC_MODE
            ? 'Open-Meteo is the active source; dual-provider cross-referencing requires the server build.'
            : hasApiKey
              ? 'Initialising WeatherAPI (main) and Open-Meteo (cross-check)...'
              : 'Open-Meteo active — set WEATHER_API_KEY on the server to enable dual-model cross-referencing.'}
        </p>
      )}
    </section>
  )
}

interface RowProps {
  label: string
  primary: string
  cross: string
  delta: string
  deltaFlag: boolean
  ok: boolean
  okLabel: string
  infoLabel: string
  okWhenFalse?: string
}

const Row: React.FC<RowProps> = ({
  label,
  primary,
  cross,
  delta,
  deltaFlag,
  ok,
  okLabel,
  infoLabel,
  okWhenFalse = 'text-slate-400',
}) => (
  <tr className="transition-colors hover:bg-slate-800/20">
    <td className="px-3.5 py-2 font-medium text-slate-300">{label}</td>
    <td className="px-3.5 py-2 font-semibold tabular-nums text-slate-100">{primary}</td>
    <td className="px-3.5 py-2 tabular-nums text-slate-400">{cross}</td>
    <td className="px-3.5 py-2 tabular-nums">
      <span className={deltaFlag ? 'font-semibold text-amber-400' : 'text-slate-500'}>{delta}</span>
    </td>
    <td className="px-3.5 py-2">
      {ok ? (
        <span className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" /> {okLabel}
        </span>
      ) : (
        <span className={okWhenFalse}>{infoLabel}</span>
      )}
    </td>
  </tr>
)

export const CrossReferenceCard = React.memo(CrossReferenceCardComponent)
