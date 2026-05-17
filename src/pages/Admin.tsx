import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';
import { useState, useCallback } from 'react';
import AdminPanel from '../components/AdminPanel';
import { ThemeToggle } from '../components/ThemeToggle';
import { AUTH_URL } from '../config';

interface UserProfile {
  email: string;
  name?: string;
  role?: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useLocalStorage<string | null>('access_token', null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const handleLogout = useCallback(() => {
    setAccessToken(null);
    navigate('/', { replace: true });
  }, [setAccessToken, navigate]);

  useEffect(() => {
    if (!accessToken) { navigate('/', { replace: true }); return; }

    fetch(`${AUTH_URL}/api/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(res => {
        if (!res.ok) { handleLogout(); throw new Error(); }
        return res.json();
      })
      .then(data => {
        if (data.role !== 'admin') { navigate('/dashboard', { replace: true }); return; }
        setUser(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken, navigate, handleLogout]);

  if (loading) {
    return (
      <div className="neo-root min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="neo-root relative min-h-screen overflow-hidden">

      {/* Background ambience */}
      <div className="ambient-orb bg-primary/10 w-[700px] h-[700px] top-[-15%] right-[-15%]" style={{ animationDelay: '0s' }} />
      <div className="ambient-orb bg-primary/10 w-[500px] h-[500px] bottom-[-10%] left-[-10%]" style={{ animationDelay: '-5s' }} />

      {/* Top Navigation */}
      <header className="relative z-20">
        <div className="glass-panel border-x-0 border-t-0 rounded-none px-6 py-0">
          <div className="max-w-6xl mx-auto flex items-center justify-between h-14">

            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/dashboard')}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/15">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                       strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <span className="font-semibold text-slate-800 text-[15px] tracking-tight">Sir. Platform</span>
              </button>
              <span className="text-slate-300 text-sm">/</span>
              <span className="text-sm font-semibold text-primary">Administration</span>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button onClick={() => navigate('/dashboard')}
                className="neo-btn neo-btn-soft flex items-center gap-2 h-9 px-4 rounded-xl text-sm text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                Dashboard
              </button>
              <button onClick={handleLogout}
                className="neo-btn neo-btn-soft flex items-center gap-2 h-9 px-4 rounded-xl text-sm text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 fade-up">
        <AdminPanel accessToken={accessToken ?? ''} />
      </main>
    </div>
  );
}
