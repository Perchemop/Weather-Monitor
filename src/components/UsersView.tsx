import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Eye,
  Trash2,
  KeyRound,
  UserCheck,
  UserX,
  RefreshCw,
  Mail,
  Crown,
  HardHat
} from 'lucide-react';
import { UserAccount, UserRole } from '../types';
import { useToast } from './ToastProvider';
import { apiFetch } from '../utils/api';

interface RoleMeta {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
}

const ROLE_META: Record<UserRole, RoleMeta> = {
  OWNER: {
    label: 'Owner',
    description: 'Full control: settings, users, data, backups.',
    icon: Crown,
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  },
  MANAGER: {
    label: 'Manager',
    description: 'Operational: run checks, manage sites, dismiss alerts.',
    icon: Shield,
    badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
  },
  VIEWER: {
    label: 'Viewer',
    description: 'Read-only: dashboards, forecasts, history, reports.',
    icon: Eye,
    badgeClass: 'bg-slate-700/40 text-slate-300 border-slate-600'
  }
};

export function UsersView() {
  const toast = useToast();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  // Add-user form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('VIEWER');

  // Reset-password target
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else if (res.status === 403) {
        toast.error('Only the Owner may manage user accounts.');
      }
    } catch {
      toast.error('Failed to load user accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('Password must be at least 10 characters and include a letter and a number.');
      return;
    }
    setIsBusy(true);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole, displayName: newName })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Account created for ${newEmail}.`);
        setNewEmail('');
        setNewName('');
        setNewPassword('');
        setNewRole('VIEWER');
        setShowAddForm(false);
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to create account.');
      }
    } catch {
      toast.error('Connection error creating account.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRoleChange = async (user: UserAccount, role: UserRole) => {
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${user.email} is now a ${ROLE_META[role].label}.`);
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to update role.');
      }
    } catch {
      toast.error('Connection error updating role.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleActive = async (user: UserAccount) => {
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active })
      });
      const data = await res.json();
      if (res.ok) {
        toast.info(`${user.email} ${user.active ? 'deactivated' : 'reactivated'}.`);
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to change account status.');
      }
    } catch {
      toast.error('Connection error changing status.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (user: UserAccount) => {
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Deleted account ${user.email}.`);
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to delete account.');
      }
    } catch {
      toast.error('Connection error deleting account.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 10 || !/[A-Za-z]/.test(resetPassword) || !/[0-9]/.test(resetPassword)) {
      toast.error('Password must be at least 10 characters and include a letter and a number.');
      return;
    }
    setIsBusy(true);
    try {
      const res = await apiFetch(`/api/users/${resetTarget.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPassword })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Password reset for ${resetTarget.email}.`);
        setResetTarget(null);
        setResetPassword('');
      } else {
        toast.error(data.error || 'Failed to reset password.');
      }
    } catch {
      toast.error('Connection error resetting password.');
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm animate-pulse">
        Loading site access control roster...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              SITE ACCESS CONTROL & ROLES
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Provision operators and assign least-privilege roles for the local safety enclave.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchUsers()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold shadow-sm transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Operator</span>
          </button>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(ROLE_META) as UserRole[]).map((role) => {
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <div key={role} className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-mono font-bold uppercase border ${meta.badgeClass}`}>
                <Icon className="w-3 h-3" />
                <span>{meta.label}</span>
              </div>
              <p className="text-2xs font-mono text-slate-400 leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </div>

      {/* Add-user form */}
      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="bg-slate-900 border border-amber-500/20 rounded-xl p-5 shadow-sm space-y-4 animate-in fade-in-50 duration-150"
        >
          <h4 className="text-xs font-mono font-bold uppercase text-slate-300 border-b border-slate-800 pb-3">
            PROVISION NEW OPERATOR ACCOUNT
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <label className="text-slate-400 block mb-1">Email Address:</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="operator@site.local"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Display Name (optional):</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Site Supervisor"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Initial Password:</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 10 characters"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Assigned Role:</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              >
                <option value="VIEWER">Viewer — read-only</option>
                <option value="MANAGER">Manager — operational</option>
                <option value="OWNER">Owner — full control</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </form>
      )}

      {/* User roster */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-mono font-bold uppercase text-slate-300">ACTIVE OPERATOR ROSTER</h4>
          <span className="text-2xs font-mono text-slate-500">{users.length} account(s)</span>
        </div>

        {users.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-500">No operator accounts provisioned.</div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {users.map((user) => {
              const meta = ROLE_META[user.role];
              const RoleIcon = meta.icon;
              return (
                <div
                  key={user.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-950/40 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.badgeClass}`}>
                      <RoleIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-bold text-slate-200 truncate">
                          {user.displayName || user.email.split('@')[0]}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-mono font-bold uppercase border ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                        {!user.active && (
                          <span className="px-1.5 py-0.5 rounded text-2xs font-mono font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/30">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-2xs font-mono text-slate-500 mt-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{user.email}</span>
                        <span>•</span>
                        <span>
                          {user.lastLoginAt
                            ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}`
                            : 'Never logged in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                      disabled={isBusy}
                      aria-label={`Role for ${user.email}`}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-2xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50 cursor-pointer"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="MANAGER">Manager</option>
                      <option value="OWNER">Owner</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(user)}
                      disabled={isBusy}
                      title={user.active ? 'Deactivate account' : 'Reactivate account'}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {user.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResetTarget(user);
                        setResetPassword('');
                      }}
                      title="Reset password"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      disabled={isBusy}
                      title="Delete account"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-800 text-slate-400 hover:text-red-300 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Password reset modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <form
            onSubmit={handleResetPassword}
            className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Reset Password
              </h3>
            </div>
            <p className="text-xs font-mono text-slate-400">
              Set a new password for <strong className="text-slate-200">{resetTarget.email}</strong>.
            </p>
            <input
              type="password"
              autoFocus
              required
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="New password (min 10 characters)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-sm"
            />
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Reset Password
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-2 text-2xs font-mono text-slate-500">
        <HardHat className="w-3.5 h-3.5 text-amber-500" />
        <span>Least-privilege model · The last remaining Owner account cannot be demoted or removed.</span>
      </div>
    </div>
  );
}
