import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import { ThemeToggle } from "../components/ThemeToggle";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AUTH_URL, API_URL } from '../config';

interface UserProfile { email: string; name?: string; role?: string; }
interface LatexFile {
  id: string; user_id: string; name: string;
  engine: string; created_at: number; updated_at: number;
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function EngineTag({ engine }: { engine: string }) {
  return (
    <span className="badge-pill" style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, letterSpacing: '.02em' }}>
      {engine}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useLocalStorage<string | null>("access_token", null);
  const [user, setUser]               = useState<UserProfile | null>(null);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(true);

  const [files, setFiles]             = useState<LatexFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError]   = useState("");
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LatexFile | null>(null);
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renamingVal, setRenamingVal] = useState("");

  const handleLogout = useCallback(() => {
    setAccessToken(null);
    navigate("/", { replace: true });
  }, [setAccessToken, navigate]);

  const fetchUserProfile = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${AUTH_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { if (res.status === 401) handleLogout(); throw new Error(); }
      setUser(await res.json());
    } catch { setError("Failed to load profile."); }
    finally { setLoading(false); }
  }, [handleLogout]);

  useEffect(() => {
    if (!accessToken) { navigate("/", { replace: true }); return; }
    fetchUserProfile(accessToken);
  }, [accessToken, navigate, fetchUserProfile]);

  const fetchLatexFiles = useCallback(async () => {
    if (!accessToken) return;
    setFilesLoading(true); setFilesError("");
    try {
      const res = await fetch(`${API_URL}/api/latex-files`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch { setFilesError("Failed to load files."); }
    finally { setFilesLoading(false); }
  }, [accessToken]);

  useEffect(() => { if (accessToken) fetchLatexFiles(); }, [accessToken, fetchLatexFiles]);

  const startRename = (file: LatexFile) => { setRenamingId(file.id); setRenamingVal(file.name); };

  const commitRename = async (file: LatexFile) => {
    const name = renamingVal.trim();
    setRenamingId(null);
    if (!name || name === file.name || !accessToken) return;
    try {
      const res = await fetch(`${API_URL}/api/latex-files/${file.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, name } : f));
    } catch { setFilesError("Failed to rename file."); }
  };

  const handleDeleteFile = async (file: LatexFile) => {
    if (!accessToken) return;
    setDeletingId(file.id); setPendingDelete(null);
    try {
      const res = await fetch(`${API_URL}/api/latex-files/${file.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch { setFilesError("Failed to delete file."); }
    finally { setDeletingId(null); }
  };

  if (loading) {
    return (
      <div className="neo-root min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p style={{ color: 'var(--ink-4)', fontSize: '0.875rem' }}>Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "User";

  return (
    <div className="neo-root min-h-screen">

      {/* ── Top Navigation ──────────────────────── */}
      <header className="nav-surface sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">

          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--ink-1)' }}>
              Sir. Platform
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => navigate('/pdf-editor')}
              className="neo-btn neo-btn-soft flex items-center gap-2 h-9 px-4 rounded-xl text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6M9 17h4" />
              </svg>
              PDF Editor
            </button>
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')}
                className="neo-btn neo-btn-soft flex items-center gap-2 h-9 px-4 rounded-xl text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Administration
              </button>
            )}
            <button onClick={handleLogout}
              className="neo-btn neo-btn-soft flex items-center gap-2 h-9 px-4 rounded-xl text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 fade-up">

        {/* Global error */}
        {error && (
          <div className="neo-alert-error flex items-center gap-3 p-4 mb-8 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* ── User hero ─────────────────────────── */}
        <div className="mb-10">
          <p className="mb-1" style={{ color: 'var(--ink-4)', fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Workspace
          </p>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h1 style={{
              fontFamily: '"Cormorant Garamond","EB Garamond",Georgia,serif',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 400,
              letterSpacing: '-0.5px',
              color: 'var(--ink-1)',
              lineHeight: 1.1,
            }}>
              {displayName}
            </h1>
            <div className="flex items-center gap-2 mb-1">
              {user?.role && (
                <span className="badge-pill">
                  <span className={`w-1.5 h-1.5 rounded-full ${user.role === 'admin' ? 'bg-primary' : 'bg-slate-400'}`} />
                  {user.role}
                </span>
              )}
              <span className="badge-pill">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Active session
              </span>
            </div>
          </div>
          <p className="mt-2" style={{ color: 'var(--ink-4)', fontSize: '0.875rem', fontFamily: 'monospace' }}>
            {user?.email}
          </p>
        </div>

        {/* ── Quick stats row ───────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">

          {/* New document — coral accent card */}
          <button onClick={() => navigate("/editor")}
            className="text-left rounded-xl p-5 group transition-all duration-150 hover:-translate-y-0.5"
            style={{ background: '#cc785c', border: 'none', cursor: 'pointer' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,.2)' }}>
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <svg className="w-4 h-4 text-white/50 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1">New document</p>
            <p className="text-white font-semibold text-[15px]">Open editor</p>
          </button>

          {/* Library count */}
          <div className="glass-panel rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg neo-inset flex items-center justify-center mb-4">
              <svg className="w-4 h-4" style={{ color: 'var(--ink-3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }} className="mb-1">Library</p>
            <p className="font-semibold text-[15px]" style={{ color: 'var(--ink-1)' }}>
              {filesLoading ? "—" : `${files.length} file${files.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Session */}
          <div className="glass-panel rounded-xl p-5">
            <div className="w-8 h-8 rounded-lg neo-inset flex items-center justify-center mb-4">
              <svg className="w-4 h-4" style={{ color: 'var(--ink-3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }} className="mb-1">Session</p>
            <p className="font-semibold text-[15px]" style={{ color: 'var(--ink-1)' }}>Encrypted</p>
          </div>
        </div>

        {/* ── Documents section ─────────────────── */}
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-[15px]" style={{ color: 'var(--ink-1)' }}>Documents</h2>
              <p style={{ color: 'var(--ink-4)', fontSize: '0.8125rem' }} className="mt-0.5">
                {filesLoading ? "Loading..." : `${files.length} document${files.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchLatexFiles} disabled={filesLoading} title="Refresh"
                className="neo-btn neo-btn-soft w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40">
                <svg className={`w-4 h-4 ${filesLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button onClick={() => navigate("/editor")}
                className="neo-btn neo-btn-primary flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                New document
              </button>
            </div>
          </div>

          {/* Files error */}
          {filesError && (
            <div className="neo-alert-error flex items-center gap-3 p-3 mb-4 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{filesError}</span>
            </div>
          )}

          {/* Skeleton */}
          {filesLoading && files.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="neo-inset rounded-xl p-4 animate-pulse">
                  <div className="h-4 rounded mb-3 w-3/4" style={{ background: 'var(--hairline)' }} />
                  <div className="h-3 rounded mb-2 w-1/3" style={{ background: 'var(--hairline-soft)' }} />
                  <div className="h-3 rounded w-1/2" style={{ background: 'var(--hairline-soft)' }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!filesLoading && files.length === 0 && !filesError && (
            <div className="glass-panel rounded-xl flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="neo-inset w-12 h-12 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5" style={{ color: 'var(--ink-4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>No documents yet</p>
                <p style={{ color: 'var(--ink-4)', fontSize: '0.875rem' }}>
                  Create a LaTeX document and compile it from the editor.
                </p>
              </div>
              <button onClick={() => navigate("/editor")}
                className="neo-btn neo-btn-primary mt-1 h-10 px-5 rounded-xl text-sm font-semibold">
                Create document
              </button>
            </div>
          )}

          {/* File grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {files.map(file => (
                <div key={file.id}
                  className="glass-panel rounded-xl p-4 flex flex-col gap-3 transition-shadow duration-150 hover:shadow-md">

                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg neo-inset flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      {renamingId === file.id ? (
                        <input
                          autoFocus
                          value={renamingVal}
                          onChange={e => setRenamingVal(e.target.value)}
                          onBlur={() => commitRename(file)}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitRename(file);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="w-full text-sm font-semibold neo-input rounded px-1.5 py-0.5"
                          style={{ color: 'var(--ink-1)' }}
                        />
                      ) : (
                        <p className="text-sm font-semibold truncate leading-snug" style={{ color: 'var(--ink-1)' }} title={file.name}>
                          {file.name}
                        </p>
                      )}
                      <p className="text-[11px] mt-0.5 truncate font-mono" style={{ color: 'var(--ink-4)' }}>
                        #{file.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <EngineTag engine={file.engine} />
                    <span className="text-[10px] font-mono" style={{ color: 'var(--ink-4)' }}>
                      {formatDate(file.updated_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                    <button onClick={() => navigate(`/editor?id=${file.id}`)}
                      className="neo-btn neo-btn-primary flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Open
                    </button>
                    <button onClick={() => startRename(file)} title="Rename"
                      className="neo-btn neo-btn-soft w-8 h-8 rounded-lg flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                              d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414a2 2 0 01.586-1.414z" />
                      </svg>
                    </button>
                    <button onClick={() => setPendingDelete(file)} disabled={deletingId === file.id}
                      title="Delete"
                      className="neo-btn neo-btn-soft w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-50"
                      style={{ color: 'var(--accent)' }}>
                      {deletingId === file.id
                        ? <span className="loading loading-spinner loading-xs" />
                        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document"
        description={`"${pendingDelete?.name}" will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => pendingDelete && handleDeleteFile(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
