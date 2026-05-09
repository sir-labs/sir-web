import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLocalStorage, useDebounceValue } from "usehooks-ts";
import CodeMirror from "@uiw/react-codemirror";
import { pdfjs } from "react-pdf";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PdfViewer } from "../components/PdfViewer";
import { latexExtensions } from "../lib/latexLang";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:8787";

const DEFAULT_LATEX = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{fontspec}
\\usepackage{babel}

\\babelprovide[import, onchar=ids fonts]{thai}
\\babelprovide[import, onchar=ids fonts]{english}

\\babelfont{rm}{Noto Sans}
\\babelfont[thai]{rm}{Noto Sans Thai}

\\babelfont{tt}{Noto Sans Mono}
\\babelfont[thai]{tt}{Noto Sans Thai}

\\begin{document}

\\title{\\textbf{LaTeX Studio}}
\\author{SIR.PLATFORM}
\\date{\\today}
\\maketitle

\\section{Introduction}
Welcome to the \\textbf{in-browser} LaTeX editor powered by real \\textit{LuaLaTeX}.
Type LaTeX code on the left --- the live preview updates automatically on the right.

\\section{Basic Math}
Inline math: $E = mc^2$ and $e^{i\\pi} + 1 = 0$.

The quadratic formula:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

A matrix:
$$\\left(\\begin{array}{cc} a & b \\\\ c & d \\end{array}\\right)$$

\\section{Formatting}
\\textbf{Bold}, \\textit{italic}, \\underline{underlined}, and \\texttt{monospace}.

\\section{Lists}
\\begin{itemize}
  \\item Real LuaLaTeX compilation via API
  \\item Full package support --- amsmath, fontspec, tikz, and more
  \\item Tab key inserts indentation
\\end{itemize}

\\section{Tables}
\\begin{tabular}{|l|c|r|}
  \\hline
  Left & Center & Right \\\\
  \\hline
  A & B & C \\\\
  D & E & F \\\\
  \\hline
\\end{tabular}

\\end{document}`;

type CompileStatus = "idle" | "compiling" | "done" | "error";
type ViewMode = "split" | "editor" | "preview";
type Engine = "lualatex" | "pdflatex" | "xelatex";
type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UserAsset {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractLatexError(log: string): string {
  const lines = log.split("\n");
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Hard errors: lines starting with "! "
    if (line.startsWith("! ")) {
      const msg = line.slice(2).trim();
      // grab context line (l.NN ...) if available
      const ctx = lines[i + 1]?.trim() ?? "";
      const loc = ctx.match(/^l\.(\d+)/) ? ` (line ${ctx.match(/^l\.(\d+)/)![1]})` : "";
      errors.push(msg + loc);
    }
    // Package / LaTeX warnings treated as errors when fatal
    if (line.includes("==> Fatal error")) break;
  }
  return errors[0] ?? "";
}

export default function Editor() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileId = searchParams.get("id");

  const [accessToken] = useLocalStorage<string | null>("access_token", null);

  const [latexCode, setLatexCode] = useState(fileId ? "" : DEFAULT_LATEX);
  const [debouncedCode, setDebouncedCode] = useDebounceValue(
    fileId ? "" : DEFAULT_LATEX,
    800,
  );

  const [status, setStatus] = useState<CompileStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [compileLog, setCompileLog] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [engine, setEngine] = useState<Engine>("lualatex");
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfVersion, setPdfVersion] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);

  const [fileName, setFileName] = useState("untitled.tex");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmNewDoc, setConfirmNewDoc] = useState(false);
  const [editorLoading, setEditorLoading] = useState(!!fileId);

  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportOpen]);

  useEffect(() => {
    if (!accessToken) navigate("/", { replace: true });
  }, [accessToken, navigate]);

  const loadFile = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      setEditorLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/api/latex-files/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setFileName(data.name);
        setEngine(data.engine as Engine);
        setPdfBytes(null);
        setLatexCode(data.content);
        setDebouncedCode(data.content);
      } catch {
        /* ignore */
      } finally {
        setEditorLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (fileId) loadFile(fileId);
  }, [fileId, loadFile]);

  const fetchAssets = useCallback(async () => {
    if (!accessToken) return;
    setAssetsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/assets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setAssets(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setAssetsLoading(false); }
  }, [accessToken]);

  useEffect(() => {
    if (assetsOpen && assets.length === 0) fetchAssets();
  }, [assetsOpen, assets.length, fetchAssets]);

  const handleAssetUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    e.target.value = "";
    setUploadingAsset(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE_URL}/api/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) return;
      const asset: UserAsset = await res.json();
      setAssets(prev => [asset, ...prev]);
    } catch { /* ignore */ }
    finally { setUploadingAsset(false); }
  }, [accessToken]);

  const handleAssetDelete = useCallback(async (asset: UserAsset) => {
    if (!accessToken) return;
    setDeletingAssetId(asset.id);
    try {
      await fetch(`${BASE_URL}/api/assets/${asset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setAssets(prev => prev.filter(a => a.id !== asset.id));
    } catch { /* ignore */ }
    finally { setDeletingAssetId(null); }
  }, [accessToken]);

  const copyAssetRef = useCallback((asset: UserAsset) => {
    const ext = asset.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["jpg", "jpeg", "png", "pdf", "eps", "svg"].includes(ext);
    const ref = isImage
      ? `\\includegraphics{${asset.name}}`
      : asset.name;
    navigator.clipboard.writeText(ref);
    setCopiedAssetId(asset.id);
    setTimeout(() => setCopiedAssetId(null), 1500);
  }, []);

  const compile = useCallback(async () => {
    if (!debouncedCode.trim() || !accessToken) return;

    setStatus("compiling");
    setErrorMsg("");
    setCompileLog("");
    setCacheStatus(null);

    try {
      const res = await fetch(`${BASE_URL}/api/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ source: debouncedCode, engine }),
      });

      if (res.ok) {
        const buf = await res.arrayBuffer();
        setPdfBytes(new Uint8Array(buf));
        setPdfVersion((v) => v + 1);
        setCacheStatus(res.headers.get("X-Cache"));
        setStatus("done");
        setShowLog(false);
      } else {
        const data = await res.json();
        const log = data.log || "";
        const parsed = extractLatexError(log);
        setErrorMsg(parsed || data.error || "Compilation failed");
        setCompileLog(log);
        setStatus("error");
      }
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || "Network error");
      setStatus("error");
    }
  }, [debouncedCode, engine, accessToken]);

  useEffect(() => {
    compile();
  }, [compile]);

  const saveFile = useCallback(async () => {
    if (saveStatus === "saving" || !accessToken) return;
    setSaveStatus("saving");
    try {
      if (fileId) {
        const res = await fetch(`${BASE_URL}/api/latex-files/${fileId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: fileName, content: latexCode, engine }),
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch(`${BASE_URL}/api/latex-files`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: fileName, content: latexCode, engine }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSearchParams({ id: data.id }, { replace: true });
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [
    saveStatus,
    accessToken,
    fileId,
    fileName,
    latexCode,
    engine,
    setSearchParams,
  ]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        saveFile();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saveFile]);

  // Auto-save when compile succeeds
  const saveFileRef = useRef(saveFile);
  useEffect(() => { saveFileRef.current = saveFile; }, [saveFile]);
  useEffect(() => {
    if (status === "done") saveFileRef.current();
  }, [status]);

  const handleDownloadPdf = () => {
    if (!pdfBytes) return;
    const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.tex$/, "") + ".pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportImages = useCallback(async () => {
    if (!pdfBytes) return;
    const pdf = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
    const baseName = fileName.replace(/\.tex$/, "");
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = pdf.numPages === 1 ? `${baseName}.png` : `${baseName}_p${i}.png`;
          a.click();
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      });
    }
  }, [pdfBytes, fileName]);

  const statusColor = {
    idle: "text-slate-400",
    compiling: "text-indigo-400",
    done: "text-emerald-400",
    error: "text-rose-400",
  }[status];

  const statusLabel = {
    idle: "Ready",
    compiling: "Compiling...",
    done: "Compiled",
    error: "Error",
  }[status];

  return (
    <div className="neo-root h-screen flex flex-col font-sans overflow-hidden">
      {/* ─── Navbar ─── */}
      <header className="glass-panel shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/30 z-10 rounded-none">
        {/* Left */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/dashboard")}
              title="Back to Dashboard"
              className="neo-btn neo-btn-soft w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            >
              <svg
                className="w-4 h-4 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
            <button
              onClick={() => setConfirmNewDoc(true)}
              title="New Document"
              className="neo-btn neo-btn-soft w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-indigo-600"
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
            </button>
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-fuchsia-600 leading-none">
              LaTeX Studio
            </h1>
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="text-[10px] text-slate-600 font-mono bg-transparent border-none outline-none w-36 hover:text-slate-700 focus:text-slate-800 transition-colors mt-0.5"
              placeholder="untitled.tex"
            />
          </div>
        </div>

        {/* Center — view toggle */}
        <div className="neo-inset hidden md:flex items-center rounded-xl p-1 border border-white/30 gap-1">
          {(["split", "editor", "preview"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                viewMode === m
                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">

          {/* Engine */}
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as Engine)}
            className="neo-select px-3 py-1.5 rounded-xl text-slate-700 text-xs font-mono cursor-pointer"
          >
            <option value="lualatex">LuaLaTeX</option>
            <option value="pdflatex">pdfLaTeX</option>
            <option value="xelatex">XeLaTeX</option>
          </select>

          {/* Compile status + cache */}
          <div className="neo-inset flex items-center gap-2 px-3 py-1.5 rounded-xl">
            {status === "compiling" && <span className="loading loading-spinner loading-xs text-indigo-400" />}
            {status === "done"      && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
            {status === "error"     && <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />}
            {status === "idle"      && <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />}
            <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>

            {status === "done" && cacheStatus === "CF-HIT" && (
              <div className="relative group">
                <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 text-[10px] font-semibold border border-cyan-200 cursor-default">
                  Edge cached
                </span>
                <div className="pointer-events-none absolute top-full right-0 mt-2 w-52 rounded-lg bg-slate-800 text-white text-[10px] leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                  <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-800" />
                  <p className="font-bold text-cyan-300 mb-0.5">Cloudflare Edge Cache</p>
                  <p className="text-slate-300">PDF served from the nearest CF datacenter — no compilation needed.</p>
                </div>
              </div>
            )}
            {status === "done" && cacheStatus === "HIT" && (
              <div className="relative group">
                <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-semibold border border-blue-200 cursor-default">
                  Cached
                </span>
                <div className="pointer-events-none absolute top-full right-0 mt-2 w-52 rounded-lg bg-slate-800 text-white text-[10px] leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                  <div className="absolute bottom-full right-4 border-4 border-transparent border-b-slate-800" />
                  <p className="font-bold text-blue-300 mb-0.5">R2 Object Storage Cache</p>
                  <p className="text-slate-300">PDF retrieved from object storage — compilation was skipped.</p>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-200 shrink-0" />

          {/* Assets */}
          <button
            onClick={() => setAssetsOpen(v => !v)}
            className={`neo-btn neo-btn-soft flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              assetsOpen ? "bg-violet-100 text-violet-700 border border-violet-200" : "text-slate-600"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Assets
            {assets.length > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">
                {assets.length > 9 ? "9+" : assets.length}
              </span>
            )}
          </button>

          {/* Save */}
          <button
            onClick={saveFile}
            disabled={saveStatus === "saving"}
            className={`neo-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
              saveStatus === "saved"
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : saveStatus === "error"
                  ? "bg-rose-100 text-rose-700 border border-rose-200"
                  : "neo-btn-soft text-slate-600 disabled:opacity-50"
            }`}
          >
            {saveStatus === "saving" && <span className="loading loading-spinner loading-xs" />}
            {saveStatus === "saved"  && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {(saveStatus === "idle" || saveStatus === "error") && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            )}
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : "Save"}
          </button>

          {/* Export dropdown */}
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportOpen(v => !v)}
              disabled={!pdfBytes}
              className="neo-btn neo-btn-primary flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed border-0 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
              <svg className={`w-3 h-3 transition-transform ${exportOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {exportOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-44 glass-panel border border-white/40 rounded-xl shadow-lg z-50 overflow-hidden py-1">
                <button
                  onClick={() => { handleDownloadPdf(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div>Export as PDF</div>
                    <div className="text-[10px] text-slate-400 font-normal">Original document</div>
                  </div>
                </button>
                <button
                  onClick={() => { handleExportImages(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div>Export as PNG</div>
                    <div className="text-[10px] text-slate-400 font-normal">One image per page</div>
                  </div>
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ─── Error banner ─── */}
      {status === "error" && errorMsg && (
        <div className="neo-alert-error shrink-0 flex items-center justify-between px-6 py-2.5 rounded-none gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
            <span className="text-xs font-mono font-semibold truncate">{errorMsg}</span>
          </div>
          {compileLog && (
            <button
              onClick={() => setShowLog((v) => !v)}
              className="shrink-0 text-[11px] font-semibold underline underline-offset-2 hover:text-rose-300 transition-colors whitespace-nowrap"
            >
              {showLog ? "Hide log" : "Full log"}
            </button>
          )}
        </div>
      )}

      {/* ─── Compile log panel ─── */}
      {showLog && compileLog && (
        <div className="neo-inset shrink-0 max-h-56 overflow-y-auto border-b border-rose-200 px-6 py-3 rounded-none">
          <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
            {compileLog.split("\n").map((line, i) => {
              const isError = line.startsWith("! ");
              const isFatal = line.includes("==> Fatal error");
              return (
                <span
                  key={i}
                  className={
                    isError || isFatal
                      ? "text-rose-600 font-bold"
                      : line.startsWith("l.")
                        ? "text-amber-600"
                        : ""
                  }
                >
                  {line + "\n"}
                </span>
              );
            })}
          </pre>
        </div>
      )}

      {/* ─── Assets Panel ─── */}
      {assetsOpen && (
        <div className="glass-panel shrink-0 border-b border-white/30 px-4 py-3 rounded-none">
          <div className="max-w-full flex items-start gap-3">
            {/* Upload button */}
            <div className="shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleAssetUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAsset}
                className="neo-btn neo-btn-soft flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-violet-600 disabled:opacity-50"
              >
                {uploadingAsset ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                Upload
              </button>
            </div>

            {/* Assets list */}
            <div className="flex-1 min-w-0">
              {assetsLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="loading loading-spinner loading-xs" />
                  Loading files…
                </div>
              )}
              {!assetsLoading && assets.length === 0 && (
                <p className="text-xs text-slate-400">No files uploaded yet. Upload images or resources to reference in your LaTeX code.</p>
              )}
              {assets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {assets.map(asset => (
                    <div key={asset.id}
                      className="neo-inset flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs group">
                      <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="font-mono text-slate-700 max-w-[120px] truncate" title={asset.name}>
                        {asset.name}
                      </span>
                      <span className="text-slate-400">{formatBytes(asset.size)}</span>
                      <button
                        onClick={() => copyAssetRef(asset)}
                        title="Copy reference"
                        className="text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        {copiedAssetId === asset.id ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleAssetDelete(asset)}
                        disabled={deletingAssetId === asset.id}
                        title="Delete"
                        className="text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-50"
                      >
                        {deletingAssetId === asset.id ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {assets.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-2">
                  Click the copy icon to copy a LaTeX reference (e.g. <code className="font-mono">\includegraphics&#123;name.jpg&#125;</code>) to clipboard.
                </p>
              )}
            </div>

            {/* Refresh */}
            <button onClick={fetchAssets} disabled={assetsLoading}
              className="shrink-0 neo-btn neo-btn-soft w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 disabled:opacity-40">
              <svg className={`w-3.5 h-3.5 ${assetsLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ─── Panes ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor Pane */}
        {(viewMode === "split" || viewMode === "editor") && (
          <div
              className={`glass-panel flex flex-col min-h-0 ${viewMode === "split" ? "w-1/2" : "w-full"} border-r border-white/30 relative rounded-none`}
          >
            <div className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-slate-500 uppercase pointer-events-none z-10 select-none">
              {fileName}
            </div>

            {/* File loading overlay */}
            {editorLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/60 backdrop-blur-sm">
                <span className="loading loading-spinner loading-md text-indigo-500" />
                <p className="text-xs font-mono text-slate-500">Loading file…</p>
              </div>
            )}

            <div className="flex flex-1 overflow-hidden min-h-0">
              <CodeMirror
                value={latexCode}
                height="100%"
                style={{ flex: 1, overflow: "hidden" }}
                extensions={latexExtensions}
                onChange={(value) => {
                  setLatexCode(value);
                  setDebouncedCode(value);
                }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: false,
                  history: true,
                  foldGutter: false,
                  drawSelection: true,
                  dropCursor: false,
                  allowMultipleSelections: false,
                  indentOnInput: false,
                  bracketMatching: false,
                  closeBrackets: false,
                  autocompletion: false,
                  rectangularSelection: false,
                  crosshairCursor: false,
                  highlightActiveLine: true,
                  highlightSelectionMatches: false,
                  closeBracketsKeymap: false,
                  defaultKeymap: true,
                  searchKeymap: false,
                  historyKeymap: true,
                  foldKeymap: false,
                  completionKeymap: false,
                  lintKeymap: false,
                }}
              />
            </div>
          </div>
        )}

        {/* Preview Pane */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div
             className={`neo-inset flex flex-col min-h-0 ${viewMode === "split" ? "w-1/2" : "w-full"} bg-slate-100 relative rounded-none`}
          >
            <div className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase pointer-events-none z-10 select-none bg-slate-100/80 px-2 py-0.5 rounded">
              Preview
            </div>

            {/* Compiling overlay — only show when no PDF yet (first compile) */}
            {status === "compiling" && !pdfBytes && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-100/80 backdrop-blur-sm gap-3">
                <span className="loading loading-spinner loading-lg text-indigo-500" />
                <p className="text-xs font-mono text-slate-500">
                  Compiling with {engine}...
                </p>
              </div>
            )}

            {/* Empty state */}
            {!pdfBytes && status !== "compiling" && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <svg
                  className="w-10 h-10 text-slate-300"
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
                <p className="text-xs text-slate-400 font-mono">
                  No preview yet
                </p>
              </div>
            )}

            {pdfBytes && (
              <PdfViewer key={pdfVersion} data={pdfBytes} />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmNewDoc}
        title="New document"
        description="Start a new document? Any unsaved changes will be lost."
        confirmLabel="New document"
        onConfirm={() => {
          setConfirmNewDoc(false);
          setSearchParams({}, { replace: true });
          setFileName("untitled.tex");
          setLatexCode(DEFAULT_LATEX);
          setDebouncedCode(DEFAULT_LATEX);
          setPdfBytes(null);
        }}
        onCancel={() => setConfirmNewDoc(false)}
      />
    </div>
  );
}
