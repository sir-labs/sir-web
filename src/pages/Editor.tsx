import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalStorage, useDebounceValue } from 'usehooks-ts';

const COMPILE_URL = import.meta.env.VITE_COMPILE_URL ?? 'https://ipulab.com/service/latex-server/compile';

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

type CompileStatus = 'idle' | 'compiling' | 'done' | 'error';
type ViewMode = 'split' | 'editor' | 'preview';
type Engine = 'lualatex' | 'pdflatex' | 'xelatex';

export default function Editor() {
  const navigate = useNavigate();
  const [accessToken] = useLocalStorage<string | null>('access_token', null);

  const [latexCode, setLatexCode] = useState(DEFAULT_LATEX);
  const [debouncedCode, setDebouncedCode] = useDebounceValue(DEFAULT_LATEX, 800);

  const [status, setStatus] = useState<CompileStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [compileLog, setCompileLog] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [engine, setEngine] = useState<Engine>('lualatex');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) navigate('/', { replace: true });
  }, [accessToken, navigate]);

  const compile = useCallback(async () => {
    if (!debouncedCode.trim()) return;

    setStatus('compiling');
    setErrorMsg('');
    setCompileLog('');

    try {
      const res = await fetch(COMPILE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: debouncedCode, engine }),
      });

      if (res.ok) {
        const blob = await res.blob();
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        const url = URL.createObjectURL(blob);
        pdfUrlRef.current = url;
        setPdfUrl(url);
        setStatus('done');
        setShowLog(false);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Compilation failed');
        setCompileLog(data.log || '');
        setStatus('error');
      }
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || 'Network error');
      setStatus('error');
    }
  }, [debouncedCode, engine]);

  useEffect(() => {
    compile();
  }, [compile]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  const handleDownloadPdf = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = 'document.pdf';
    a.click();
  };

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = latexCode.substring(0, start) + '  ' + latexCode.substring(end);
    setLatexCode(newVal);
    setDebouncedCode(newVal);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
  };

  const statusColor = {
    idle: 'text-slate-400',
    compiling: 'text-indigo-400',
    done: 'text-emerald-400',
    error: 'text-rose-400',
  }[status];

  const statusLabel = {
    idle: 'Ready',
    compiling: 'Compiling...',
    done: 'Compiled',
    error: 'Error',
  }[status];

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">

      {/* ─── Navbar ─── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-slate-900/60 backdrop-blur-md z-10">
        {/* Left */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-fuchsia-400 leading-none">LaTeX Studio</h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-0.5">LuaLaTeX ENGINE</p>
          </div>
        </div>

        {/* Center — view toggle */}
        <div className="hidden md:flex items-center bg-slate-900 rounded-xl p-1 border border-white/10 gap-1">
          {(['split', 'editor', 'preview'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${viewMode === m
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300'
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
            onChange={e => setEngine(e.target.value as Engine)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-indigo-500/50 cursor-pointer"
          >
            <option value="lualatex">LuaLaTeX</option>
            <option value="pdflatex">pdfLaTeX</option>
            <option value="xelatex">XeLaTeX</option>
          </select>

          {/* Compile status */}
          <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-800 border border-white/10 ${statusColor}`}>
            {status === 'compiling' && <span className="loading loading-spinner loading-xs" />}
            {status === 'done' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            {status === 'error' && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
              </svg>
            )}
            {statusLabel}
          </div>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPdf}
            disabled={!pdfUrl}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* ─── Error banner ─── */}
      {status === 'error' && errorMsg && (
        <div className="shrink-0 flex items-center justify-between px-6 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs font-mono">
          <span>⚠ {errorMsg}</span>
          {compileLog && (
            <button
              onClick={() => setShowLog(v => !v)}
              className="ml-4 underline underline-offset-2 hover:text-rose-300 transition-colors"
            >
              {showLog ? 'Hide log' : 'Show log'}
            </button>
          )}
        </div>
      )}

      {/* ─── Compile log panel ─── */}
      {showLog && compileLog && (
        <div className="shrink-0 max-h-48 overflow-y-auto bg-slate-950 border-b border-rose-500/20 px-6 py-3">
          <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">{compileLog}</pre>
        </div>
      )}

      {/* ─── Panes ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Editor Pane */}
        {(viewMode === 'split' || viewMode === 'editor') && (
          <div className={`flex flex-col min-h-0 ${viewMode === 'split' ? 'w-1/2' : 'w-full'} border-r border-white/10 bg-slate-900/50 relative`}>
            <div className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-slate-600 uppercase pointer-events-none z-10 select-none">source.tex</div>
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Line numbers */}
              <div className="select-none text-right text-slate-700 font-mono text-xs py-6 pl-4 pr-3 leading-relaxed bg-slate-950/30 border-r border-white/5 min-w-[3rem] overflow-hidden">
                {latexCode.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                id="latex-source-editor"
                name="latex-source"
                value={latexCode}
                onChange={e => {
                  setLatexCode(e.target.value);
                  setDebouncedCode(e.target.value);
                }}
                onKeyDown={handleTabKey}
                spellCheck={false}
                className="flex-1 p-6 bg-transparent text-slate-300 font-mono text-sm leading-relaxed focus:outline-none resize-none overflow-auto scrollbar-thin"
              />
            </div>
          </div>
        )}

        {/* Preview Pane */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className={`flex flex-col min-h-0 ${viewMode === 'split' ? 'w-1/2' : 'w-full'} bg-slate-100 relative`}>
            <div className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase pointer-events-none z-10 select-none bg-slate-100/80 px-2 py-0.5 rounded">Preview</div>

            {/* Compiling overlay */}
            {status === 'compiling' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-100/80 backdrop-blur-sm gap-3">
                <span className="loading loading-spinner loading-lg text-indigo-500" />
                <p className="text-xs font-mono text-slate-500">Compiling with {engine}...</p>
              </div>
            )}

            {/* Empty state */}
            {!pdfUrl && status !== 'compiling' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs text-slate-400 font-mono">No preview yet</p>
              </div>
            )}

            {pdfUrl && (
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                title="LaTeX Preview"
                className="w-full h-full border-none"
              />
            )}
          </div>
        )}
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </div>
  );
}
