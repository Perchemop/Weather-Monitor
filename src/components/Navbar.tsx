import React, { useState } from 'react';
import {
  ShieldAlert,
  MapPin,
  RefreshCw,
  Activity,
  Radar,
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
import { KeepAwakeToggle } from './KeepAwakeToggle';

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
  MANAGER: { label: 'Manager', icon: Shield, className: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  VIEWER: { label: 'Viewer', icon: Eye, className: 'bg-slate-800/60 text-slate-400 border-slate-700' }
};

const NavbarComponent: React.FC<NavbarProps> = ({
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

  // Tabs are gated by role. Settings is available to every authenticated
  // role because each account owns its password, MFA and active sessions; the
  // owner-only configuration screens inside Settings are gated separately.
  const allNavItems = [
    { id: 'dashboard', label: 'Monitor', icon: Activity, visible: true },
    { id: 'activity', label: 'Activities', icon: HardHat, visible: true },
    { id: 'forecast', label: 'Forecast', icon: Calendar, visible: true },
    { id: 'map', label: 'Map', icon: Radar, visible: true },
    { id: 'alerts', label: 'Alerts', icon: ShieldAlert, visible: true },
    { id: 'history', label: 'History', icon: Clock, visible: true },
    { id: 'reports', label: 'Reports', icon: FileText, visible: true },
    { id: 'performance', label: 'Performance', icon: BarChart3, visible: true },
    { id: 'settings', label: 'Settings', icon: Settings, visible: true },
    // User/account management only applies to the server build.
    { id: 'users', label: 'Users', icon: Users, visible: isOwner && !STATIC_MODE }
  ];
  const navItems = allNavItems.filter((item) => item.visible);

  return (
    <header data-app-header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/95 text-white select-none backdrop-blur supports-[backdrop-filter]:bg-slate-950/85">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-500">
            <HardHat className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm sm:text-base font-semibold tracking-tight text-slate-100 leading-none">
                Construction Weather Monitor
              </h1>
              <span
                className={`hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleBadge.className}`}
                title={userEmail ? `Signed in as ${userEmail}` : undefined}
              >
                <RoleIcon className="h-2.5 w-2.5" />
                <span>{roleBadge.label}</span>
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-slate-500">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  monitorStatus === 'ACTIVE'
                    ? 'bg-emerald-400'
                    : monitorStatus === 'ERROR'
                    ? 'bg-red-500'
                    : 'bg-slate-600'
                }`}
                aria-hidden="true"
              />
              <span>
                {monitorStatus === 'ACTIVE' ? 'Monitoring' : monitorStatus === 'ERROR' ? 'Check failed' : 'Paused'}
                <span className="text-slate-700"> · </span>
                {getRelativeTime(lastCheckTime)}
              </span>
            </p>
          </div>
        </div>

        {/* Location & Status Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
          {/* Location Selector Button */}
          <button
            type="button"
            id="location-selector-btn"
            onClick={onOpenLocations}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-slate-800/80 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
            title="Change monitored site location"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate max-w-[130px] sm:max-w-[200px]">
              {currentLocation ? currentLocation.name : 'Select Location'}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
          </button>

          {/* Keep-screen-awake toggle (Screen Wake Lock) */}
          <KeepAwakeToggle />

          {/* Live data badge — monitor state moved into the brand line */}
          <span
            className={`hidden sm:inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              dataStatus === 'LIVE'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {dataStatus}
          </span>

          {/* Manual Run Check Button (operators only) */}
          {canOperate && (
            <button
              type="button"
              id="manual-check-btn"
              onClick={onRunCheck}
              disabled={isChecking}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 outline-none cursor-pointer"
              title="Execute immediate weather check cycle"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Check now</span>
            </button>
          )}

          {/* Lock / Logout Button (server build only — the static build has no auth) */}
          {onLogout && !STATIC_MODE && (
            <button
              type="button"
              id="logout-btn"
              onClick={onLogout}
              className="touch-square flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-500 transition-colors hover:border-slate-700 hover:bg-slate-800/80 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer"
              title="Lock safety enclave / log out"
              aria-label="Lock safety enclave"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="touch-square sm:hidden flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-white"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Desktop & Tablet) — underline style */}
      <div className="border-t border-slate-800/60 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Main navigation">
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
                  className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 outline-none cursor-pointer ${
                    isActive ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-amber-400' : ''}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <span
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-amber-400"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile Collapsible Navigation Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-800/60 bg-slate-950/95 p-3 space-y-1">
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
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                  isActive
                    ? 'bg-slate-800/80 text-amber-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <KeepAwakeToggle fullWidth />
          <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-between px-2">
            <span>
              {monitorStatus === 'ACTIVE' ? 'Monitoring' : monitorStatus === 'ERROR' ? 'Check failed' : 'Paused'}
              <span className="text-slate-700"> · </span>
              {dataStatus}
            </span>
            <span>{getRelativeTime(lastCheckTime)}</span>
          </div>
        </div>
      )}
    </header>
  );
};

export const Navbar = React.memo(NavbarComponent);
