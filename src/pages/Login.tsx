import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';
import { ThemeToggle } from '../components/ThemeToggle';

import { AUTH_URL, CLIENT_ID, CLIENT_SECRET } from '../config';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accessToken, setAccessToken] = useLocalStorage<string | null>('access_token', null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (accessToken) { navigate('/dashboard', { replace: true }); return; }

    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(errorParam === 'access_denied'
        ? 'Incorrect email or password. Please try again.'
        : `Authentication error: ${errorParam}`);
      setSearchParams({});
      return;
    }

    const code = searchParams.get('code');
    if (code) {
      setLoading(true);
      exchangeToken(code)
        .then(() => navigate('/dashboard', { replace: true }))
        .catch((err) => { setError(err.message); setSearchParams({}); })
        .finally(() => setLoading(false));
    }
  }, [accessToken, searchParams, navigate, setSearchParams]);

  const exchangeToken = async (code: string) => {
    const redirectUri = window.location.origin + '/';
    const formData = new URLSearchParams();
    formData.append('grant_type',    'authorization_code');
    formData.append('code',          code);
    formData.append('client_id',     CLIENT_ID);
    formData.append('client_secret', CLIENT_SECRET);
    formData.append('redirect_uri',  redirectUri);
    const res = await fetch(`${AUTH_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
    if (!res.ok) throw new Error('Authentication failed. Please try again.');
    const data = await res.json();
    if (data.access_token) setAccessToken(data.access_token);
  };

  const handleLogin = () => {
    const redirectUri = window.location.origin + '/';
    window.location.href = `${AUTH_URL}/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Brand Panel (desktop only) ─────────────────── */}
      <div className="hidden lg:flex flex-col relative overflow-hidden w-[440px] xl:w-[500px] shrink-0"
           style={{ background: 'linear-gradient(145deg, #a9583e 0%, #cc785c 55%, #e8a55a 100%)' }}>

        {/* Decorative orbs */}
        <div className="ambient-orb w-[480px] h-[480px] bg-white/8 -top-32 -left-32" style={{ animationDelay: '0s' }} />
        <div className="ambient-orb w-64 h-64 bg-primary/10 bottom-16 right-0" style={{ animationDelay: '-6s' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 px-12 pt-10">
          <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center backdrop-blur-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">Sir. Platform</span>
        </div>

        {/* Headline */}
        <div className="relative z-10 mt-auto px-12 pb-10">
          <h2 className="text-white text-[2.125rem] font-bold leading-[1.18] tracking-tight mb-4">
            A precise workspace<br />for serious documents.
          </h2>
          <p className="text-white/60 text-[0.9375rem] leading-relaxed mb-10 max-w-[280px]">
            Write LaTeX, manage files, and review compiled PDFs in one calm editorial workspace.
          </p>

          {/* Feature list */}
          <div className="flex flex-col gap-3">
            {[
              { label: 'LuaLaTeX compilation from the browser' },
              { label: 'Document, asset, and PDF management' },
              { label: 'Secure OAuth access for every session' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-white/20 border border-white/25 flex items-center justify-center shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/70 text-sm">{f.label}</span>
              </div>
            ))}
          </div>

          <p className="text-white/35 text-xs mt-10">Private beta · Secure document operations</p>
        </div>
      </div>

      {/* ── Form Panel ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        {/* Orbs on mobile only */}
        <div className="lg:hidden ambient-orb bg-primary/15 w-96 h-96 -top-20 -right-20" style={{ animationDelay: '0s' }} />
        <div className="lg:hidden ambient-orb bg-primary/10 w-80 h-80 bottom-0 -left-16" style={{ animationDelay: '-4s' }} />

        <div className="relative z-10 w-full max-w-[360px] fade-up">

          {/* Logo — mobile only */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-semibold text-slate-800 text-[15px]">Sir. Platform</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[1.875rem] font-bold tracking-tight text-slate-800 mb-1.5 leading-tight">
              Welcome back
            </h1>
            <p className="text-slate-500 text-[0.9375rem]">Open your LaTeX workspace.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="neo-alert-error flex items-start gap-3 p-4 rounded-xl mb-6 text-sm">
              <svg className="w-4.5 h-4.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-slate-400 text-sm">Establishing connection...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button onClick={handleLogin}
                className="neo-btn neo-btn-primary w-full h-12 rounded-xl text-[0.9375rem] font-semibold gap-2.5">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Continue to Sir
              </button>

              <div className="flex items-center gap-3 my-0.5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-slate-400 text-xs font-medium">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <button onClick={() => navigate('/register')}
                className="neo-btn neo-btn-soft w-full h-11 rounded-xl text-[0.9375rem]">
                Create a new account
              </button>
            </div>
          )}

          <p className="mt-10 text-center text-slate-400 text-xs">
            Sir. Platform · OAuth protected
          </p>
        </div>
      </div>
    </div>
  );
}
