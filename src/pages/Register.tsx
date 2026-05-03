import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const BASE_URL = import.meta.env.VITE_BASE_URL;

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Email already exists. Please sign in instead.');
        }
        throw new Error('Registration failed. Please try again.');
      }

      // Success, redirect to login
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 selection:bg-indigo-500/30">
      
      {/* Background Ambient Orbs */}
      <div className="ambient-orb bg-fuchsia-600/20 w-[500px] h-[500px] top-[-10%] right-[-10%]" style={{ animationDelay: '0s' }}></div>
      <div className="ambient-orb bg-violet-600/20 w-[600px] h-[600px] bottom-[-20%] left-[-10%]" style={{ animationDelay: '-4s' }}></div>

      <div className="relative z-10 w-full max-w-md px-6 animate-slide-up">
        <div className="glass-panel rounded-3xl p-10 flex flex-col items-center">
          
          <div className="relative w-20 h-20 mb-6 flex items-center justify-center rounded-3xl bg-gradient-to-tr from-fuchsia-500/20 to-violet-500/20 border border-white/20 shadow-[0_0_40px_rgba(217,70,239,0.3)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-white">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 pointer-events-none"></div>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight mb-2 bg-gradient-to-br from-white via-indigo-100 to-indigo-400 bg-clip-text text-transparent">
            Initialize Access
          </h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide mb-8 text-center">
            CREATE A NEW SECURE IDENTITY
          </p>

          {error && (
            <div className="w-full p-4 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-3 text-left">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="w-full flex flex-col gap-5">
            <div className="form-control w-full">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                </div>
                <input 
                  type="email" 
                  required
                  placeholder="Email Address" 
                  className="input w-full pl-12 bg-slate-900/50 border border-white/10 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all rounded-xl h-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-control w-full">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input 
                  type="password" 
                  required
                  placeholder="Password" 
                  className="input w-full pl-12 bg-slate-900/50 border border-white/10 text-white placeholder-slate-500 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition-all rounded-xl h-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-2 w-full mt-2">
                <span className="loading loading-spinner loading-md text-fuchsia-400"></span>
                <p className="text-fuchsia-300 text-xs tracking-widest animate-pulse">GENERATING IDENTITY...</p>
              </div>
            ) : (
              <button 
                type="submit"
                className="btn w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white border-0 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(192,38,211,0.4)] hover:shadow-[0_0_30px_rgba(192,38,211,0.6)]"
              >
                Register Credentials
              </button>
            )}
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 w-full text-center">
            <p className="text-slate-400 text-sm">
              Already authorized?{' '}
              <Link to="/" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                Return to Gateway
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
