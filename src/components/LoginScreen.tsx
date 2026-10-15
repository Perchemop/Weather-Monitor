import React, { useState } from 'react';
import { HardHat, Lock, ShieldCheck, Key, Eye, EyeOff, AlertCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import { UserRole } from '../types';

interface LoginScreenProps {
  isFirstRun?: boolean;
  ownerEmail?: string;
  onAuthenticated: (token: string, email: string, role: UserRole) => void;
}

export function LoginScreen({ isFirstRun = false, ownerEmail = 'owner@local', onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState(ownerEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage('Master password is required.');
      return;
    }

    if (isFirstRun) {
      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please re-enter.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const endpoint = isFirstRun ? '/api/auth/setup' : '/api/auth/login';
      const payload = { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      if (data.token) {
        localStorage.setItem('cwm_session_token', data.token);
      }
      onAuthenticated(data.token, data.email || email, (data.role as UserRole) || 'OWNER');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background industrial grid accent */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0f_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0f_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6">
        {/* Brand header */}
        <div className="flex items-center gap-3.5 border-b border-slate-800 pb-5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xs font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Safety Enclave
              </span>
              <span className="text-2xs font-mono uppercase text-slate-500">Local-First</span>
            </div>
            <h1 className="text-lg font-bold text-white tracking-wide mt-1">
              Construction Weather Monitor
            </h1>
          </div>
        </div>

        {/* Status description */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            {isFirstRun ? <Key className="w-4 h-4 text-cyan-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
            <span>{isFirstRun ? 'Initial Master Password Setup' : 'Site Supervisor Lock'}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isFirstRun
              ? 'Establish master owner credentials to secure high-risk crane limit telemetry, alert dispatches, and SWMS controls.'
              : 'Enter master site supervisor password to access live microclimate monitoring and risk calculations.'}
          </p>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase font-mono tracking-wider text-slate-400">
              {isFirstRun ? 'Supervisor Email' : 'Operator Email'}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono"
              placeholder="supervisor@site.local"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase font-mono tracking-wider text-slate-400">
                {isFirstRun ? 'New Master Password' : 'Master Password'}
              </label>
              <span className="text-2xs text-slate-500">Min 6 characters</span>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isFirstRun && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase font-mono tracking-wider text-slate-400">
                Confirm Master Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono"
                placeholder="••••••••••••"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{isFirstRun ? 'Establish Master Credentials' : 'Unlock Weather Enclave'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-2xs text-slate-500">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted local session (Scrypt KDF)</span>
          </div>
          <span>Role-based access enclave</span>
        </div>
      </div>
    </div>
  );
}
