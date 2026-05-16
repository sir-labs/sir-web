import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AUTH_URL } from '../config';

export default function Setup() {
  const navigate = useNavigate();

  const [secret, setSecret]               = useState('');
  const [adminEmail, setAdminEmail]       = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [clientId, setClientId]           = useState('');
  const [clientSecret, setClientSecret]   = useState('');
  const [clientName, setClientName]       = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${AUTH_URL}/setup?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email:    adminEmail,
          admin_password: adminPassword,
          client_id:      clientId,
          client_secret:  clientSecret,
          client_name:    clientName || 'Default Client',
        }),
      });
      if (res.status === 409) throw new Error('Already initialized — system has existing users.');
      if (res.status === 403) throw new Error('Invalid setup secret.');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Setup failed.');
      }
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="neo-root min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-[400px] text-center fade-up">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Setup complete</h1>
          <p className="text-slate-500 text-sm mb-8">Admin account and OAuth client created successfully.</p>
          <button
            onClick={() => navigate('/')}
            className="neo-btn neo-btn-primary w-full h-12 rounded-xl text-[0.9375rem] font-semibold"
          >
            Go to Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-root min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
      <div className="ambient-orb bg-indigo-500/10 w-96 h-96 -top-20 -right-20" style={{ animationDelay: '0s' }} />
      <div className="ambient-orb bg-violet-500/8 w-80 h-80 bottom-0 -left-16" style={{ animationDelay: '-4s' }} />

      <div className="relative z-10 w-full max-w-[420px] fade-up">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">Sir. Platform</h1>
            <p className="text-slate-400 text-xs mt-0.5">First-time setup</p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Initialize system</h2>
            <p className="text-slate-400 text-sm mt-1">
              Creates the first admin account and OAuth client. This can only be done once.
            </p>
          </div>

          {error && (
            <div className="neo-alert-error flex items-start gap-3 p-4 rounded-xl mb-6 text-sm">
              <svg className="w-4 h-4 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Setup Secret */}
            <div>
              <label className="field-label">Setup secret</label>
              <input
                type="password"
                required
                placeholder="Secret key from server config"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                className="neo-input w-full rounded-xl px-4 h-11"
              />
            </div>

            <div className="border-t border-white/30 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Admin account</p>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="field-label">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="admin@example.com"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    className="neo-input w-full rounded-xl px-4 h-11"
                  />
                </div>
                <div>
                  <label className="field-label">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Choose a strong password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    className="neo-input w-full rounded-xl px-4 h-11"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/30 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">OAuth client</p>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="field-label">Client ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. client-abc123"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="neo-input w-full rounded-xl px-4 h-11 font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">Client secret</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. a1b2c3d4..."
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                    className="neo-input w-full rounded-xl px-4 h-11 font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">Client name <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    placeholder="SIR Web"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className="neo-input w-full rounded-xl px-4 h-11"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 py-3">
                <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                <span className="text-slate-400 text-sm">Initializing…</span>
              </div>
            ) : (
              <button type="submit"
                className="neo-btn neo-btn-primary w-full h-12 rounded-xl text-[0.9375rem] font-semibold mt-1">
                Initialize system
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
