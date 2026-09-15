import React, { useState } from 'react';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Cpu,
  Clock,
  Mail,
  ShieldCheck,
  Download,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { SystemHealth } from '../types';

interface SystemHealthViewProps {
  health: any;
  onRefreshHealth: () => void;
}

export const SystemHealthView: React.FC<SystemHealthViewProps> = ({
  health,
  onRefreshHealth
}) => {
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleClear = async (target: 'cache' | 'history' | 'all') => {
    const confirmMsg =
      target === 'all'
        ? 'Are you sure you want to clear ALL application records (alerts, observations, runs)?'
        : `Are you sure you want to clear ${target} data?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/data/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      if (res.ok) {
        setActionMessage(`Successfully cleared ${target} data.`);
        onRefreshHealth();
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch {
      setActionMessage('Failed to clear data.');
    }
  };

  const handleDownloadBackup = () => {
    window.location.href = '/api/data/backup';
  };

  if (!health) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm">
        Gathering local system diagnostics...
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Top Health Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              LOCAL SYSTEM DIAGNOSTICS & HEALTH
            </h3>
          </div>

          <button
            onClick={onRefreshHealth}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>

        {actionMessage && (
          <div className="mb-4 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
            {actionMessage}
          </div>
        )}

        {/* 4 Core Health Status Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Weather API */}
          <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">WEATHER ENGINE</div>
              <div className="text-sm font-bold text-slate-200 mt-1">WeatherAPI + Open-Meteo</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              <span>DUAL / ACTIVE</span>
            </div>
          </div>

          {/* SQLite Database */}
          <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">DATABASE</div>
              <div className="text-sm font-bold text-slate-200 mt-1">SQLite Local Engine</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-800">
              <Database className="w-4 h-4" />
              <span>{health.databaseStatus}</span>
            </div>
          </div>

          {/* Background Monitor */}
          <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">BACKGROUND MONITOR</div>
              <div className="text-sm font-bold text-slate-200 mt-1">Node.js Persistent Service</div>
            </div>
            <div
              className={`flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded border ${
                health.monitorStatus === 'ACTIVE'
                  ? 'text-emerald-400 bg-emerald-950/50 border-emerald-800'
                  : 'text-amber-400 bg-amber-950/50 border-amber-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{health.monitorStatus}</span>
            </div>
          </div>

          {/* Email SMTP */}
          <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">EMAIL ALERTS</div>
              <div className="text-sm font-bold text-slate-200 mt-1">SMTP Notification Engine</div>
            </div>
            <div
              className={`flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded border ${
                health.emailStatus === 'CONFIGURED'
                  ? 'text-emerald-400 bg-emerald-950/50 border-emerald-800'
                  : 'text-slate-400 bg-slate-900 border-slate-700'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>{health.emailStatus}</span>
            </div>
          </div>
        </div>

        {/* Runtime Metrics */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-slate-400">
          <div>
            <span className="text-slate-500">Last Check:</span>{' '}
            <span className="text-slate-200">
              {health.lastCheckTime ? new Date(health.lastCheckTime).toLocaleTimeString() : 'Pending'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Next Check:</span>{' '}
            <span className="text-slate-200">
              {health.nextCheckTime ? new Date(health.nextCheckTime).toLocaleTimeString() : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Service Uptime:</span>{' '}
            <span className="text-slate-200">{formatUptime(health.uptimeSeconds)}</span>
          </div>
          <div>
            <span className="text-slate-500">Node Memory:</span>{' '}
            <span className="text-slate-200">{health.memoryUsageMb} MB RSS</span>
          </div>
        </div>
      </div>

      {/* Monitor Runs History */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800">
          <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
            RECENT MONITORING RUN CYCLES
          </h4>
        </div>

        <div className="divide-y divide-slate-800/80 text-xs font-mono">
          {health.recentRuns?.length === 0 ? (
            <div className="p-6 text-center text-slate-500">No cycle records yet.</div>
          ) : (
            health.recentRuns?.map((run: any) => (
              <div key={run.id} className="p-3.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      run.status === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-500'
                    }`}
                  />
                  <span className="font-bold text-slate-200">Cycle {run.id.slice(0, 8)}</span>
                  {run.errorMessage && (
                    <span className="text-red-400 text-[11px] truncate max-w-xs sm:max-w-md">
                      — {run.errorMessage}
                    </span>
                  )}
                </div>
                <div className="text-slate-400">{new Date(run.startedAt).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800">
          <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
            SECURITY & SYSTEM AUDIT LOG
          </h4>
        </div>

        <div className="divide-y divide-slate-800/80 text-xs font-mono">
          {health.auditLogs?.length === 0 ? (
            <div className="p-6 text-center text-slate-500">No audit logs recorded.</div>
          ) : (
            health.auditLogs?.map((log: any) => (
              <div key={log.id} className="p-3.5 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-amber-400">{log.eventType}</span>
                  <span className="text-slate-300 ml-2">{log.details}</span>
                </div>
                <span className="text-slate-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Data Management & Backup Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="border-b border-slate-800 pb-3 mb-4">
          <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
            LOCAL DATA PRIVACY & SQLITE BACKUPS
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage locally stored records. No cloud databases are used.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download SQLite Backup</span>
          </button>

          <button
            onClick={() => handleClear('cache')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Clear Cached Forecasts</span>
          </button>

          <button
            onClick={() => handleClear('history')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Clear Observations History</span>
          </button>

          <button
            onClick={() => handleClear('all')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-red-950/40 hover:bg-red-950/70 text-xs font-mono font-bold text-red-400 border border-red-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe All Application Data</span>
          </button>
        </div>
      </div>
    </div>
  );
};
