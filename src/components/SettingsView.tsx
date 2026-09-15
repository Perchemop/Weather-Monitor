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
  AlertCircle
} from 'lucide-react';
import { OwnerSettings, RiskThresholds } from '../types';

interface SettingsViewProps {
  onSettingsSaved?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  // Password change form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSmtpConfigured(data.smtpConfigured);
        setNewEmail(data.settings.ownerEmail);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load settings.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Settings updated successfully.' });
        if (onSettingsSaved) onSettingsSaved();
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error saving settings.' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleRestoreDefaults = async () => {
    if (!window.confirm('Restore all risk thresholds and monitoring intervals to system defaults?')) return;
    try {
      const res = await fetch('/api/settings/restore-defaults', { method: 'POST' });
      if (res.ok) {
        await fetchSettings();
        setMessage({ type: 'success', text: 'Default thresholds and settings restored.' });
        if (onSettingsSaved) onSettingsSaved();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to restore defaults.' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleTestEmail = async () => {
    if (!settings?.ownerEmail) return;
    setIsTestingEmail(true);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: settings.ownerEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Test email dispatched successfully.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to dispatch test email.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'SMTP connection failed.' });
    } finally {
      setIsTestingEmail(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, newEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Password updated successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update password.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to change password.' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  if (isLoading || !settings) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm">
        Loading owner settings...
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

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              OWNER SETTINGS & RISK THRESHOLD CALIBRATION
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Single-owner configuration stored locally in SQLite and environment
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRestoreDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Defaults</span>
          </button>

          <button
            onClick={handleSaveSettings}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-bold text-slate-950 transition-colors shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-2 text-xs font-mono ${
            message.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-red-950/50 border-red-800 text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 1. Custom Risk Thresholds Calibration */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
          <Sliders className="w-4 h-4 text-amber-400" />
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
              CUSTOM WEATHER RISK THRESHOLDS
            </h4>
            <p className="text-[11px] text-slate-500 font-mono">
              Calibrate site parameters. These trigger deterministic risk levels and email notifications.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
          {/* Wind Speed */}
          <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <span className="font-bold text-slate-200">Sustained Wind (km/h)</span>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Warning Limit:</span>
                <span className="font-bold text-slate-200">{settings.thresholds.windWarning} km/h</span>
              </label>
              <input
                type="range"
                min="20"
                max="60"
                value={settings.thresholds.windWarning}
                onChange={(e) => updateThreshold('windWarning', Number(e.target.value))}
                className="w-full accent-amber-500 mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>High Risk Limit:</span>
                <span className="font-bold text-orange-400">{settings.thresholds.windHigh} km/h</span>
              </label>
              <input
                type="range"
                min="30"
                max="75"
                value={settings.thresholds.windHigh}
                onChange={(e) => updateThreshold('windHigh', Number(e.target.value))}
                className="w-full accent-orange-500 mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Critical Stop Limit:</span>
                <span className="font-bold text-red-400">{settings.thresholds.windCritical} km/h</span>
              </label>
              <input
                type="range"
                min="45"
                max="90"
                value={settings.thresholds.windCritical}
                onChange={(e) => updateThreshold('windCritical', Number(e.target.value))}
                className="w-full accent-red-500 mt-1"
              />
            </div>
          </div>

          {/* Wind Gusts */}
          <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <span className="font-bold text-slate-200">Wind Gusts (km/h)</span>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Warning Limit:</span>
                <span className="font-bold text-slate-200">{settings.thresholds.gustWarning} km/h</span>
              </label>
              <input
                type="range"
                min="30"
                max="70"
                value={settings.thresholds.gustWarning}
                onChange={(e) => updateThreshold('gustWarning', Number(e.target.value))}
                className="w-full accent-amber-500 mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>High Risk Limit:</span>
                <span className="font-bold text-orange-400">{settings.thresholds.gustHigh} km/h</span>
              </label>
              <input
                type="range"
                min="40"
                max="85"
                value={settings.thresholds.gustHigh}
                onChange={(e) => updateThreshold('gustHigh', Number(e.target.value))}
                className="w-full accent-orange-500 mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Critical Stop Limit:</span>
                <span className="font-bold text-red-400">{settings.thresholds.gustCritical} km/h</span>
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={settings.thresholds.gustCritical}
                onChange={(e) => updateThreshold('gustCritical', Number(e.target.value))}
                className="w-full accent-red-500 mt-1"
              />
            </div>
          </div>

          {/* Precipitation & Heat */}
          <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <span className="font-bold text-slate-200">Rain & Thermal</span>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Heavy Rain Rate:</span>
                <span className="font-bold text-sky-400">{settings.thresholds.rainAmountHigh} mm/h</span>
              </label>
              <input
                type="range"
                min="5"
                max="30"
                value={settings.thresholds.rainAmountHigh}
                onChange={(e) => updateThreshold('rainAmountHigh', Number(e.target.value))}
                className="w-full accent-sky-500 mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Heat Warning (°C):</span>
                <span className="font-bold text-amber-400">{settings.thresholds.heatWarning}°C</span>
              </label>
              <input
                type="range"
                min="30"
                max="45"
                value={settings.thresholds.heatWarning}
                onChange={(e) => updateThreshold('heatWarning', Number(e.target.value))}
                className="w-full accent-amber-500 mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400 flex justify-between">
                <span>Critical Heat Stop (°C):</span>
                <span className="font-bold text-red-400">{settings.thresholds.heatCritical}°C</span>
              </label>
              <input
                type="range"
                min="35"
                max="50"
                value={settings.thresholds.heatCritical}
                onChange={(e) => updateThreshold('heatCritical', Number(e.target.value))}
                className="w-full accent-red-500 mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Monitoring & Alert Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monitoring & Cooldown Config */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
              BACKGROUND MONITORING CYCLE
            </h4>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div>
              <label className="text-slate-300 block mb-1">Monitoring Interval:</label>
              <select
                value={settings.monitorIntervalMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, monitorIntervalMinutes: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              >
                <option value={5}>5 minutes (High frequency)</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes (Recommended Default)</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes (Hourly)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-300 block mb-1">
                Alert Cooldown (Suppresses Repeated Emails):
              </label>
              <select
                value={settings.alertCooldownMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, alertCooldownMinutes: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes (Standard)</option>
                <option value={120}>120 minutes (2 hours)</option>
              </select>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailAlertsEnabled}
                  onChange={(e) => setSettings({ ...settings, emailAlertsEnabled: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                />
                <span>Enable automatic email notifications for threshold breaches</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.recoveryNotificationsEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, recoveryNotificationsEnabled: e.target.checked })
                  }
                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                />
                <span>Send "Weather Alert Cleared" notifications when conditions recover</span>
              </label>
            </div>
          </div>
        </div>

        {/* Email SMTP Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
                EMAIL NOTIFICATION DESTINATION
              </h4>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                smtpConfigured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {smtpConfigured ? 'SMTP CONFIGURED' : 'SMTP NOT CONFIGURED'}
            </span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div>
              <label className="text-slate-300 block mb-1">Alert Destination Email:</label>
              <input
                type="email"
                value={settings.ownerEmail}
                onChange={(e) => setSettings({ ...settings, ownerEmail: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="p-3 bg-slate-950/80 rounded border border-slate-800/80 text-slate-400 text-[11px] leading-relaxed">
              <p>
                SMTP credentials (host, port, user, password) are securely read from server environment variables (<code>.env</code>). Passwords are never displayed or stored in SQLite.
              </p>
            </div>

            <button
              onClick={handleTestEmail}
              disabled={isTestingEmail}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isTestingEmail ? 'Sending Test Notification...' : 'Send Test Notification Email'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Owner Authentication & Security */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
          <Lock className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-mono font-bold uppercase text-slate-300">
            LOCAL OWNER AUTHENTICATION (SCRYPT HASHING)
          </h4>
        </div>

        <form onSubmit={handleChangePassword} className="max-w-md space-y-3 text-xs font-mono">
          <div>
            <label className="text-slate-300 block mb-1">Owner Email / Username:</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-slate-300 block mb-1">Current Password:</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 block mb-1">New Password:</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-slate-300 block mb-1">Confirm New Password:</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold transition-colors"
          >
            Update Owner Password
          </button>
        </form>
      </div>
    </div>
  );
};
