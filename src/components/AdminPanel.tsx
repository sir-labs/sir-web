import { useState, useEffect } from 'react';

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
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to delete user');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openModal = (user?: any) => {
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
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="mt-12 w-full animate-slide-up" style={{ animationDelay: '0.2s' }}>
      <div className="flex items-center gap-4 mb-6">
        <div className="h-px bg-white/10 flex-1"></div>
        <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase">Admin Operations</h2>
        <div className="h-px bg-white/10 flex-1"></div>
      </div>

      <div className="glass-panel rounded-3xl p-6 relative overflow-hidden">
        
        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-white/10 pb-4 items-center justify-between">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}
            >
              User Management
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'logs' ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30' : 'text-slate-500 hover:text-slate-300'}`}
            >
              System Logs
            </button>
          </div>
          {activeTab === 'users' && (
            <button 
              onClick={() => openModal()}
              className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-indigo-500/20"
            >
              + Create User
            </button>
          )}
        </div>

        {error && <div className="text-rose-400 text-sm mb-4">{error}</div>}
        {loading && <div className="text-indigo-400 text-sm mb-4 animate-pulse">Loading data...</div>}

        {/* Users Tab */}
        {!loading && activeTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="pb-3 font-medium">ID</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 font-mono text-xs text-slate-500">{u.id}</td>
                    <td className="py-4 text-slate-200">{u.email}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${u.role === 'admin' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <button onClick={() => openModal(u)} className="text-indigo-400 hover:text-indigo-300 mr-4 text-xs font-bold uppercase tracking-wider transition-colors">Edit</button>
                      <button onClick={() => handleDeleteUser(u.id)} className="text-rose-500 hover:text-rose-400 text-xs font-bold uppercase tracking-wider transition-colors">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Logs Tab */}
        {!loading && activeTab === 'logs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Action</th>
                  <th className="pb-3 font-medium">Admin ID</th>
                  <th className="pb-3 font-medium">Target ID</th>
                  <th className="pb-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 text-xs text-slate-500">{new Date(l.created_at * 1000).toLocaleString()}</td>
                    <td className="py-3 font-bold text-fuchsia-400 text-xs">{l.action}</td>
                    <td className="py-3 font-mono text-xs text-slate-400">{l.admin}</td>
                    <td className="py-3 font-mono text-xs text-slate-400">{l.target}</td>
                    <td className="py-3 text-slate-300 text-xs">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <p className="text-slate-500 text-sm mt-4 text-center">No logs found.</p>}
          </div>
        )}

      </div>

      {/* Edit/Create Modal */}
      {(editingUser || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-slide-up">
          <div className="glass-panel w-full max-w-md p-8 rounded-3xl relative">
            <h3 className="text-xl font-bold mb-6 text-white">{isCreating ? 'Initialize New User' : 'Edit User Identity'}</h3>
            <form onSubmit={handleUpdateUser} className="flex flex-col gap-4">
              
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Email</label>
                <input 
                  type="email" 
                  value={editEmail} 
                  onChange={e => setEditEmail(e.target.value)} 
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  required 
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Role</label>
                <select 
                  value={editRole} 
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{isCreating ? 'Password' : 'New Password (Leave blank to keep)'}</label>
                <input 
                  type="password" 
                  value={editPassword} 
                  onChange={e => setEditPassword(e.target.value)} 
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  required={isCreating}
                />
              </div>

              <div className="flex gap-4 mt-4">
                <button type="button" onClick={() => {setEditingUser(null); setIsCreating(false);}} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold hover:bg-white/10 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-xl glass-btn text-white font-bold">{isCreating ? 'Create Identity' : 'Save Changes'}</button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
