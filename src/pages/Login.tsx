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
  const [error, setError] = useState('');

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
    formData.append('grant_type', 'authorization_code');
    formData.append('code', code);
    formData.append('client_id', CLIENT_ID);
    formData.append('client_secret', CLIENT_SECRET);
    formData.append('redirect_uri', redirectUri);
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
    <div className="min-h-screen flex" style={{ background: 'var(--page-bg)' }}>

      {/* ── Left — Dark product panel ─────────────── */}
      <div className="hidden lg:flex flex-col w-[460px] xl:w-[520px] shrink-0 relative overflow-hidden"
           style={{ background: '#141210' }}>

        {/* Subtle coral glow top-right */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(204,120,92,.18) 0%, transparent 70%)' }} />
        {/* Amber glow bottom-left */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(232,165,90,.12) 0%, transparent 70%)' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 px-12 pt-12">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white/90 font-semibold text-[15px] tracking-tight">Sir. Platform</span>
        </div>

        {/* Hero text */}
        <div className="relative z-10 mt-auto px-12 pb-14">
          <h2 className="text-white leading-[1.12] mb-5"
              style={{ fontFamily: '"Cormorant Garamond","EB Garamond",Georgia,serif', fontSize: '2.375rem', fontWeight: 400, letterSpacing: '-0.5px' }}>
            A precise workspace<br />for serious documents.
          </h2>
          <p className="mb-10 leading-relaxed max-w-[300px]"
             style={{ color: 'rgba(250,249,245,.50)', fontSize: '0.9375rem' }}>
            Write LaTeX, manage files, and review compiled PDFs — in one calm editorial workspace.
          </p>

          <div className="flex flex-col gap-3.5">
            {[
              'LuaLaTeX compilation from the browser',
              'Document, asset, and PDF management',
              'Secure OAuth access for every session',
            ].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border border-primary/60 flex items-center justify-center shrink-0">
                  <svg className="w-2 h-2 text-primary" fill="currentColor" viewBox="0 0 8 8">
                    <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>
                <span style={{ color: 'rgba(250,249,245,.55)', fontSize: '0.875rem' }}>{f}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t" style={{ borderColor: 'rgba(250,249,245,.08)' }}>
            <p style={{ color: 'rgba(250,249,245,.25)', fontSize: '0.75rem' }}>
              Private beta · Secure document operations
            </p>
          </div>
        </div>
      </div>

      {/* ── Right — Cream form panel ──────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 relative"
           style={{ background: 'var(--canvas)' }}>

        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[360px] fade-up">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-12 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-semibold text-[15px]" style={{ color: 'var(--ink-1)' }}>Sir. Platform</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="mb-1.5" style={{
              fontFamily: '"Cormorant Garamond","EB Garamond",Georgia,serif',
              fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.3px', color: 'var(--ink-1)', lineHeight: 1.15
            }}>
              Welcome back
            </h1>
            <p style={{ color: 'var(--ink-3)', fontSize: '0.9375rem' }}>
              Open your LaTeX workspace.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="neo-alert-error flex items-start gap-3 p-4 mb-6 text-sm">
              <svg className="w-4 h-4 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p style={{ color: 'var(--ink-4)', fontSize: '0.875rem' }}>Establishing connection...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button onClick={handleLogin}
                className="neo-btn neo-btn-primary w-full h-12 rounded-xl text-[0.9375rem] font-semibold gap-2.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Continue to Sir
              </button>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                <span style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 500 }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <button onClick={() => navigate('/register')}
                className="neo-btn neo-btn-soft w-full h-11 rounded-xl text-[0.9375rem]">
                Create a new account
              </button>
            </div>
          )}

          <p className="mt-10 text-center" style={{ color: 'var(--ink-4)', fontSize: '0.75rem' }}>
            Sir. Platform · OAuth protected
          </p>
        </div>
      </div>
    </div>
  );
}
