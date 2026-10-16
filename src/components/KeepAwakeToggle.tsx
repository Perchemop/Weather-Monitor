import React, { useEffect, useState } from 'react';
import { Sun } from 'lucide-react';
import {
  isActive,
  keepAwakePreference,
  onWakeLockChange,
  setKeepAwake,
  wakeLockSupported
} from '../utils/wakeLock';

interface KeepAwakeToggleProps {
  /** Renders a full-width row (mobile menu) instead of a compact icon button. */
  fullWidth?: boolean;
}

/**
 * Toggles the Screen Wake Lock so a phone/tablet left on the dashboard keeps the
 * display on for continuous monitoring. The button reflects the real lock state
 * (which the browser can drop at any time) rather than just the preference.
 */
export const KeepAwakeToggle: React.FC<KeepAwakeToggleProps> = ({ fullWidth = false }) => {
  const supported = wakeLockSupported();
  const [enabled, setEnabled] = useState<boolean>(() => keepAwakePreference());
  const [active, setActive] = useState<boolean>(() => isActive());
  const [busy, setBusy] = useState(false);

  useEffect(() => onWakeLockChange(setActive), []);

  if (!supported) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !enabled;
    setEnabled(next);
    await setKeepAwake(next);
    setActive(isActive());
    setBusy(false);
  };

  const label = active ? 'Screen awake' : enabled ? 'Reconnecting…' : 'Keep awake';

  if (fullWidth) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
          active
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
        }`}
        title="Keep this screen awake while monitoring the site"
      >
        <Sun className={`w-4 h-4 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer ${
        active
          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
          : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-slate-100 hover:border-slate-600/80'
      }`}
      title={active ? 'Screen is being kept awake — tap to stop' : 'Keep this screen awake while monitoring'}
      aria-label="Toggle keep screen awake"
    >
      <Sun className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
};
