import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  CloudRain,
  Copy,
  Download,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sun,
  Thermometer,
  Wind
} from 'lucide-react';
import { LocationItem, WeeklyPerformanceSummary } from '../types';
import { apiFetch } from '../utils/api';

interface PerformanceViewProps {
  location: LocationItem | null;
}

const fmt = (value: number | null, suffix = ''): string =>
  value === null || value === undefined || Number.isNaN(value) ? '—' : `${value}${suffix}`;

function buildShareText(s: WeeklyPerformanceSummary): string {
  const lines: string[] = [];
  lines.push(`WEEKLY PERFORMANCE SUMMARY — ${s.locationName}`);
  lines.push(`Window: last ${s.windowDays} days · Generated ${new Date(s.generatedAt).toLocaleString()}`);
  lines.push('');
  lines.push('HIGHLIGHTS');
  s.highlights.forEach((h) => lines.push(`- ${h}`));
  lines.push('');
  lines.push('MONITORING RELIABILITY');
  lines.push(`- Status: ${s.monitoring.status} (${s.monitoring.enabled ? 'monitoring enabled' : 'monitoring disabled'})`);
  lines.push(`- Cycle interval: ${s.monitoring.intervalMinutes} min`);
  lines.push(`- Observations recorded: ${s.monitoring.observations} of ~${s.monitoring.expectedObservations} (coverage ${s.monitoring.coveragePct}%)`);
  lines.push(`- Monitor runs: ${s.monitoring.runsTotal} total, ${s.monitoring.runsSucceeded} succeeded, ${s.monitoring.runsFailed} failed (success ${s.monitoring.successRatePct}%)`);
  lines.push('');
  lines.push('OBSERVED CONDITIONS');
  lines.push(`- Temperature: max ${fmt(s.conditions.maxTempC, '°C')} / min ${fmt(s.conditions.minTempC, '°C')}`);
  lines.push(`- Peak gust: ${fmt(s.conditions.peakGustKmh, ' km/h')} · Average wind: ${fmt(s.conditions.avgWindKmh, ' km/h')}`);
  lines.push(`- Total rainfall: ${s.conditions.totalRainMm} mm · Max UV: ${fmt(s.conditions.maxUvIndex)}`);
  lines.push('');
  lines.push('ALERTS');
  lines.push(`- Total raised: ${s.alerts.total} (severe HIGH/CRITICAL: ${s.alerts.severe}, still active: ${s.alerts.open})`);
  lines.push(
    `- By severity: Critical ${s.alerts.bySeverity.CRITICAL}, High ${s.alerts.bySeverity.HIGH}, Moderate ${s.alerts.bySeverity.MODERATE}, Information ${s.alerts.bySeverity.INFORMATION}`
  );
  if (s.alerts.byType.length) {
    lines.push(`- By type: ${s.alerts.byType.map((t) => `${t.type} (${t.count})`).join(', ')}`);
  }
  return lines.join('\n');
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ location }) => {
  const [summary, setSummary] = useState<WeeklyPerformanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/reports/weekly${location ? `?locationId=${location.id}` : ''}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setSummary(await res.json());
    } catch (err: any) {
      setError(err?.message || 'Unable to build the performance summary.');
    } finally {
      setIsLoading(false);
    }
  }, [location]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(buildShareText(summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Clipboard access was blocked by the browser.');
    }
  };

  const handleDownload = () => {
    if (!summary) return;
    const blob = new Blob([buildShareText(summary)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-performance-${(location?.name || 'site').replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !summary) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="h-8 w-72 rounded bg-slate-800/60 animate-pulse" />
        <div className="h-40 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        <div className="h-32 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="animate-fadeIn bg-slate-900 border border-red-900/50 rounded-xl p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm text-slate-300">{error}</p>
        <button
          type="button"
          onClick={fetchSummary}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium border border-slate-700 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const m = summary.monitoring;
  const c = summary.conditions;

  const severityRows: { key: keyof typeof summary.alerts.bySeverity; label: string; className: string }[] = [
    { key: 'CRITICAL', label: 'Critical', className: 'text-red-300' },
    { key: 'HIGH', label: 'High', className: 'text-orange-300' },
    { key: 'MODERATE', label: 'Moderate', className: 'text-amber-300' },
    { key: 'INFORMATION', label: 'Info', className: 'text-slate-300' }
  ];

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-400" />
            Weekly Performance Summary
          </h2>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            {summary.locationName} · last {summary.windowDays} days · generated {new Date(summary.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={fetchSummary}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Highlights */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-amber-400" /> Highlights
        </h3>
        <ul className="space-y-2 text-sm text-slate-300">
          {summary.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 leading-relaxed">
              <span className="text-amber-400 mt-0.5">›</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monitoring reliability */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Monitoring Reliability
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Status" value={m.status} tone={m.status === 'ACTIVE' ? 'good' : m.status === 'ERROR' ? 'bad' : 'muted'} />
            <Metric label="Cycle" value={`${m.intervalMinutes} min`} />
            <Metric label="Data coverage" value={`${m.coveragePct}%`} tone={m.coveragePct >= 80 ? 'good' : m.coveragePct >= 50 ? 'warn' : 'bad'} />
            <Metric label="Run success" value={`${m.successRatePct}%`} tone={m.successRatePct >= 90 ? 'good' : m.successRatePct >= 60 ? 'warn' : 'bad'} />
            <Metric label="Observations" value={`${m.observations} / ~${m.expectedObservations}`} />
            <Metric label="Runs (ok / fail)" value={`${m.runsSucceeded} / ${m.runsFailed}`} tone={m.runsFailed > 0 ? 'warn' : 'good'} />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-slate-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last: {m.lastCheckTime ? new Date(m.lastCheckTime).toLocaleString() : '—'}</span>
            <span>Next: {m.nextCheckTime ? new Date(m.nextCheckTime).toLocaleTimeString() : '—'}</span>
            {m.consecutiveFailures > 0 && <span className="text-red-400">Consecutive failures: {m.consecutiveFailures}</span>}
          </div>
        </div>

        {/* Observed conditions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
            <Wind className="w-4 h-4 text-cyan-400" /> Observed Conditions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Peak gust" value={fmt(c.peakGustKmh, ' km/h')} icon={<Wind className="w-3.5 h-3.5" />} tone={(c.peakGustKmh ?? 0) >= 55 ? 'bad' : (c.peakGustKmh ?? 0) >= 45 ? 'warn' : 'good'} />
            <Metric label="Avg wind" value={fmt(c.avgWindKmh, ' km/h')} icon={<Wind className="w-3.5 h-3.5" />} />
            <Metric label="Max temp" value={fmt(c.maxTempC, '°C')} icon={<Thermometer className="w-3.5 h-3.5" />} />
            <Metric label="Min temp" value={fmt(c.minTempC, '°C')} icon={<Thermometer className="w-3.5 h-3.5" />} />
            <Metric label="Total rainfall" value={`${c.totalRainMm} mm`} icon={<CloudRain className="w-3.5 h-3.5" />} />
            <Metric label="Max UV" value={fmt(c.maxUvIndex)} icon={<Sun className="w-3.5 h-3.5" />} />
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-400" /> Alert Activity
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Metric label="Total raised" value={String(summary.alerts.total)} />
          <Metric label="Severe (H/C)" value={String(summary.alerts.severe)} tone={summary.alerts.severe > 0 ? 'bad' : 'good'} />
          <Metric label="Still active" value={String(summary.alerts.open)} tone={summary.alerts.open > 0 ? 'warn' : 'good'} />
          <Metric label="Last alert" value={summary.alerts.lastTriggeredAt ? new Date(summary.alerts.lastTriggeredAt).toLocaleDateString() : '—'} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">By severity</div>
            <div className="space-y-1.5">
              {severityRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${row.className}`}>{row.label}</span>
                  <span className="font-mono text-slate-400">{summary.alerts.bySeverity[row.key]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Top types</div>
            {summary.alerts.byType.length === 0 ? (
              <p className="text-xs text-slate-500">No alerts recorded in this window.</p>
            ) : (
              <div className="space-y-1.5">
                {summary.alerts.byType.map((t) => (
                  <div key={t.type} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{t.type}</span>
                    <span className="font-mono text-slate-400">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 font-mono">
        On-screen replacement for the scheduled weekly digest. Email delivery is not available in the static (GitHub Pages) build.
      </p>
    </div>
  );
};

const TONE_CLASSES: Record<string, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-red-300',
  muted: 'text-slate-300'
};

const Metric: React.FC<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'muted'; icon?: React.ReactNode }> = ({
  label,
  value,
  tone = 'muted',
  icon
}) => (
  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
      {icon}
      {label}
    </div>
    <div className={`text-sm font-bold font-mono ${TONE_CLASSES[tone]}`}>{value}</div>
  </div>
);
