import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLocalStorage, useDebounceValue } from "usehooks-ts";
import CodeMirror from "@uiw/react-codemirror";
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

  const [fileName, setFileName] = useState("untitled.tex");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmNewDoc, setConfirmNewDoc] = useState(false);
  const [editorLoading, setEditorLoading] = useState(!!fileId);

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

  const compile = useCallback(async () => {
    if (!debouncedCode.trim() || !accessToken) return;

    setStatus("compiling");
    setErrorMsg("");
    setCompileLog("");

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
        setStatus("done");
        setShowLog(false);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Compilation failed");
        setCompileLog(data.log || "");
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
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saveFile]);

  const handleDownloadPdf = () => {
    if (!pdfBytes) return;
    const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.tex$/, "") + ".pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <div className="flex items-center gap-3">
          {/* Engine selector */}
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as Engine)}
            className="neo-select px-3 py-1.5 rounded-xl text-slate-700 text-xs font-mono cursor-pointer"
          >
            <option value="lualatex">LuaLaTeX</option>
            <option value="pdflatex">pdfLaTeX</option>
            <option value="xelatex">XeLaTeX</option>
          </select>

          {/* Compile status */}
          <div
            className={`neo-inset flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl ${statusColor}`}
          >
            {status === "compiling" && (
              <span className="loading loading-spinner loading-xs" />
            )}
            {status === "done" && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {status === "error" && (
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
                />
              </svg>
            )}
            {statusLabel}
          </div>

          {/* Save */}
          <button
            onClick={saveFile}
            disabled={saveStatus === "saving"}
            className={`neo-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:cursor-not-allowed ${
              saveStatus === "saved"
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : saveStatus === "error"
                  ? "bg-rose-100 text-rose-700 border border-rose-200"
                  : "neo-btn-soft text-slate-700 disabled:opacity-50"
            }`}
          >
            {saveStatus === "saving" && (
              <span className="loading loading-spinner loading-xs" />
            )}
            {saveStatus === "saved" && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
            {saveStatus === "idle" && (
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
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            )}
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "error"
                  ? "Error"
                  : "Save"}
          </button>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPdf}
            disabled={!pdfBytes}
            className="neo-btn neo-btn-primary flex items-center gap-2 px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors border-0"
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
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* ─── Error banner ─── */}
      {status === "error" && errorMsg && (
        <div className="neo-alert-error shrink-0 flex items-center justify-between px-6 py-2 text-xs font-mono rounded-none">
          <span>⚠ {errorMsg}</span>
          {compileLog && (
            <button
              onClick={() => setShowLog((v) => !v)}
              className="ml-4 underline underline-offset-2 hover:text-rose-300 transition-colors"
            >
              {showLog ? "Hide log" : "Show log"}
            </button>
          )}
        </div>
      )}

      {/* ─── Compile log panel ─── */}
      {showLog && compileLog && (
        <div className="neo-inset shrink-0 max-h-48 overflow-y-auto border-b border-rose-200 px-6 py-3 rounded-none">
          <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
            {compileLog}
          </pre>
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

            {/* Compiling overlay */}
            {status === "compiling" && (
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
