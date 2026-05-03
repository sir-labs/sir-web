import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from './ConfirmDialog';

const BASE_URL = import.meta.env.VITE_BASE_URL;

export default function AdminPanel({ accessToken }: { accessToken: string }) {
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Edit/Create Modal State
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editPassword, setEditPassword] = useState('');
  const [formError, setFormError] = useState('');

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    else fetchLogs();
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/logs`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogs(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    setPendingDeleteId(null);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to delete user');
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openModal = (user?: any) => {
    setFormError('');
    if (user) {
      setEditingUser(user);
      setIsCreating(false);
      setEditEmail(user.email);
      setEditRole(user.role);
    } else {
      setEditingUser(null);
      setIsCreating(true);
      setEditEmail('');
      setEditRole('user');
    }
    setEditPassword('');
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: any = { email: editEmail, role: editRole };
      if (editPassword) body.password = editPassword;

      if (isCreating && !editPassword) {
        throw new Error('Password is required for new users');
      }

      const url = isCreating ? `${BASE_URL}/api/admin/users` : `${BASE_URL}/api/admin/users/${editingUser.id}`;
      const method = isCreating ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) throw new Error(isCreating ? 'Failed to create user' : 'Failed to update user');
      setEditingUser(null);
      setIsCreating(false);
      setFormError('');
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  return (
    <div className="neo-root w-full fade-up" style={{ animationDelay: '0.15s' }}>

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[15px] font-semibold text-slate-700">Admin Panel</h2>
        <div className="flex-1 h-px bg-white/35" />
      </div>

      <div className="glass-panel rounded-2xl p-6">

        {/* Tabs */}
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-white/25">
          <div className="neo-inset flex items-center gap-1 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'users'
                  ? 'bg-white shadow-sm text-indigo-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'logs'
                  ? 'bg-white shadow-sm text-fuchsia-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              System Logs
            </button>
          </div>
          {activeTab === 'users' && (
            <button
              onClick={() => openModal()}
              className="neo-btn neo-btn-primary flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold border-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New user
            </button>
          )}
        </div>

        {error && (
          <div className="neo-alert-error flex items-center gap-3 text-sm mb-4 p-3 rounded-xl">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            Loading…
          </div>
        )}

        {/* Users Tab */}
        {!loading && activeTab === 'users' && (
          <div className="overflow-x-auto">
            {users.length === 0 ? (
              <p className="text-slate-500 text-sm py-10 text-center">No users found.</p>
            ) : (
              <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">User</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">ID</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Role</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="group">
                      <td className="px-4 py-3 rounded-l-2xl bg-white/40 backdrop-blur-sm border border-white/50 border-r-0 group-hover:bg-white/60 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-600 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                            {u.email.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-700 truncate max-w-[200px]">{u.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 bg-white/40 backdrop-blur-sm border-y border-white/50 group-hover:bg-white/60 transition-colors">
                        <span className="font-mono text-[11px] text-slate-400 bg-slate-100/60 px-2 py-1 rounded-lg">#{u.id}</span>
                      </td>
                      <td className="px-4 py-3 bg-white/40 backdrop-blur-sm border-y border-white/50 group-hover:bg-white/60 transition-colors">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.role === 'admin' ? 'bg-indigo-500' : 'bg-slate-400'}`}></span>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 rounded-r-2xl bg-white/40 backdrop-blur-sm border border-white/50 border-l-0 group-hover:bg-white/60 transition-colors">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openModal(u)}
                            className="neo-btn neo-btn-soft flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-indigo-600 text-xs font-bold transition-all hover:bg-indigo-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(u.id)}
                            className="w-8 h-8 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-600 border border-rose-200 flex items-center justify-center transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {!loading && activeTab === 'logs' && (
          <div className="overflow-x-auto">
            {logs.length === 0 ? (
              <p className="text-slate-500 text-sm py-10 text-center">No logs found.</p>
            ) : (
              <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Time</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Action</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Admin</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Target</th>
                    <th className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => {
                    const actionColors: Record<string, string> = {
                      CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                      DELETE: 'bg-rose-100 text-rose-700 border-rose-200',
                      UPDATE: 'bg-amber-100 text-amber-700 border-amber-200',
                    };
                    const actionKey = (l.action || '').toUpperCase().split('_')[0];
                    const actionClass = actionColors[actionKey] ?? 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
                    return (
                      <tr key={l.id} className="group">
                        <td className="px-4 py-3 rounded-l-2xl bg-white/40 backdrop-blur-sm border border-white/50 border-r-0 group-hover:bg-white/60 transition-colors whitespace-nowrap">
                          <span className="text-[11px] text-slate-500 font-mono">{new Date(l.created_at * 1000).toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 bg-white/40 backdrop-blur-sm border-y border-white/50 group-hover:bg-white/60 transition-colors">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${actionClass}`}>{l.action}</span>
                        </td>
                        <td className="px-4 py-3 bg-white/40 backdrop-blur-sm border-y border-white/50 group-hover:bg-white/60 transition-colors">
                          <span className="font-mono text-[11px] text-slate-400 bg-slate-100/60 px-2 py-1 rounded-lg">#{l.admin}</span>
                        </td>
                        <td className="px-4 py-3 bg-white/40 backdrop-blur-sm border-y border-white/50 group-hover:bg-white/60 transition-colors">
                          <span className="font-mono text-[11px] text-slate-400 bg-slate-100/60 px-2 py-1 rounded-lg">#{l.target}</span>
                        </td>
                        <td className="px-4 py-3 rounded-r-2xl bg-white/40 backdrop-blur-sm border border-white/50 border-l-0 group-hover:bg-white/60 transition-colors">
                          <span className="text-xs text-slate-600">{l.details}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* Edit/Create Modal */}
      {(editingUser || isCreating) && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-700/25 backdrop-blur-sm p-4 animate-slide-up">
          <div className="glass-panel w-full max-w-md rounded-2xl p-8 relative">

            {/* Modal heading */}
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                {isCreating ? 'New user' : 'Edit user'}
              </h3>
              <p className="text-slate-400 text-sm mt-0.5">
                {isCreating ? 'Fill in the details to create an account.' : 'Update the user\'s information below.'}
              </p>
            </div>

            <form onSubmit={handleUpdateUser} className="flex flex-col gap-4">

              <div>
                <label className="field-label">Email address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="neo-input w-full rounded-xl px-4 py-2.5"
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div>
                <label className="field-label">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="neo-select w-full rounded-xl px-4 py-2.5"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="field-label">
                  {isCreating ? 'Password' : 'New password'}
                </label>
                {!isCreating && (
                  <p className="text-slate-400 text-xs mb-1.5">Leave blank to keep current password.</p>
                )}
                <input
                  type="password"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  className="neo-input w-full rounded-xl px-4 py-2.5"
                  placeholder={isCreating ? 'Choose a password' : '••••••••'}
                  required={isCreating}
                />
              </div>

              {formError && (
                <div className="neo-alert-error flex items-center gap-2 p-3 rounded-xl text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex gap-3 mt-2 pt-2 border-t border-white/30">
                <button
                  type="button"
                  onClick={() => { setEditingUser(null); setIsCreating(false); }}
                  className="neo-btn neo-btn-soft flex-1 h-11 rounded-xl text-slate-600 font-semibold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="neo-btn neo-btn-primary flex-1 h-11 rounded-xl text-white font-semibold text-sm border-0"
                >
                  {isCreating ? 'Create user' : 'Save changes'}
                </button>
              </div>

            </form>
          </div>
        </div>
        , document.body
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete user"
        description="This user and all their data will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete user"
        danger
        onConfirm={() => pendingDeleteId && handleDeleteUser(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
