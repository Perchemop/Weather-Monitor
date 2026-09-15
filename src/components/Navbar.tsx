import React from 'react';
import {
  ShieldAlert,
  MapPin,
  RefreshCw,
  Activity,
  Layers,
  Calendar,
  Clock,
  FileText,
  Settings,
  HardHat,
  ChevronDown
} from 'lucide-react';
import { LocationItem } from '../types';

interface NavbarProps {
  currentLocation: LocationItem | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenLocations: () => void;
  onRunCheck: () => void;
  isChecking: boolean;
  monitorStatus: 'ACTIVE' | 'STOPPED' | 'ERROR';
  dataStatus: 'LIVE' | 'CACHED' | 'OFFLINE' | 'UNAVAILABLE';
  lastCheckTime: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  activeTab,
  setActiveTab,
  onOpenLocations,
  onRunCheck,
  isChecking,
  monitorStatus,
  dataStatus,
  lastCheckTime
}) => {
  const getRelativeTime = (iso: string | null) => {
    if (!iso) return 'Pending check';
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const navItems = [
    { id: 'dashboard', label: 'Monitor', icon: Activity },
    { id: 'forecast', label: 'Forecast', icon: Calendar },
    { id: 'alerts', label: 'Alerts', icon: ShieldAlert },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'system', label: 'Health', icon: Layers },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white select-none">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
            <HardHat className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-amber-500">
                Private Local Monitor
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-400 font-mono">Single-User</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight leading-none mt-0.5">
              CONSTRUCTION WEATHER MONITOR
            </h1>
          </div>
        </div>

        {/* Location & Status Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          {/* Location Selector Button */}
          <button
            id="location-selector-btn"
            onClick={onOpenLocations}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs sm:text-sm font-medium text-slate-200 transition-colors"
            title="Change monitored site location"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate max-w-[150px] sm:max-w-[200px]">
              {currentLocation ? currentLocation.name : 'Select Location'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Status Badges */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Monitor Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono font-medium ${
                monitorStatus === 'ACTIVE'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : monitorStatus === 'ERROR'
                  ? 'bg-red-950/60 border-red-800 text-red-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  monitorStatus === 'ACTIVE'
                    ? 'bg-emerald-400 animate-pulse'
                    : monitorStatus === 'ERROR'
                    ? 'bg-red-500'
                    : 'bg-slate-500'
                }`}
              />
              <span>{monitorStatus}</span>
            </div>

            {/* Live Data Badge */}
            <span
              className={`px-2 py-1 rounded text-xs font-mono font-semibold uppercase tracking-wider ${
                dataStatus === 'LIVE'
                  ? 'bg-blue-950/70 text-blue-300 border border-blue-800'
                  : 'bg-amber-950/70 text-amber-300 border border-amber-800'
              }`}
            >
              {dataStatus}
            </span>
          </div>

          {/* Manual Run Check Button */}
          <button
            id="manual-check-btn"
            onClick={onRunCheck}
            disabled={isChecking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs sm:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            title="Execute immediate weather check cycle"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Check Now</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-t border-slate-800/80 bg-slate-950/60 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1 sm:gap-2 py-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-inner'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400 shrink-0 pl-4">
            <span>Last checked: {getRelativeTime(lastCheckTime)}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
