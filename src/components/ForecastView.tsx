import React, { useState } from 'react'
import { Calendar, Wind, CloudRain, Sun, Thermometer, TrendingUp, ChevronRight } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts'
import { HourlyForecastItem, DailyForecastItem, RiskLevel } from '../types'

interface ForecastViewProps {
  hourly: HourlyForecastItem[]
  daily: DailyForecastItem[]
  locationName: string
}

export const ForecastView: React.FC<ForecastViewProps> = ({ hourly, daily, locationName }) => {
  const [chartMode, setChartMode] = useState<'wind' | 'rain' | 'temp'>('wind')

  const chartData = hourly.slice(0, 36).map((item) => {
    const d = new Date(item.time)
    return {
      time: d.toLocaleTimeString([], { hour: 'numeric' }),
      windSpeed: Math.round(item.windSpeed),
      windGusts: Math.round(item.windGusts),
      rainProb: Math.round(item.rainProbability),
      rainAmount: Number(item.precipitation.toFixed(1)),
      temp: Math.round(item.temperature),
      uv: item.uvIndex,
    }
  })

  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500 text-white'
      case 'HIGH':
        return 'bg-orange-500 text-slate-950 font-bold'
      case 'MODERATE':
        return 'bg-amber-400 text-slate-950 font-bold'
      case 'LOW':
      default:
        return 'bg-emerald-600 text-white'
    }
  }

  return (
    <div className="space-y-6">
      {/* Forecast Chart Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
                36-HOUR ATMOSPHERIC PROFILE
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{locationName} · Hourly High-Resolution Forecast</p>
          </div>

          {/* Chart selector */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setChartMode('wind')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                chartMode === 'wind'
                  ? 'bg-slate-800 text-orange-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Wind & Gusts</span>
            </button>
            <button
              onClick={() => setChartMode('rain')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                chartMode === 'rain'
                  ? 'bg-slate-800 text-sky-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CloudRain className="w-3.5 h-3.5" />
              <span>Precipitation</span>
            </button>
            <button
              onClick={() => setChartMode('temp')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                chartMode === 'temp'
                  ? 'bg-slate-800 text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Temperature</span>
            </button>
          </div>
        </div>

        {/* Chart Container */}
        <div className="h-64 sm:h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'wind' ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gustGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" km/h" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Area
                  type="monotone"
                  dataKey="windGusts"
                  name="Peak Gust (km/h)"
                  stroke="#f97316"
                  strokeWidth={2}
                  fill="url(#gustGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="windSpeed"
                  name="Sustained Wind (km/h)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#windGrad)"
                />
              </AreaChart>
            ) : chartMode === 'rain' ? (
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="rainProb" name="Rain Probability (%)" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="°C" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="temp"
                  name="Temperature (°C)"
                  stroke="#eab308"
                  strokeWidth={2}
                  fill="url(#tempGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 7-Day Forecast Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
          <Calendar className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
            7-DAY OUTLOOK & ESTIMATED RISK LEVEL
          </h3>
        </div>

        <div className="space-y-2.5">
          {daily.map((day, idx) => {
            const dateObj = new Date(day.date + 'T12:00:00')
            const dayName =
              idx === 0
                ? 'Today'
                : idx === 1
                  ? 'Tomorrow'
                  : dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

            return (
              <div
                key={day.date}
                className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 sm:w-48">
                  <div className="text-sm font-bold text-slate-200">{dayName}</div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${getRiskBadge(day.riskLevel)}`}
                  >
                    {day.riskLevel}
                  </span>
                </div>

                <div className="text-xs text-slate-400 sm:flex-1">{day.weatherDescription}</div>

                <div className="flex items-center gap-4 sm:gap-6 text-xs font-mono text-slate-300">
                  <div className="flex items-center gap-1.5" title="Max Wind Speed / Max Gust">
                    <Wind className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {Math.round(day.maxWindSpeed)} /{' '}
                      <strong className="text-orange-400">{Math.round(day.maxWindGust)} km/h</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5" title="Precipitation Probability & Sum">
                    <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {Math.round(day.rainProbability)}% ({day.precipitationSum.toFixed(1)}mm)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-bold" title="Min / Max Temperature">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {Math.round(day.minTemp)}° /{' '}
                      <span className="text-amber-400">{Math.round(day.maxTemp)}°C</span>
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
