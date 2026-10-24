import React from 'react'
import { Wind, Droplets, CloudRain, Sun, Thermometer, CloudLightning, Cloud, CloudSun } from 'lucide-react'
import { CurrentWeather } from '../types'

interface CurrentConditionsProps {
  weather: CurrentWeather | null
  tempUnit?: 'C' | 'F'
  windUnit?: 'km/h' | 'mph' | 'm/s'
  isLoading?: boolean
}

const CurrentConditionsComponent: React.FC<CurrentConditionsProps> = ({
  weather,
  tempUnit = 'C',
  windUnit = 'km/h',
  isLoading = false,
}) => {
  if (isLoading || !weather) {
    return (
      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 animate-pulse">
        <div className="flex items-center justify-between border-b border-slate-800/70 pb-3.5">
          <div className="h-4 w-40 bg-slate-800 rounded" />
          <div className="h-3 w-24 bg-slate-800 rounded" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[92px] rounded-xl bg-slate-950/50 border border-slate-800/60" />
          ))}
        </div>
      </div>
    )
  }

  const formatTemp = (celsius: number) => {
    if (typeof celsius !== 'number' || isNaN(celsius)) return '—'
    if (tempUnit === 'F') return `${Math.round((celsius * 9) / 5 + 32)}°F`
    return `${Math.round(celsius)}°C`
  }

  const formatWind = (kmh: number) => {
    if (typeof kmh !== 'number' || isNaN(kmh)) return '—'
    if (windUnit === 'mph') return `${Math.round(kmh * 0.621371)}`
    if (windUnit === 'm/s') return `${(kmh / 3.6).toFixed(1)}`
    return `${Math.round(kmh)}`
  }

  const windSuffix = windUnit === 'mph' ? 'mph' : windUnit === 'm/s' ? 'm/s' : 'km/h'

  const getWeatherIcon = (code: number) => {
    if (code >= 95) return CloudLightning
    if (code >= 51 && code <= 82) return CloudRain
    if (code === 0) return Sun
    if (code === 1 || code === 2) return CloudSun
    return Cloud
  }

  const WeatherIcon = getWeatherIcon(weather.weatherCode)

  // Crane-operation ceiling (deterministic engine flags gusts from 45 km/h):
  // tint the gust value only when it is approaching or above that envelope so
  // the number itself carries the warning instead of a permanent label.
  const gustElevated = weather.windGusts >= 45
  const gustApproaching = !gustElevated && weather.windGusts >= 35

  const uvLabel =
    weather.uvIndex >= 11
      ? 'Extreme'
      : weather.uvIndex >= 8
        ? 'Very high'
        : weather.uvIndex >= 6
          ? 'High'
          : weather.uvIndex >= 3
            ? 'Moderate'
            : 'Low'

  const tiles = [
    {
      label: 'Wind gusts',
      icon: Wind,
      value: formatWind(weather.windGusts),
      unit: windSuffix,
      note: 'Peak instantaneous',
      valueClass: gustElevated ? 'text-orange-300' : gustApproaching ? 'text-amber-300' : 'text-slate-100',
    },
    {
      label: 'Sustained wind',
      icon: Wind,
      value: formatWind(weather.windSpeed),
      unit: windSuffix,
      note: '10 m height',
      valueClass: 'text-slate-100',
    },
    {
      label: 'Precipitation',
      icon: CloudRain,
      value: `${Math.round(weather.rainProbability)}%`,
      unit: '',
      note: `${weather.rainAmount.toFixed(1)} mm/h rate`,
      valueClass: 'text-slate-100',
    },
    {
      label: 'Temperature',
      icon: Thermometer,
      value: formatTemp(weather.temperature),
      unit: '',
      note: `Feels like ${formatTemp(weather.feelsLike)}`,
      valueClass: 'text-slate-100',
    },
    {
      label: 'UV index',
      icon: Sun,
      value: weather.uvIndex.toFixed(1),
      unit: '',
      note: uvLabel,
      valueClass: 'text-slate-100',
    },
    {
      label: 'Humidity',
      icon: Droplets,
      value: `${Math.round(weather.humidity)}%`,
      unit: '',
      note: `${Math.round(weather.pressure)} hPa`,
      valueClass: 'text-slate-100',
    },
  ]

  return (
    <section
      aria-label="Current onsite conditions"
      className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-800/70 pb-3.5">
        <h3 className="text-sm font-semibold tracking-tight text-slate-200">Current conditions</h3>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <WeatherIcon className="h-3.5 w-3.5 text-slate-500" />
          {weather.weatherDescription}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <div
              key={tile.label}
              className="rounded-xl border border-slate-800/60 bg-slate-950/50 p-3.5 transition-colors hover:border-slate-700/70"
            >
              <div className="flex items-center gap-1.5 text-slate-500">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px] font-medium leading-none">{tile.label}</span>
              </div>
              <div className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${tile.valueClass}`}>
                {tile.value}
                {tile.unit && <span className="ml-1 text-xs font-normal text-slate-500">{tile.unit}</span>}
              </div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{tile.note}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const CurrentConditions = React.memo(CurrentConditionsComponent)
