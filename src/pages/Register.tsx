import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';

const BASE_URL = import.meta.env.VITE_BASE_URL;

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        if (res.status === 409) throw new Error('Email already exists. Please sign in instead.');
        throw new Error('Registration failed. Please try again.');
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Brand Panel (desktop only) ─────────────────── */}
      <div className="hidden lg:flex flex-col relative overflow-hidden w-[440px] xl:w-[500px] shrink-0"
           style={{ background: 'linear-gradient(145deg, #5b21b6 0%, #6d28d9 50%, #7c3aed 100%)' }}>

        <div className="ambient-orb w-[460px] h-[460px] bg-white/8 -top-28 -left-28" style={{ animationDelay: '0s' }} />
        <div className="ambient-orb w-56 h-56 bg-fuchsia-400/18 bottom-20 right-0" style={{ animationDelay: '-5s' }} />

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

        <div className="relative z-10 mt-auto px-12 pb-10">
          <h2 className="text-white text-[2rem] font-bold leading-[1.2] tracking-tight mb-4">
            Join Sir. Platform<br />today.
          </h2>
          <p className="text-white/60 text-[0.9375rem] leading-relaxed max-w-[280px]">
            Create your account and start compiling professional LaTeX documents in minutes.
          </p>
          <p className="text-white/25 text-xs mt-10">v2.0 · Encrypted · Secure</p>
        </div>
      </div>

      {/* ── Form Panel ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>

        <div className="lg:hidden ambient-orb bg-violet-500/14 w-96 h-96 -top-20 -right-20" style={{ animationDelay: '0s' }} />
        <div className="lg:hidden ambient-orb bg-fuchsia-500/10 w-80 h-80 bottom-0 -left-16" style={{ animationDelay: '-4s' }} />

        <div className="relative z-10 w-full max-w-[360px] fade-up">

          {/* Logo — mobile only */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
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
              Create an account
            </h1>
            <p className="text-slate-500 text-[0.9375rem]">Fill in your details to get started.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="neo-alert-error flex items-start gap-3 p-4 rounded-xl mb-6 text-sm">
              <svg className="w-4 h-4 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="flex flex-col gap-5">

            <div>
              <label htmlFor="reg-email" className="field-label">Email address</label>
              <input
                id="reg-email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="neo-input w-full rounded-xl px-4 h-12"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="field-label">Password</label>
              <input
                id="reg-password"
                type="password"
                required
                placeholder="Choose a strong password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="neo-input w-full rounded-xl px-4 h-12"
              />
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-7 h-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                <p className="text-slate-400 text-sm">Creating your account…</p>
              </div>
            ) : (
              <button type="submit"
                className="neo-btn neo-btn-primary w-full h-12 rounded-xl text-[0.9375rem] font-semibold mt-1">
                Create account
              </button>
            )}
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200/70 text-center">
            <p className="text-slate-500 text-sm">
              Already have an account?{' '}
              <Link to="/" className="neo-link">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
