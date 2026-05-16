import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import AdminPanel from "../components/AdminPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { ConfirmDialog } from "../components/ConfirmDialog";

import { AUTH_URL, API_URL } from '../config';

interface UserProfile {
  email: string;
  name?: string;
  role?: string;
}
interface LatexFile {
  id: string;
  user_id: string;
  name: string;
  engine: string;
  created_at: number;
  updated_at: number;
}

function formatDate(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function EngineTag({ engine }: { engine: string }) {
  const colors: Record<string, string> = {
    lualatex: "bg-primary/10 text-primary border-primary/25",
    pdflatex: "bg-surface-card text-primary border-primary/25",
    xelatex:  "bg-primary/10 text-primary border-primary/25",
  };
  return (
    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${colors[engine] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
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
      const res = await fetch(`${AUTH_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error("Failed to load profile.");
      }
      setUser(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (!accessToken) { navigate("/", { replace: true }); return; }
    fetchUserProfile(accessToken);
  }, [accessToken, navigate, fetchUserProfile]);

  const fetchLatexFiles = useCallback(async () => {
    if (!accessToken) return;
    setFilesLoading(true);
    setFilesError("");
    try {
      const res = await fetch(`${API_URL}/api/latex-files`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to load files.");
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setFilesError(err instanceof Error ? err.message : "Failed to load files.");
    } finally {
      setFilesLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) fetchLatexFiles();
  }, [accessToken, fetchLatexFiles]);

  const startRename = (file: LatexFile) => {
    setRenamingId(file.id);
    setRenamingVal(file.name);
  };

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
    } catch {
      setFilesError("Failed to rename file.");
    }
  };

  const handleDeleteFile = async (file: LatexFile) => {
    if (!accessToken) return;
    setDeletingId(file.id);
    setPendingDelete(null);
    try {
      const res = await fetch(`${API_URL}/api/latex-files/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch {
      setFilesError("Failed to delete file.");
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Loading ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="neo-root min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "User";

  return (
    <div className="neo-root relative min-h-screen overflow-hidden">

      {/* Background ambience */}
      <div className="ambient-orb bg-primary/10 w-[700px] h-[700px] top-[-15%] right-[-15%]" style={{ animationDelay: "0s" }} />
      <div className="ambient-orb bg-primary/10  w-[500px] h-[500px] bottom-[-10%] left-[-10%]" style={{ animationDelay: "-5s" }} />

      {/* ── Top Navigation ──────────────────────────────── */}
      <header className="relative z-20">
        <div className="glass-panel border-x-0 border-t-0 rounded-none px-6 py-0">
          <div className="max-w-6xl mx-auto flex items-center justify-between h-14">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/15">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                     strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="font-semibold text-slate-800 text-[15px] tracking-tight">Sir. Platform</span>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
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

      {/* ── Page Content ────────────────────────────────── */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 fade-up">

        {/* Global error */}
        {error && (
          <div className="neo-alert-error flex items-center gap-3 p-4 rounded-xl mb-8 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* ── User Hero ────────────────────────────────── */}
        <div className="glass-panel rounded-xl p-7 mb-6">
          <div className="flex items-center gap-5">

            {/* Avatar */}
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary-active flex items-center justify-center shadow-lg shadow-primary/15 shrink-0">
              <span className="text-2xl font-bold text-white">
                {user?.email?.charAt(0).toUpperCase() ?? "U"}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-tight truncate">
                  {displayName}
                </h1>
                {user?.role && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    user.role === "admin"
                      ? "bg-primary/10 text-primary border-primary/25"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user.role === "admin" ? "bg-primary" : "bg-slate-400"}`} />
                    {user.role}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-sm font-mono truncate">{user?.email}</p>
            </div>

            {/* Status */}
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-600 text-xs font-semibold">Active</span>
            </div>
          </div>
        </div>

        {/* ── Quick Actions Row ────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">

          {/* New Document */}
          <button onClick={() => navigate("/editor")}
            className="glass-panel rounded-xl p-5 text-left hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer group border border-primary/15">
            <div className="flex items-start justify-between mb-4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <svg className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">New document</p>
            <p className="text-slate-700 font-semibold text-[15px]">Open editor</p>
          </button>

          {/* File count */}
          <div className="glass-panel rounded-xl p-5">
            <div className="w-9 h-9 rounded-xl bg-surface-card border border-primary/25 flex items-center justify-center mb-4">
              <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Library</p>
            <p className="text-slate-700 font-semibold text-[15px]">
              {filesLoading ? "—" : `${files.length} file${files.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Connection */}
          <div className="glass-panel rounded-xl p-5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-200 flex items-center justify-center mb-4">
              <svg className="w-4.5 h-4.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Session</p>
            <p className="text-slate-700 font-semibold text-[15px]">Encrypted</p>
          </div>
        </div>

        {/* ── Files Section ─────────────────────────────── */}
        <div className="glass-panel rounded-xl p-6 mb-8">

          {/* Section header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-700">Documents</h2>
              <p className="text-slate-400 text-sm mt-0.5">
                {filesLoading ? "Loading..." : `${files.length} document${files.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchLatexFiles} disabled={filesLoading} title="Refresh"
                className="neo-btn neo-btn-soft w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 transition-colors disabled:opacity-40">
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

          {/* Error */}
          {filesError && (
            <div className="neo-alert-error flex items-center gap-3 p-3 rounded-xl mb-4 text-sm">
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
                  <div className="h-4 bg-white/20 rounded mb-3 w-3/4" />
                  <div className="h-3 bg-white/10 rounded mb-2 w-1/3" />
                  <div className="h-3 bg-white/10 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!filesLoading && files.length === 0 && !filesError && (
            <div className="flex flex-col items-center justify-center py-14 gap-4 text-center">
              <div className="neo-inset w-14 h-14 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-slate-600 font-medium mb-1">No documents yet</p>
                <p className="text-slate-400 text-sm">Create a LaTeX document and compile it from the editor.</p>
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
                  className="neo-inset rounded-xl p-4 flex flex-col gap-3 hover:bg-white/40 transition-colors duration-150">

                  {/* File name + ID */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          className="w-full text-sm font-semibold text-slate-700 bg-white border border-primary/35 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      ) : (
                        <p className="text-sm font-semibold text-slate-700 truncate leading-snug" title={file.name}>
                          {file.name}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        #{file.id}
                      </p>
                    </div>
                  </div>

                  {/* Engine + date */}
                  <div className="flex items-center justify-between">
                    <EngineTag engine={file.engine} />
                    <span className="text-[10px] text-slate-400 font-mono">{formatDate(file.updated_at)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-white/30">
                    <button onClick={() => navigate(`/editor?id=${file.id}`)}
                      className="neo-btn neo-btn-soft flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-primary text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Open
                    </button>
                    <button onClick={() => startRename(file)}
                      title="Rename"
                      className="neo-btn w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                              d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414a2 2 0 01.586-1.414z" />
                      </svg>
                    </button>
                    <button onClick={() => setPendingDelete(file)}
                      disabled={deletingId === file.id}
                      title="Delete"
                      className="neo-btn w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25 flex items-center justify-center disabled:opacity-50">
                      {deletingId === file.id ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Admin Panel ───────────────────────────────── */}
        {user?.role === "admin" && (
          <AdminPanel accessToken={accessToken ?? ""} />
        )}
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
