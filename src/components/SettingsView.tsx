import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  RotateCcw,
  Mail,
  Send,
  Sliders,
  Shield,
  Clock,
  Lock,
  CheckCircle2,
  AlertCircle,
  Database,
  Key,
  ShieldCheck,
  Trash2,
  Download,
  Archive,
  RefreshCw,
  HardHat
} from 'lucide-react';
import { OwnerSettings, RiskThresholds, SecretsStatus } from '../types';
import { useToast } from './ToastProvider';

interface SettingsViewProps {
  onSettingsSaved?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsSaved }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'general' | 'thresholds' | 'monitoring' | 'smtp' | 'storage' | 'security'>('general');
  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<SecretsStatus | null>(null);
  const [retentionRunning, setRetentionRunning] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [backups, setBackups] = useState<{ filename: string; size: number; createdAt: string }[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Confirmation modal state (replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Password change form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Authorized API helper
  const apiFetch = (url: string, init?: RequestInit) => {
    const token = localStorage.getItem('cwm_session_token');
    const headers = new Headers(init?.headers || {});
    if (token) {
      headers.set('x-session-token', token);
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...init, headers });
  };

  useEffect(() => {
    fetchSettings();
    fetchBackups();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await apiFetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSmtpConfigured(data.smtpConfigured);
        setNewEmail(data.settings.ownerEmail);
      }

      const secRes = await apiFetch('/api/secrets/status');
      if (secRes.ok) {
        const secData = await secRes.json();
        setSecretsStatus(secData);
      }
    } catch {
      toast.error('Failed to load system settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await apiFetch('/api/data/backup/list');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch {}
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await apiFetch('/api/data/backup/create', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Backup created: ${data.filename}`);
        fetchBackups();
      } else {
        toast.error(data.error || 'Failed to create backup.');
      }
    } catch {
      toast.error('Connection error creating backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRunRetention = async () => {
    setRetentionRunning(true);
    setRetentionMessage(null);
    try {
      const res = await apiFetch('/api/data/retention/run', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const msg = `Pruned: ${data.result.deletedObservations} observations, ${data.result.deletedAlerts} alerts, ${data.result.deletedSnapshots} snapshots.`;
        setRetentionMessage(msg);
        toast.success(msg);
      } else {
        toast.error(data.error || 'Failed to run retention cleanup.');
      }
    } catch {
      toast.error('Failed to execute retention cleanup.');
    } finally {
      setRetentionRunning(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        toast.success('Owner configuration and thresholds updated.');
        if (onSettingsSaved) onSettingsSaved();
      } else {
        toast.error('Failed to save settings.');
      }
    } catch {
      toast.error('Network error saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefaultsConfirm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Restore Default Thresholds?',
      message: 'This will reset all wind, gust, rain, heat, and UV safety limits and monitoring intervals back to the construction standard baseline.',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch('/api/settings/restore-defaults', { method: 'POST' });
          if (res.ok) {
            await fetchSettings();
            toast.success('Safety thresholds restored to system defaults.');
            if (onSettingsSaved) onSettingsSaved();
          } else {
            toast.error('Failed to restore default settings.');
          }
        } catch {
          toast.error('Connection error restoring defaults.');
        }
      }
    });
  };

  const handleClearDataConfirm = (target: 'cache' | 'history' | 'all') => {
    const titles = {
      cache: 'Clear Cached Forecast Data?',
      history: 'Wipe Historical Observations?',
      all: 'Complete Database Wipe?'
    };
    const messages = {
      cache: 'Cached forecast snapshots will be purged. Real-time data will re-fetch on the next cycle.',
      history: 'All past logged weather observations in SQLite will be permanently erased. Active settings and alerts will be kept.',
      all: 'ALL observations, alerts, delivery audits, and snapshots will be permanently wiped. This action is irreversible.'
    };

    setConfirmModal({
      isOpen: true,
      title: titles[target],
      message: messages[target],
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch('/api/data/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target })
          });
          if (res.ok) {
            toast.success(`Data cleared: ${target.toUpperCase()}`);
            if (onSettingsSaved) onSettingsSaved();
          } else {
            toast.error('Failed to clear data.');
          }
        } catch {
          toast.error('Error clearing data.');
        }
      }
    });
  };

  const handleTestEmail = async () => {
    if (!settings?.ownerEmail) return;
    setIsTestingEmail(true);
    toast.info('Dispatching test notification email...');
    try {
      const res = await apiFetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: settings.ownerEmail })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Test email dispatched successfully.');
      } else {
        toast.error(data.error || 'Failed to dispatch test email.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'SMTP connection failed.');
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, newEmail })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Master supervisor password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || 'Failed to update master password.');
      }
    } catch {
      toast.error('Failed to update password.');
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm animate-pulse">
        Loading safety enclave configuration...
      </div>
    );
  }

  const updateThreshold = (key: keyof RiskThresholds, val: number) => {
    setSettings({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        [key]: val
      }
    });
  };

  const tabs = [
    { id: 'general', label: 'General & Units', icon: Sliders },
    { id: 'thresholds', label: 'Safety Thresholds', icon: Shield },
    { id: 'monitoring', label: 'Cycle & Alerts', icon: Clock },
    { id: 'smtp', label: 'Email Gateway', icon: Mail },
    { id: 'storage', label: 'Storage & Backup', icon: Database },
    { id: 'security', label: 'Security & Auth', icon: Lock }
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              SAFETY ENCLAVE & CALIBRATION SETTINGS
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure onsite microclimate risk thresholds, autonomous monitoring intervals, and database hygiene.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestoreDefaultsConfirm}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-slate-800 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. General & Units Tab */}
      {activeTab === 'general' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-mono font-bold uppercase text-slate-300 border-b border-slate-800 pb-3">
              SITE OWNER & DISPLAY PREFERENCES
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Supervisor Display Name:</label>
                <input
                  type="text"
                  value={settings.ownerName}
                  onChange={(e) => setSettings({ ...settings, ownerName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Alert Destination Email:</label>
                <input
                  type="email"
                  value={settings.ownerEmail}
                  onChange={(e) => setSettings({ ...settings, ownerEmail: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Temperature Unit:</label>
                <select
                  value={settings.temperatureUnit}
                  onChange={(e) => setSettings({ ...settings, temperatureUnit: e.target.value as 'C' | 'F' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="C">Celsius (°C) — Construction Standard</option>
                  <option value="F">Fahrenheit (°F)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Wind Speed & Gust Unit:</label>
                <select
                  value={settings.windUnit}
                  onChange={(e) => setSettings({ ...settings, windUnit: e.target.value as 'km/h' | 'mph' | 'm/s' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="km/h">Kilometers per hour (km/h) — Crane standard</option>
                  <option value="mph">Miles per hour (mph)</option>
                  <option value="m/s">Meters per second (m/s) — Metric anemometer</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Safety Thresholds Tab */}
      {activeTab === 'thresholds' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                CRANE & HIGH-RISK THRESHOLD LIMITS
              </h4>
              <span className="text-2xs font-mono text-slate-500">AS 2550.1 / Crane Safe Envelopes</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-mono">
              {/* Wind Speed Limits */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-bold text-slate-200 text-sm flex items-center justify-between">
                  <span>Sustained Wind Limits</span>
                  <span className="text-amber-400">{settings.windUnit}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-400">
                    <span>Warning Level (Amber):</span>
                    <strong className="text-slate-200">{settings.thresholds.windWarning} {settings.windUnit}</strong>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="80"
                    value={settings.thresholds.windWarning}
                    onChange={(e) => updateThreshold('windWarning', Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />

                  <div className="flex justify-between text-slate-400 pt-2">
                    <span>High Risk Limit:</span>
                    <strong className="text-orange-400">{settings.thresholds.windHigh} {settings.windUnit}</strong>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="90"
                    value={settings.thresholds.windHigh}
                    onChange={(e) => updateThreshold('windHigh', Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />

                  <div className="flex justify-between text-slate-400 pt-2">
                    <span>Critical Stop-Work:</span>
                    <strong className="text-red-400">{settings.thresholds.windCritical} {settings.windUnit}</strong>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="110"
                    value={settings.thresholds.windCritical}
                    onChange={(e) => updateThreshold('windCritical', Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                </div>
              </div>

              {/* Gust Limits */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-bold text-slate-200 text-sm flex items-center justify-between">
                  <span>Instantaneous Gust Limits</span>
                  <span className="text-orange-400">{settings.windUnit}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-400">
                    <span>Gust Warning:</span>
                    <strong className="text-slate-200">{settings.thresholds.gustWarning} {settings.windUnit}</strong>
                  </div>
                  <input
                    type="range"
                    min="25"
                    max="90"
                    value={settings.thresholds.gustWarning}
                    onChange={(e) => updateThreshold('gustWarning', Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />

                  <div className="flex justify-between text-slate-400 pt-2">
                    <span>Gust High Risk (MEWP/Scaffold):</span>
                    <strong className="text-orange-400">{settings.thresholds.gustHigh} {settings.windUnit}</strong>
                  </div>
                  <input
                    type="range"
                    min="35"
                    max="100"
                    value={settings.thresholds.gustHigh}
                    onChange={(e) => updateThreshold('gustHigh', Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />

                  <div className="flex justify-between text-slate-400 pt-2">
                    <span>Critical Gust Limit:</span>
                    <strong className="text-red-400">{settings.thresholds.gustCritical} {settings.windUnit}</strong>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="130"
                    value={settings.thresholds.gustCritical}
                    onChange={(e) => updateThreshold('gustCritical', Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                </div>
              </div>

              {/* Rain Limits */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-bold text-slate-200 text-sm">Precipitation & Rain Rate</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-400">
                    <span>Rain Probability Warning:</span>
                    <strong className="text-slate-200">{settings.thresholds.rainProbWarning}%</strong>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="90"
                    value={settings.thresholds.rainProbWarning}
                    onChange={(e) => updateThreshold('rainProbWarning', Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />

                  <div className="flex justify-between text-slate-400 pt-2">
                    <span>Rain Intensity Warning (mm/h):</span>
                    <strong className="text-slate-200">{settings.thresholds.rainAmountWarning} mm/h</strong>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={settings.thresholds.rainAmountWarning}
                    onChange={(e) => updateThreshold('rainAmountWarning', Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>

              {/* Thermal & Solar Limits */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-bold text-slate-200 text-sm">Thermal & Solar UV Safety</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-400">
                    <span>Heat Warning (°C):</span>
                    <strong className="text-slate-200">{settings.thresholds.heatWarning}°C</strong>
                  </div>
                  <input
                    type="range"
                    min="28"
                    max="45"
                    value={settings.thresholds.heatWarning}
                    onChange={(e) => updateThreshold('heatWarning', Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />

                  <div className="flex justify-between text-slate-400 pt-2">
                    <span>Heat Critical Stop-Work (°C):</span>
                    <strong className="text-red-400">{settings.thresholds.heatCritical}°C</strong>
                  </div>
                  <input
                    type="range"
                    min="32"
                    max="50"
                    value={settings.thresholds.heatCritical}
                    onChange={(e) => updateThreshold('heatCritical', Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Monitoring & Cycles Tab */}
      {activeTab === 'monitoring' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-mono font-bold uppercase text-slate-300 border-b border-slate-800 pb-3">
              AUTONOMOUS MONITORING SERVICE INTERVALS
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Monitoring Interval:</label>
                <select
                  value={settings.monitorIntervalMinutes}
                  onChange={(e) => setSettings({ ...settings, monitorIntervalMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value={5}>Every 5 Minutes (High-Risk Operation)</option>
                  <option value={10}>Every 10 Minutes</option>
                  <option value={15}>Every 15 Minutes (Standard Recommendation)</option>
                  <option value={30}>Every 30 Minutes</option>
                  <option value={60}>Every 60 Minutes (Low Overhead)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Alert Re-notification Cooldown:</label>
                <select
                  value={settings.alertCooldownMinutes}
                  onChange={(e) => setSettings({ ...settings, alertCooldownMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailAlertsEnabled}
                  onChange={(e) => setSettings({ ...settings, emailAlertsEnabled: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs font-mono text-slate-200">
                  Enable Automated Email Dispatches when Thresholds are Breached
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.recoveryNotificationsEnabled}
                  onChange={(e) => setSettings({ ...settings, recoveryNotificationsEnabled: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs font-mono text-slate-200">
                  Send All-Clear Recovery Notifications when Weather Returns to Safe Limits
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 4. SMTP Email Gateway Tab */}
      {activeTab === 'smtp' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                EMAIL NOTIFICATION GATEWAY
              </h4>
              <span
                className={`text-2xs font-mono px-2 py-0.5 rounded font-bold ${
                  smtpConfigured
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {smtpConfigured ? 'SMTP CONFIGURED' : 'SMTP NOT CONFIGURED'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-400 leading-relaxed space-y-2">
              <p>
                SMTP credentials (<code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code>) are read securely from the environment. Passwords remain isolated inside the server runtime and are never exposed or saved to SQLite.
              </p>
              <div className="text-slate-300">
                Current Host: <strong className="text-amber-400 font-mono">{secretsStatus?.smtpHost || 'None (Local test mode)'}</strong>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={isTestingEmail}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-amber-400" />
                <span>{isTestingEmail ? 'Sending Test Notification...' : 'Send Test Notification Email Now'}</span>
              </button>
            </div>
          </div>

          {/* Secrets Enclave Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                  CREDENTIALS & ENVIRONMENT SECRETS ENCLAVE
                </h4>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Protected Server-Side
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-slate-400 text-2xs">WEATHER API KEY</div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${secretsStatus?.weatherApiKeyConfigured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-slate-200 font-bold">
                    {secretsStatus?.weatherApiKeyConfigured ? secretsStatus.weatherApiKeyMasked : 'Not Configured'}
                  </span>
                </div>
                <div className="text-2xs text-slate-500">Auto-falls back to Open-Meteo</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-slate-400 text-2xs">SMTP EMAIL GATEWAY</div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${secretsStatus?.smtpConfigured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-slate-200 font-bold truncate">
                    {secretsStatus?.smtpConfigured ? secretsStatus.smtpHost : 'Not Configured'}
                  </span>
                </div>
                <div className="text-2xs text-slate-500">Pass: [PROTECTED SECRETS ENCLAVE]</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-slate-400 text-2xs">GEMINI AI REASONING</div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${secretsStatus?.geminiKeyConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-slate-200 font-bold">
                    {secretsStatus?.geminiKeyConfigured ? 'gemini-3.8-flash (Auto-Failover)' : 'Rule-Based Fallback'}
                  </span>
                </div>
                <div className="text-2xs text-slate-500">Auto-fails over on demand spikes • Risk limits preserved</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Storage & Backup Tab */}
      {activeTab === 'storage' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          {/* Backup Management Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                  SQLITE SNAPSHOT BACKUPS & DATA EXPORT
                </h4>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Auto 30m Rotation
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{creatingBackup ? 'Creating Snapshot...' : 'Create Snapshot Now'}</span>
              </button>

              <a
                href="/api/data/backup"
                download
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs font-bold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Download Live Database Binary</span>
              </a>
            </div>

            {/* Recent Backups List */}
            {backups.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-mono text-slate-400 font-bold">Recent Saved Snapshots:</div>
                <div className="divide-y divide-slate-800/80 bg-slate-950/60 rounded-lg border border-slate-800/80">
                  {backups.slice(0, 5).map((b) => (
                    <div key={b.filename} className="p-2.5 flex items-center justify-between text-2xs font-mono text-slate-300">
                      <span className="font-semibold text-slate-200">{b.filename}</span>
                      <div className="flex items-center gap-4 text-slate-500">
                        <span>{(b.size / 1024).toFixed(1)} KB</span>
                        <span>{new Date(b.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Retention Pruning */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                  AUTOMATED DATA RETENTION POLICIES
                </h4>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                24h Daily Pruning
              </span>
            </div>

            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              Pruning automatically drops historical logs older than retention thresholds to keep the SQLite database light and performant:
              Observations <strong>90 days</strong>, Cleared Alerts <strong>180 days</strong>, Forecast Snapshots <strong>30 days</strong>.
            </p>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <span className="text-2xs font-mono text-slate-500">
                {retentionMessage || 'Background cycle executes automatically every 24 hours.'}
              </span>
              <button
                type="button"
                onClick={handleRunRetention}
                disabled={retentionRunning}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>{retentionRunning ? 'Pruning Database...' : 'Run Retention Cleanup Now'}</span>
              </button>
            </div>
          </div>

          {/* Dangerous Actions Card */}
          <div className="bg-slate-900 border border-red-900/30 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-mono font-bold uppercase text-red-400 border-b border-red-950 pb-2">
              DANGER ZONE: DATA PURGING
            </h4>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleClearDataConfirm('cache')}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono transition-colors cursor-pointer"
              >
                Purge Forecast Cache
              </button>
              <button
                type="button"
                onClick={() => handleClearDataConfirm('history')}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono transition-colors cursor-pointer"
              >
                Clear Past Observations
              </button>
              <button
                type="button"
                onClick={() => handleClearDataConfirm('all')}
                className="px-3 py-2 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800 text-xs font-mono font-bold transition-colors cursor-pointer"
              >
                Wipe All Application Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Security & Master Password Tab */}
      {activeTab === 'security' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Lock className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                MASTER SUPERVISOR PASSWORD (SCRYPT MEMORY-HARD KDF)
              </h4>
            </div>

            <form onSubmit={handleChangePassword} className="max-w-md space-y-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Supervisor Email:</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Current Master Password:</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  placeholder="••••••••••••"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">New Password:</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="••••••••••••"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Confirm New Password:</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="mt-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors cursor-pointer"
              >
                Update Master Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal (safe for iframes) */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold transition-colors cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
