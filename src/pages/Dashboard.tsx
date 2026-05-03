import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import AdminPanel from "../components/AdminPanel";

const BASE_URL = import.meta.env.VITE_BASE_URL;

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
  return (
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function EngineTag({ engine }: { engine: string }) {
  const colors: Record<string, string> = {
    lualatex: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    pdflatex: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    xelatex: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  };
  return (
    <span
      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${colors[engine] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"}`}
    >
      {engine}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useLocalStorage<string | null>(
    "access_token",
    null,
  );
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [files, setFiles] = useState<LatexFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    setAccessToken(null);
    navigate("/", { replace: true });
  }, [setAccessToken, navigate]);

  const fetchUserProfile = useCallback(
    async (token: string) => {
      try {
        const response = await fetch(`${BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          if (response.status === 401) handleLogout();
          throw new Error("Failed to synchronize profile data.");
        }
        const userData: UserProfile = await response.json();
        setUser(userData);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setLoading(false);
      }
    },
    [handleLogout],
  );

  useEffect(() => {
    if (!accessToken) {
      navigate("/", { replace: true });
      return;
    }
    fetchUserProfile(accessToken);
  }, [accessToken, navigate, fetchUserProfile]);

  const fetchLatexFiles = useCallback(async () => {
    if (!accessToken) return;
    setFilesLoading(true);
    setFilesError("");
    try {
      const res = await fetch(`${BASE_URL}/api/latex-files`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to load files.");
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setFilesError(
        err instanceof Error ? err.message : "Failed to load files.",
      );
    } finally {
      setFilesLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) fetchLatexFiles();
  }, [accessToken, fetchLatexFiles]);

  const handleDeleteFile = async (id: string, name: string) => {
    if (!accessToken) return;
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE_URL}/api/latex-files/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {
      setFilesError("Failed to delete file.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-infinity loading-lg text-indigo-500 scale-150"></span>
          <p className="text-indigo-400 text-sm tracking-widest animate-pulse font-medium mt-4">
            DECRYPTING DATA...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Background Ambience */}
      <div
        className="ambient-orb bg-indigo-600/10 w-[800px] h-[800px] top-[-20%] right-[-20%]"
        style={{ animationDelay: "0s" }}
      ></div>
      <div
        className="ambient-orb bg-violet-600/10 w-[600px] h-[600px] bottom-[-10%] left-[-10%]"
        style={{ animationDelay: "-5s" }}
      ></div>

      <div className="relative z-10 w-full max-w-screen-2xl mx-auto px-6 py-12 animate-slide-up">
        {/* Navbar */}
        <div className="glass-panel rounded-3xl px-8 py-4 mb-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-6 h-6 text-white"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                Command Center
              </h1>
              <p className="text-xs text-indigo-400 font-mono tracking-wider">
                SIR.PLATFORM V2
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-ghost rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Disconnect
          </button>
        </div>

        {error && (
          <div className="w-full p-4 mb-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Profile + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {/* Main Identity Card */}
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-3xl p-8 h-full flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity duration-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="w-48 h-48"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4 M12 8h.01" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase mb-8">
                Identity Module
              </h2>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 relative z-10">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-indigo-500 to-fuchsia-500 p-1 shadow-[0_0_40px_rgba(99,102,241,0.4)]">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center border-4 border-slate-900">
                      <span className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-tr from-indigo-400 to-fuchsia-400">
                        {user?.email?.charAt(0).toUpperCase() || "X"}
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
                  <h3 className="text-3xl font-bold text-white tracking-tight">
                    {user?.name || "Authorized User"}
                  </h3>
                  <div className="flex items-center gap-2 text-slate-400 bg-slate-800/50 px-4 py-2 rounded-xl border border-white/5">
                    <svg
                      className="w-4 h-4 text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="font-mono text-sm">
                      {user?.email || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-xl border border-emerald-500/20 mt-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="text-xs font-bold tracking-widest">
                      SYSTEM SECURED
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-6">
            <div
              onClick={() => navigate("/editor")}
              className="glass-panel rounded-3xl p-6 relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_10px_40px_rgba(99,102,241,0.2)] cursor-pointer transition-all duration-300 border border-indigo-500/20"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <h4 className="text-xs font-bold tracking-widest text-indigo-400 uppercase mb-4 flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New Document
              </h4>
              <div className="text-3xl font-bold text-white mb-2">
                LaTeX Studio
              </div>
              <p className="text-sm text-slate-400">Create a new document</p>
            </div>

            <div className="glass-panel rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-bl-full -mr-4 -mt-4"></div>
              <h4 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-4">
                Connection
              </h4>
              <div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-3xl font-light text-white">
                    Encrypted
                  </span>
                </div>
                <p className="text-xs text-violet-300 font-mono">
                  NODE: sir.puem.me
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── LaTeX Files Section ── */}
        <div className="glass-panel rounded-3xl p-8 mb-10">
          {/* Section header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-white">LaTeX Files</h2>
                <p className="text-xs text-slate-500 font-mono">
                  {filesLoading
                    ? "Loading..."
                    : `${files.length} document${files.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchLatexFiles}
                disabled={filesLoading}
                title="Refresh"
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
              >
                <svg
                  className={`w-4 h-4 ${filesLoading ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              <button
                onClick={() => navigate("/editor")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New File
              </button>
            </div>
          </div>

          {/* Files error */}
          {filesError && (
            <div className="p-4 mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>{filesError}</span>
            </div>
          )}

          {/* Loading skeleton */}
          {filesLoading && files.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white/5 border border-white/10 p-5 animate-pulse"
                >
                  <div className="h-4 bg-white/10 rounded-lg mb-3 w-3/4" />
                  <div className="h-3 bg-white/5 rounded-lg mb-2 w-1/3" />
                  <div className="h-3 bg-white/5 rounded-lg w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!filesLoading && files.length === 0 && !filesError && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-white/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-slate-400 font-medium mb-1">
                  No documents yet
                </p>
                <p className="text-slate-600 text-sm">
                  Create your first LaTeX file to get started
                </p>
              </div>
              <button
                onClick={() => navigate("/editor")}
                className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors shadow-lg shadow-indigo-500/20"
              >
                Create first document
              </button>
            </div>
          )}

          {/* File grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="group relative rounded-2xl bg-white/[0.04] border border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all duration-200 p-5 flex flex-col gap-3"
                >
                  {/* File icon + name */}
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mt-0.5">
                      <svg
                        className="w-4 h-4 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-semibold text-slate-200 truncate leading-snug"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p
                        className="text-[11px] text-slate-500 font-mono mt-0.5 truncate"
                        title={file.id}
                      >
                        #{file.id}
                      </p>
                    </div>
                  </div>

                  {/* Engine + date */}
                  <div className="flex items-center justify-between">
                    <EngineTag engine={file.engine} />
                    <span className="text-[10px] text-slate-600 font-mono">
                      {formatDate(file.updated_at)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => navigate(`/editor?id=${file.id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold transition-colors border border-indigo-500/20"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Open
                    </button>
                    <button
                      onClick={() => handleDeleteFile(file.id, file.name)}
                      disabled={deletingId === file.id}
                      title="Delete file"
                      className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 border border-rose-500/20 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === file.id ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin Panel Section */}
        {user?.role === "admin" && (
          <AdminPanel accessToken={accessToken ?? ""} />
        )}
      </div>
    </div>
  );
}
