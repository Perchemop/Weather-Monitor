import React, { useState } from 'react';
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
  BarChart3,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Users,
  Crown,
  Shield,
  Eye
} from 'lucide-react';
import { LocationItem, UserRole } from '../types';
import { STATIC_MODE } from '../static/mode';

interface NavbarProps {
  currentLocation: LocationItem | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenLocations: () => void;
  onRunCheck: () => void;
  onLogout?: () => void;
  isChecking: boolean;
  monitorStatus: 'ACTIVE' | 'STOPPED' | 'ERROR';
  dataStatus: 'LIVE' | 'CACHED' | 'OFFLINE' | 'UNAVAILABLE';
  lastCheckTime: string | null;
  userRole?: UserRole;
  userEmail?: string;
}

const ROLE_BADGE: Record<UserRole, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  OWNER: { label: 'Owner', icon: Crown, className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  MANAGER: { label: 'Manager', icon: Shield, className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  VIEWER: { label: 'Viewer', icon: Eye, className: 'bg-slate-700/40 text-slate-300 border-slate-600' }
};

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  activeTab,
  setActiveTab,
  onOpenLocations,
  onRunCheck,
  onLogout,
  isChecking,
  monitorStatus,
  dataStatus,
  lastCheckTime,
  userRole = 'VIEWER',
  userEmail
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const canOperate = userRole === 'OWNER' || userRole === 'MANAGER';
  const isOwner = userRole === 'OWNER';
  const roleBadge = ROLE_BADGE[userRole];
  const RoleIcon = roleBadge.icon;

  const getRelativeTime = (iso: string | null) => {
    if (!iso) return 'Pending check';
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Tabs are gated by role: everyone monitors, only owners configure.
  const allNavItems = [
    { id: 'dashboard', label: 'Monitor', icon: Activity, visible: true },
    { id: 'activity', label: 'Activities', icon: HardHat, visible: true },
    { id: 'forecast', label: 'Forecast', icon: Calendar, visible: true },
    { id: 'alerts', label: 'Alerts', icon: ShieldAlert, visible: true },
    { id: 'history', label: 'History', icon: Clock, visible: true },
    { id: 'reports', label: 'Reports', icon: FileText, visible: true },
    { id: 'performance', label: 'Performance', icon: BarChart3, visible: true },
    { id: 'system', label: 'Health', icon: Layers, visible: canOperate },
    { id: 'settings', label: 'Settings', icon: Settings, visible: isOwner },
    // User/account management only applies to the server build.
    { id: 'users', label: 'Users', icon: Users, visible: isOwner && !STATIC_MODE }
  ];
  const navItems = allNavItems.filter((item) => item.visible);

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white select-none">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <HardHat className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-amber-500">
                Safety Enclave
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-mono font-bold uppercase border ${roleBadge.className}`}
                title={userEmail ? `Signed in as ${userEmail}` : undefined}
              >
                <RoleIcon className="w-2.5 h-2.5" />
                <span>{roleBadge.label}</span>
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight leading-none mt-0.5">
              CONSTRUCTION WEATHER MONITOR
            </h1>
          </div>
        </div>

        {/* Location & Status Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          {/* Location Selector Button */}
          <button
            type="button"
            id="location-selector-btn"
            onClick={onOpenLocations}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs sm:text-sm font-medium text-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
            title="Change monitored site location"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[200px]">
              {currentLocation ? currentLocation.name : 'Select Location'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Status Badges */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Monitor Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium ${
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
              className={`px-2 py-1 rounded-md text-xs font-mono font-semibold uppercase tracking-wider ${
                dataStatus === 'LIVE'
                  ? 'bg-blue-950/70 text-blue-300 border border-blue-800'
                  : 'bg-amber-950/70 text-amber-300 border border-amber-800'
              }`}
            >
              {dataStatus}
            </span>
          </div>

          {/* Manual Run Check Button (operators only) */}
          {canOperate && (
            <button
              type="button"
              id="manual-check-btn"
              onClick={onRunCheck}
              disabled={isChecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
              title="Execute immediate weather check cycle"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Check Now</span>
            </button>
          )}

          {/* Lock / Logout Button (server build only — the static build has no auth) */}
          {onLogout && !STATIC_MODE && (
            <button
              type="button"
              id="logout-btn"
              onClick={onLogout}
              className="flex items-center gap-1 p-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-400 hover:text-red-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
              title="Lock safety enclave / log out"
              aria-label="Lock safety enclave"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Desktop & Tablet) */}
      <div className="border-t border-slate-800/80 bg-slate-950/60 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1 sm:gap-2 py-1.5" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer ${
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

      {/* Mobile Collapsible Navigation Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-800 bg-slate-950/95 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-amber-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-800 text-2xs font-mono text-slate-500 flex items-center justify-between px-2">
            <span>Status: {monitorStatus}</span>
            <span>{getRelativeTime(lastCheckTime)}</span>
          </div>
        </div>
      )}
    </header>
  );
};
