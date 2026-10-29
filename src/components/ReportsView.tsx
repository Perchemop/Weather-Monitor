import React from 'react'
import { FileText, Printer, Download, HardHat, CheckCircle2, ShieldAlert } from 'lucide-react'
import { LocationItem, CurrentWeather, RiskAssessment, AlertItem } from '../types'
import { toCsv } from '../utils/csv'

interface ReportsViewProps {
  location: LocationItem | null
  current: CurrentWeather | null
  risk: RiskAssessment | null
  alerts: AlertItem[]
}

export const ReportsView: React.FC<ReportsViewProps> = ({ location, current, risk, alerts }) => {
  const handlePrint = () => {
    window.print()
  }

  const handleExportCSV = () => {
    if (!current || !location) return
    const rows = [
      ['Report', 'Construction Weather Risk Assessment Report'],
      ['Generated', new Date().toISOString()],
      ['Location', location.name],
      ['Coordinates', `${location.latitude}, ${location.longitude}`],
      ['Risk Level', risk?.level || 'N/A'],
      ['Risk Score', `${risk?.score || 0}/100`],
      ['Risk Summary', risk?.summary || ''],
      ['Peak Period', risk?.peakPeriod ? `${risk.peakPeriod.start} - ${risk.peakPeriod.end}` : 'None'],
      ['Current Temperature', `${current.temperature}°C`],
      ['Feels Like', `${current.feelsLike}°C`],
      ['Wind Speed', `${current.windSpeed} km/h`],
      ['Wind Gusts', `${current.windGusts} km/h`],
      ['Precipitation Rate', `${current.rainAmount} mm/h`],
      ['Precipitation Probability', `${current.rainProbability}%`],
      ['UV Index', `${current.uvIndex}`],
      ['Condition', current.weatherDescription],
      ['Active Alerts Count', `${alerts.length}`],
    ]

    // A Blob download (not a data: URI) so commas, hashes and percent signs in
    // the report text survive intact.
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `weather-risk-report-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              SITE WEATHER RISK REPORT
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Formal compliance and SWMS audit documentation based on verified meteorological data
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-bold text-slate-950 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Formal Printable Document Layout */}
      <div
        id="printable-report"
        className="bg-white text-slate-900 rounded-xl p-8 shadow-md border border-slate-200 font-sans print:shadow-none print:border-none"
      >
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500">
              Site Safety & Weather Compliance Record
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-1">
              CONSTRUCTION WEATHER RISK REPORT
            </h1>
            <div className="text-sm text-slate-600 mt-1">
              Monitored Site: <strong>{location?.name || 'Site Location'}</strong>
            </div>
          </div>

          <div className="text-right text-xs font-mono text-slate-500">
            <div>Report Date: {new Date().toLocaleDateString()}</div>
            <div>Generated: {new Date().toLocaleTimeString()}</div>
            <div className="text-slate-400 text-[11px] mt-1">System: Private Local CWM Engine</div>
          </div>
        </div>

        {/* Primary Risk Status Callout */}
        <div className="bg-slate-50 border border-slate-300 rounded-lg p-5 mb-6">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
            Current Risk Assessment
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {risk ? risk.level : 'LOW'} WEATHER RISK
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-200 font-bold">
              Score: {risk?.score || 0} / 100
            </span>
          </div>
          <p className="text-sm text-slate-700 mt-2 font-medium">
            {risk?.summary || 'Atmospheric parameters within typical baseline margins.'}
          </p>
          {risk?.peakPeriod && (
            <div className="text-xs font-mono text-amber-700 font-semibold mt-2">
              Expected Peak Window: {risk.peakPeriod.start} – {risk.peakPeriod.end} ({risk.peakPeriod.metric})
            </div>
          )}
        </div>

        {/* Current Observations Grid */}
        <div className="mb-6">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-200 pb-1">
            Site Observations at Generation
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm font-mono">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-slate-500">Sustained Wind</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {current ? `${Math.round(current.windSpeed)} km/h` : '—'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-slate-500">Peak Gusts</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {current ? `${Math.round(current.windGusts)} km/h` : '—'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-slate-500">Precipitation</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {current
                  ? `${current.rainAmount.toFixed(1)} mm/h (${Math.round(current.rainProbability)}%)`
                  : '—'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-slate-500">Temperature</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {current ? `${Math.round(current.temperature)}°C` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Construction Activity Risk Matrix */}
        <div className="mb-6">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-200 pb-1">
            Construction Activities Risk Analysis
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600 font-mono">
                <th className="py-2">Activity</th>
                <th className="py-2">Evaluated Risk</th>
                <th className="py-2">Safety Rationale</th>
                <th className="py-2">Operating Threshold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {risk?.affectedActivities.map((act) => (
                <tr key={act.activity}>
                  <td className="py-2.5 font-bold">{act.activity}</td>
                  <td className="py-2.5 font-mono font-semibold">{act.riskLevel}</td>
                  <td className="py-2.5 text-slate-600 pr-2">{act.reason}</td>
                  <td className="py-2.5 font-mono text-slate-500">{act.thresholdDetails}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Active Alerts */}
        <div className="mb-6">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-200 pb-1">
            Active Threshold Breaches & Alerts ({alerts.length})
          </h2>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500 font-mono">No active threshold alerts recorded.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="p-3 bg-red-50 border border-red-200 rounded text-xs">
                  <span className="font-bold text-red-800 uppercase font-mono">
                    {a.severity}: {a.title}
                  </span>
                  <p className="text-slate-700 mt-1">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mandatory Safety Notice & Signoff */}
        <div className="pt-6 border-t-2 border-slate-200">
          <div className="bg-slate-50 p-4 rounded border border-slate-200 text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Mandatory Safety Advisory: </strong>
            Review applicable site procedures, SWMS, equipment requirements and manufacturer limits. The
            system is a weather-risk monitoring tool. It is not a replacement for professional safety
            judgement.
          </div>

          <div className="mt-8 pt-4 grid grid-cols-2 gap-8 text-xs font-mono text-slate-500">
            <div>
              <div className="border-b border-slate-300 pb-1 mb-1 font-bold text-slate-700">
                Site Supervisor / Reviewer Sign-off:
              </div>
              <div className="pt-6 text-[11px] text-slate-400">Signature & Date</div>
            </div>
            <div className="text-right">
              <div>Data Provider: Open-Meteo Operational Meteorological Service</div>
              <div>Report ID: REP-{Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
