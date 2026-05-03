import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalStorage, useDebounceValue } from 'usehooks-ts';
import { parse, HtmlGenerator } from 'latex.js';

const DEFAULT_LATEX = `\\documentclass{article}

\\begin{document}

\\title{\\textbf{LaTeX Studio}}
\\author{SIR.PLATFORM}
\\date{\\today}
\\maketitle

\\section{Introduction}
Welcome to the \\textbf{in-browser} LaTeX editor powered by \\textit{latex.js}.
Type LaTeX code on the left --- the live preview updates automatically on the right.

\\section{Basic Math}
Inline math works like this: $E = mc^2$ and $e^{i\\pi} + 1 = 0$.

The quadratic formula:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

A matrix:
$$\\left(\\begin{array}{cc} a & b \\\\ c & d \\end{array}\\right)$$

\\section{Formatting}
\\textbf{Bold}, \\textit{italic}, \\underline{underlined}, and \\texttt{monospace}.

\\section{Lists}
\\begin{itemize}
  \\item Real-time HTML preview via latex.js
  \\item Tab key inserts indentation
  \\item Click \\textbf{Export PDF} to compile with the CDN engine
\\end{itemize}

\\begin{enumerate}
  \\item First item
  \\item Second item
  \\item Third item
\\end{enumerate}

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

type CompileStatus = 'idle' | 'loading' | 'compiling' | 'done' | 'error';

// Environments latex.js cannot handle — strip them and emit a warning instead of crashing.
const UNSUPPORTED_ENVS = ['tabular', 'tabularx', 'longtable', 'array', 'supertabular'];

function preprocessLatex(code: string): { processed: string; skipped: string[] } {
  const skipped: string[] = [];
  let processed = code;
  for (const env of UNSUPPORTED_ENVS) {
    // Match \begin{env} + optional column spec like {|l|c|r|} + content + \end{env}.
    // Build a fresh regex each call — never reuse a /g regex across test()+replace().
    const re = new RegExp(
      `\\\\begin\\{${env}\\}(?:\\{[^}]*\\})?[\\s\\S]*?\\\\end\\{${env}\\}`,
      'g'
    );
    const replacement = `\\textit{[${env}: not supported in browser preview]}`;
    const after = processed.replace(re, replacement);
    if (after !== processed) {
      skipped.push(env);
      processed = after;
    }
  }
  return { processed, skipped };
}
type ViewMode = 'split' | 'editor' | 'preview';

/**
 * Suppress console.error/.log temporarily during latex.js parse()
 * because it emits non-fatal "error loading package" warnings for
 * packages that use dynamic require() — which don't exist in the
 * browser bundle. These warnings are harmless.
 */
function silentParse(code: string) {
  const origError = console.error;
  const origLog = console.log;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (!msg.includes('error loading package')) origError.apply(console, args);
  };
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (!msg.includes('error loading package')) origLog.apply(console, args);
  };
  try {
    const generator = new HtmlGenerator({ hyphenate: false });
    const doc = parse(code, { generator });
    return doc;
  } finally {
    console.error = origError;
    console.log = origLog;
  }
}

const LOADING_STEPS = [
  { label: 'Initializing LaTeX engine...', pct: 15 },
  { label: 'Loading document class...', pct: 35 },
  { label: 'Parsing macros & fonts...', pct: 55 },
  { label: 'Rendering HTML output...', pct: 80 },
  { label: 'Finalizing preview...', pct: 100 },
];

export default function Editor() {
  const navigate = useNavigate();
  const [accessToken] = useLocalStorage<string | null>('access_token', null);

  const [latexCode, setLatexCode] = useState(DEFAULT_LATEX);
  const [debouncedCode, setDebouncedCode] = useDebounceValue(DEFAULT_LATEX, 800);

  const [status, setStatus] = useState<CompileStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [loadingStep, setLoadingStep] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialLoadDone = useRef(false);

  // Auth guard
  useEffect(() => {
    if (!accessToken) navigate('/', { replace: true });
  }, [accessToken, navigate]);

  // Initial loading progress animation
  useEffect(() => {
    if (initialLoadDone.current) return;

    let step = 0;
    const advance = () => {
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
        step++;
        setTimeout(advance, 300 + Math.random() * 200);
      } else {
        initialLoadDone.current = true;
        setStatus('idle');
      }
    };
    advance();
  }, []);

  // Compile whenever debounced code changes
  const compile = useCallback(() => {
    if (status === 'loading') return; // wait for initial load
    if (!debouncedCode.trim()) return;

    setStatus('compiling');
    setErrorMsg('');
    setWarnings([]);

    setTimeout(() => {
      try {
        const { processed, skipped } = preprocessLatex(debouncedCode);
        if (skipped.length) setWarnings(skipped);
        const doc = silentParse(processed);
        const htmlDoc = (doc as any).htmlDocument() as Document;
        const docHtml = htmlDoc.documentElement.outerHTML;

        const iframe = previewRef.current?.querySelector('iframe') as HTMLIFrameElement | null;
        if (iframe) {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            iframeDoc.open();
            iframeDoc.write(docHtml);
            iframeDoc.close();
          }
        }
        setStatus('done');
      } catch (e: unknown) {
        const err = e as Error;
        setStatus('error');
        setErrorMsg(err?.message || 'Compile error — check your LaTeX syntax.');
      }
    }, 30);
  }, [debouncedCode, status]);

  useEffect(() => {
    if (status !== 'loading') compile();
  }, [compile, status]);

  // Download PDF via latexonline.cc CDN
  const handleDownloadPdf = () => {
    const url = `https://latexonline.cc/compile?text=${encodeURIComponent(latexCode)}`;
    window.open(url, '_blank');
  };

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = latexCode.substring(0, start) + '  ' + latexCode.substring(end);
      setLatexCode(newVal);
      setDebouncedCode(newVal);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  const statusColor = {
    idle: 'text-slate-400',
    loading: 'text-amber-400',
    compiling: 'text-indigo-400',
    done: 'text-emerald-400',
    error: 'text-rose-400',
  }[status];

  const statusLabel = {
    idle: 'Ready',
    loading: 'Loading...',
    compiling: 'Compiling...',
    done: 'Compiled',
    error: 'Error',
  }[status];

  // ─── Loading screen ───
  if (status === 'loading') {
    const step = LOADING_STEPS[loadingStep] ?? LOADING_STEPS[LOADING_STEPS.length - 1];
    return (
      <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans">
        {/* Background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px] top-[-10%] left-[-10%] animate-pulse"></div>
          <div className="absolute w-[400px] h-[400px] rounded-full bg-fuchsia-600/10 blur-[100px] bottom-[-10%] right-[-10%] animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8">
          {/* Logo */}
          <div className="w-20 h-20 flex items-center justify-center rounded-3xl bg-gradient-to-tr from-violet-500/20 to-fuchsia-500/20 border border-white/20 shadow-[0_0_30px_rgba(139,92,246,0.3)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>

          <div className="text-center">
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-fuchsia-400 mb-2">LaTeX Studio</h1>
            <p className="text-slate-500 text-sm font-mono tracking-widest">INITIALIZING ENGINE</p>
          </div>

          {/* Progress bar */}
          <div className="w-80">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${step.pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-3">
              <p className="text-xs text-slate-400 font-mono">{step.label}</p>
              <p className="text-xs text-slate-500 font-mono">{step.pct}%</p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex gap-3 mt-2">
            {LOADING_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i <= loadingStep ? 'bg-indigo-400 scale-110' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

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
            <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-0.5">IN-BROWSER ENGINE</p>
          </div>
        </div>

        {/* Center — view toggle */}
        <div className="hidden md:flex items-center bg-slate-900 rounded-xl p-1 border border-white/10 gap-1">
          {(['split', 'editor', 'preview'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                viewMode === m
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
          {/* Compile status */}
          <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-800 border border-white/10 ${statusColor}`}>
            {status === 'compiling' && <span className="loading loading-spinner loading-xs"></span>}
            {status === 'done' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>}
            {status === 'error' && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/></svg>}
            {statusLabel}
          </div>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20"
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
        <div className="shrink-0 px-6 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs font-mono">
          ⚠ {errorMsg}
        </div>
      )}

      {/* ─── Warning banner (non-fatal, e.g. unsupported environments) ─── */}
      {warnings.length > 0 && (
        <div className="shrink-0 px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs font-mono">
          ⚠ Unsupported in browser preview: {warnings.join(', ')} — use <strong>Export PDF</strong> for full rendering.
        </div>
      )}

      {/* ─── Panes ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Editor Pane */}
        {(viewMode === 'split' || viewMode === 'editor') && (
          <div className={`flex flex-col min-h-0 ${viewMode === 'split' ? 'w-1/2' : 'w-full'} border-r border-white/10 bg-slate-900/50 relative`}>
            <div className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-slate-600 uppercase pointer-events-none z-10 select-none">Source.tex</div>

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
          <div className={`flex flex-col min-h-0 ${viewMode === 'split' ? 'w-1/2' : 'w-full'} bg-white relative`}>
            <div className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase pointer-events-none z-10 select-none bg-white/80 px-2 py-0.5 rounded">Preview</div>
            <div ref={previewRef} className="flex-1 overflow-hidden min-h-0">
              <iframe
                title="LaTeX Preview"
                className="w-full h-full border-none"
                sandbox="allow-same-origin"
              />
            </div>
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
