import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Wind, CloudRain, Thermometer, Database, Sparkles, RefreshCw, Download } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { CurrentWeather, LocationItem, AiHistoricalSummaryResponse } from '../types';

interface HistoricalViewProps {
  location: LocationItem | null;
}

export const HistoricalView: React.FC<HistoricalViewProps> = ({ location }) => {
  const [range, setRange] = useState<'today' | 'yesterday' | '7days' | '30days'>('today');
  const [observations, setObservations] = useState<CurrentWeather[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiHistoricalSummaryResponse | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (!location) return;
    fetchHistory(range);
  }, [location, range]);

  const fetchHistory = async (selectedRange: string) => {
    if (!location) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/weather/history?locationId=${location.id}&range=${selectedRange}`);
      if (res.ok) {
        const data = await res.json();
        setObservations(data.observations || []);
        fetchAiSummary(location.id, selectedRange);
      }
    } catch (err) {
      console.error('Failed to fetch historical observations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAiSummary = async (locationId: string, selectedRange: string) => {
    setLoadingAi(true);
    try {
      const res = await fetch(`/api/ai/history-summary?locationId=${locationId}&range=${selectedRange}`);
      if (res.ok) {
        const data: AiHistoricalSummaryResponse = await res.json();
        setAiSummary(data);
      }
    } catch (err) {
      console.warn('Failed to fetch AI history summary:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  const chartData = observations.map((obs) => {
    const d = new Date(obs.timestamp);
    const label =
      range === 'today' || range === 'yesterday'
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });

    return {
      time: label,
      temp: Math.round(obs.temperature),
      wind: Math.round(obs.windSpeed),
      gusts: Math.round(obs.windGusts),
      rain: obs.rainAmount
    };
  });

  const exportCsv = () => {
    if (observations.length === 0) return;
    const headers = [
      'Timestamp',
      'Temperature_C',
      'FeelsLike_C',
      'WindSpeed_kmh',
      'WindGusts_kmh',
      'RainAmount_mm',
      'RainProbability_pct',
      'Humidity_pct',
      'Pressure_hPa',
      'UV_Index',
      'Description'
    ];
    const rows = observations.map((o) => [
      o.timestamp,
      o.temperature,
      o.feelsLike,
      o.windSpeed,
      o.windGusts,
      o.rainAmount,
      o.rainProbability,
      o.humidity,
      o.pressure,
      o.uvIndex,
      `"${(o.weatherDescription || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weather-observations-${(location?.name || 'site').replace(/[^a-z0-9]/gi, '_')}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Controls Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              HISTORICAL ONSITE OBSERVATIONS (SQLITE)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Time range selector */}
            <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-xs font-mono">
              {(['today', 'yesterday', '7days', '30days'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 rounded transition-colors capitalize ${
                    range === r ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r === '7days' ? '7 Days' : r === '30days' ? '30 Days' : r}
                </button>
              ))}
            </div>

            {/* Export CSV button */}
            <button
              type="button"
              id="export-observations-csv-btn"
              onClick={exportCsv}
              disabled={observations.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-mono font-semibold text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
              title="Download observations as CSV"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Database className="w-3.5 h-3.5 text-slate-500" />
          <span>
            Querying actual verified records from local SQLite · {observations.length} observations found
          </span>
        </div>
      </div>

      {/* AI Historical Summary Card */}
      {observations.length > 0 && (
        <div id="ai-history-summary-card" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                AI Weather Trend Summary ({range.toUpperCase()})
              </h4>
            </div>
            <div className="flex items-center gap-2">
              {aiSummary && (
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                  {aiSummary.source === 'GEMINI_AI' ? 'Gemini 3.8 Flash' : 'Deterministic Rules'}
                </span>
              )}
              {location && (
                <button
                  onClick={() => fetchAiSummary(location.id, range)}
                  disabled={loadingAi}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  title="Refresh AI Trend Summary"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAi ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {loadingAi && !aiSummary ? (
            <div className="flex items-center gap-2 py-3 text-xs text-slate-400 font-mono">
              <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>Analyzing historical microclimate records...</span>
            </div>
          ) : aiSummary ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-slate-300">
                {aiSummary.summary}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-2xs font-mono text-slate-400 pt-2 border-t border-slate-800/80">
                <span>Peak Gust Observed: <strong className="text-orange-400">{aiSummary.peakGustObserved}</strong></span>
                <span>•</span>
                <span>Max Safety Tier: <strong className="text-amber-400">{aiSummary.highestRiskLevel}</strong></span>
                <span>•</span>
                <span>Generated: {new Date(aiSummary.generatedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {isLoading ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm">
          Loading historical database records...
        </div>
      ) : observations.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 font-mono text-sm">
          No historical observations recorded in SQLite for this timeframe yet.
          <br />
          <span className="text-xs text-slate-600">
            The local background monitoring service automatically logs observations every 15 minutes.
          </span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Charts */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h4 className="text-xs font-mono font-bold uppercase text-slate-400 mb-4">
              WIND & GUST TRENDS (KM/H)
            </h4>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="gusts" name="Peak Gusts" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="wind" name="Sustained Wind" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Observations Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
                LOGGED OBSERVATIONS TABLE
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Temp</th>
                    <th className="p-3">Wind</th>
                    <th className="p-3">Gusts</th>
                    <th className="p-3">Rain</th>
                    <th className="p-3">Humidity</th>
                    <th className="p-3">Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {observations.slice(-20).reverse().map((obs, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="p-3 whitespace-nowrap text-slate-400">
                        {new Date(obs.timestamp).toLocaleString()}
                      </td>
                      <td className="p-3 font-semibold text-amber-300">{Math.round(obs.temperature)}°C</td>
                      <td className="p-3">{Math.round(obs.windSpeed)} km/h</td>
                      <td className="p-3 text-orange-400 font-bold">{Math.round(obs.windGusts)} km/h</td>
                      <td className="p-3 text-sky-400">{obs.rainAmount.toFixed(1)} mm</td>
                      <td className="p-3">{Math.round(obs.humidity)}%</td>
                      <td className="p-3 text-slate-400">{obs.weatherDescription}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
