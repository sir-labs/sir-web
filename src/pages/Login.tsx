import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';

const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
const BASE_URL = import.meta.env.VITE_BASE_URL;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accessToken, setAccessToken] = useLocalStorage<string | null>('access_token', null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (accessToken) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const code = searchParams.get('code');
    if (code) {
      setLoading(true);
      exchangeToken(code)
        .then(() => {
          navigate('/dashboard', { replace: true });
        })
        .catch((err) => {
          setError(err.message);
          setSearchParams({});
        })
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

    const response = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) throw new Error('Authentication failed. Please try again.');

    const data = await response.json();
    if (data.access_token) setAccessToken(data.access_token);
  };

  const handleLogin = () => {
    const redirectUri = window.location.origin + '/';
    window.location.href = `${BASE_URL}/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 selection:bg-indigo-500/30">
      
      {/* Background Ambient Orbs */}
      <div className="ambient-orb bg-violet-600/30 w-[500px] h-[500px] top-[-10%] left-[-10%]" style={{ animationDelay: '0s' }}></div>
      <div className="ambient-orb bg-indigo-600/20 w-[600px] h-[600px] bottom-[-20%] right-[-10%]" style={{ animationDelay: '-4s' }}></div>
      <div className="ambient-orb bg-fuchsia-600/20 w-[300px] h-[300px] top-[40%] left-[50%] -translate-x-1/2" style={{ animationDelay: '-2s' }}></div>

      <div className="relative z-10 w-full max-w-md px-6 animate-slide-up">
        <div className="glass-panel rounded-3xl p-10 text-center flex flex-col items-center">
          
          <div className="relative w-24 h-24 mb-8 flex items-center justify-center rounded-3xl bg-gradient-to-tr from-violet-500/20 to-fuchsia-500/20 border border-white/20 shadow-[0_0_40px_rgba(139,92,246,0.3)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 pointer-events-none"></div>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight mb-3 bg-gradient-to-br from-white via-indigo-100 to-indigo-400 bg-clip-text text-transparent">
            Sir. Platform
          </h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide mb-8">
            ENTER THE SECURE GATEWAY
          </p>

          {error && (
            <div className="w-full p-4 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-3 text-left">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-4 w-full">
              <span className="loading loading-spinner loading-lg text-indigo-400"></span>
              <p className="text-indigo-300 text-sm tracking-widest animate-pulse">ESTABLISHING CONNECTION...</p>
            </div>
          ) : (
            <button 
              onClick={handleLogin} 
              className="btn w-full h-14 rounded-2xl glass-btn text-lg font-semibold tracking-wide flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
              Sign In with Sir
            </button>
          )}

        </div>
        
        <p className="text-center text-slate-500 text-xs mt-8 font-medium tracking-widest">
          SYSTEM V2.0 • ENCRYPTED
        </p>
      </div>
    </div>
  );
}
