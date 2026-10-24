import React, { useState } from 'react'
import { Wind, CloudRain, CloudLightning, Cloud, CloudSun, Sun } from 'lucide-react'
import { HourlyForecastItem, RiskLevel } from '../types'

interface HourlyForecastBarProps {
  hourly: HourlyForecastItem[]
  windUnit?: 'km/h' | 'mph' | 'm/s'
  isLoading?: boolean
}

/** Slim top accent per risk level — quieter than tinting the whole tile. */
const ACCENT: Record<RiskLevel, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MODERATE: 'bg-amber-400',
  LOW: 'bg-emerald-500/70',
}

const LABEL: Record<RiskLevel, string> = {
  CRITICAL: 'text-red-300',
  HIGH: 'text-orange-300',
  MODERATE: 'text-amber-300',
  LOW: 'text-slate-400',
}

const HourlyForecastBarComponent: React.FC<HourlyForecastBarProps> = ({
  hourly,
  windUnit = 'km/h',
  isLoading = false,
}) => {
  const [viewCount, setViewCount] = useState<6 | 12 | 24>(6)

  if (isLoading || !hourly || hourly.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 animate-pulse">
        <div className="flex items-center justify-between border-b border-slate-800/70 pb-3.5">
          <div className="h-4 w-44 bg-slate-800 rounded" />
          <div className="h-7 w-28 bg-slate-950/70 rounded-lg" />
        </div>
        <div className="mt-4 grid grid-flow-col auto-cols-[minmax(104px,1fr)] gap-2.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[128px] rounded-xl bg-slate-950/50 border border-slate-800/60" />
          ))}
        </div>
      </div>
    )
  }

  const items = hourly.slice(0, viewCount)

  const formatWind = (kmh: number) => {
    if (windUnit === 'mph') return `${Math.round(kmh * 0.621371)}`
    if (windUnit === 'm/s') return `${(kmh / 3.6).toFixed(0)}`
    return `${Math.round(kmh)}`
  }

  const getHourIcon = (code: number) => {
    if (code >= 95) return CloudLightning
    if (code >= 51 && code <= 82) return CloudRain
    if (code === 0) return Sun
    if (code === 1 || code === 2) return CloudSun
    return Cloud
  }

  return (
    <section
      aria-label="Hourly outlook"
      className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800/70 pb-3.5">
        <h3 className="text-sm font-semibold tracking-tight text-slate-200">
          Hourly outlook <span className="font-normal text-slate-500">· next {viewCount}h</span>
        </h3>

        <div
          className="flex items-center rounded-lg border border-slate-800 bg-slate-950/70 p-0.5 text-xs font-medium"
          role="group"
          aria-label="Forecast window"
        >
          {([6, 12, 24] as const).map((n) => (
            <button
              key={n}
              id={`view-${n}h-btn`}
              onClick={() => setViewCount(n)}
              aria-pressed={viewCount === n}
              className={`rounded-md px-2.5 py-1 tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 outline-none ${
                viewCount === n
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {n}h
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar mt-4 grid grid-flow-col auto-cols-[minmax(104px,1fr)] gap-2.5 overflow-x-auto pb-1">
        {items.map((item, idx) => {
          const date = new Date(item.time)
          const timeStr = date.toLocaleTimeString([], { hour: 'numeric' })
          const HourIcon = getHourIcon(item.weatherCode)
          const flagged = item.riskLevel === 'HIGH' || item.riskLevel === 'CRITICAL'

          return (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-xl border p-3 pt-3.5 text-center transition-colors ${
                flagged
                  ? 'border-slate-700/80 bg-slate-950/70'
                  : 'border-slate-800/60 bg-slate-950/50 hover:border-slate-700/70'
              }`}
            >
              <span
                className={`absolute inset-x-0 top-0 h-0.5 ${ACCENT[item.riskLevel]}`}
                aria-hidden="true"
              />

              <div className="text-[11px] font-medium tabular-nums text-slate-400">{timeStr}</div>

              <HourIcon className="mx-auto mt-2 h-5 w-5 text-slate-500" aria-hidden="true" />

              <div className="mt-2 text-lg font-semibold tabular-nums tracking-tight text-slate-100">
                {Math.round(item.temperature)}°
              </div>

              <div
                className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider ${LABEL[item.riskLevel]}`}
              >
                {item.riskLevel}
              </div>

              <div className="mt-2.5 space-y-1 border-t border-slate-800/60 pt-2 text-[11px] tabular-nums">
                <div className="flex items-center justify-between gap-1" title="Sustained wind / peak gust">
                  <Wind className="h-3 w-3 shrink-0 text-slate-600" />
                  <span className="text-slate-400">
                    {formatWind(item.windSpeed)}
                    <span className="text-slate-600"> / </span>
                    <span
                      className={item.windGusts >= 45 ? 'font-semibold text-orange-300' : 'text-slate-300'}
                    >
                      {formatWind(item.windGusts)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1" title="Rain probability">
                  <CloudRain className="h-3 w-3 shrink-0 text-slate-600" />
                  <span className={item.rainProbability > 40 ? 'font-medium text-sky-300' : 'text-slate-500'}>
                    {Math.round(item.rainProbability)}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const HourlyForecastBar = React.memo(HourlyForecastBarComponent)
