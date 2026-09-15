import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Wind, CloudRain, Thermometer, Database } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { CurrentWeather, LocationItem } from '../types';

interface HistoricalViewProps {
  location: LocationItem | null;
}

export const HistoricalView: React.FC<HistoricalViewProps> = ({ location }) => {
  const [range, setRange] = useState<'today' | 'yesterday' | '7days' | '30days'>('today');
  const [observations, setObservations] = useState<CurrentWeather[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
      }
    } catch (err) {
      console.error('Failed to fetch historical observations:', err);
    } finally {
      setIsLoading(false);
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
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Database className="w-3.5 h-3.5 text-slate-500" />
          <span>
            Querying actual verified records from local SQLite · {observations.length} observations found
          </span>
        </div>
      </div>

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
