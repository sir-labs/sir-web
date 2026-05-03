import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';

const BASE_URL = import.meta.env.VITE_BASE_URL;

export default function Dashboard() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useLocalStorage<string | null>('access_token', null);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      navigate('/', { replace: true });
      return;
    }
    fetchUserProfile(accessToken);
  }, [accessToken, navigate]);

  const fetchUserProfile = async (token: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 401) handleLogout();
        throw new Error('Failed to synchronize profile data.');
      }

      const userData = await response.json();
      setUser(userData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAccessToken(null);
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-infinity loading-lg text-indigo-500 scale-150"></span>
          <p className="text-indigo-400 text-sm tracking-widest animate-pulse font-medium mt-4">DECRYPTING DATA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="ambient-orb bg-indigo-600/10 w-[800px] h-[800px] top-[-20%] right-[-20%]" style={{ animationDelay: '0s' }}></div>
      <div className="ambient-orb bg-violet-600/10 w-[600px] h-[600px] bottom-[-10%] left-[-10%]" style={{ animationDelay: '-5s' }}></div>

      <div className="relative z-10 w-full max-w-screen-2xl mx-auto px-6 py-12 animate-slide-up">
        
        {/* Navbar Component */}
        <div className="glass-panel rounded-3xl px-8 py-4 mb-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Command Center</h1>
              <p className="text-xs text-indigo-400 font-mono tracking-wider">SIR.PLATFORM V2</p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="btn btn-ghost rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Disconnect
          </button>
        </div>

        {error && (
          <div className="w-full p-4 mb-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Identity Card */}
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-3xl p-8 h-full flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity duration-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-48 h-48"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4 M12 8h.01"/></svg>
              </div>
              
              <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase mb-8">Identity Module</h2>
              
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 relative z-10">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-indigo-500 to-fuchsia-500 p-1 shadow-[0_0_40px_rgba(99,102,241,0.4)]">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center border-4 border-slate-900">
                      <span className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-tr from-indigo-400 to-fuchsia-400">
                        {user?.email?.charAt(0).toUpperCase() || 'X'}
                      </span>
                    </div>
                  </div>
                  {user?.role && (
                    <div className="absolute bottom-0 right-0 bg-slate-900 rounded-full p-1 border border-white/10 shadow-xl">
                      <div className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-3 py-1 rounded-full border border-indigo-500/30">
                        {user.role}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col items-center sm:items-start space-y-3 text-center sm:text-left pt-2">
                  <h3 className="text-3xl font-bold text-white tracking-tight">{user?.name || 'Authorized User'}</h3>
                  <div className="flex items-center gap-2 text-slate-400 bg-slate-800/50 px-4 py-2 rounded-xl border border-white/5">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span className="font-mono text-sm">{user?.email || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-xl border border-emerald-500/20 mt-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="text-xs font-bold tracking-widest">SYSTEM SECURED</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats / Info */}
          <div className="flex flex-col gap-6">
            <div className="glass-panel rounded-3xl p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-4">Access Level</h4>
              <div className="text-4xl font-light text-white mb-2">{user?.role === 'admin' ? 'Alpha' : 'Standard'}</div>
              <p className="text-sm text-indigo-300">Clearance granted for standard operations.</p>
            </div>

            <div className="glass-panel rounded-3xl p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 flex-1 flex flex-col justify-between">
               <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-4">Connection</h4>
              <div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl font-light text-white">Encrypted</span>
                </div>
                <p className="text-xs text-violet-300 font-mono">NODE: sir.puem.me</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
