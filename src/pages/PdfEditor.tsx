import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { API_URL } from '../config';

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = 'cursor' | 'highlight' | 'rectangle' | 'note';
type ViewMode = 'continuous' | 'fit-page' | 'two-up' | 'single';

interface Annotation {
  id: string;
  page: number;
  type: 'highlight' | 'rectangle' | 'note';
  x: number;      // 0–1 fraction of page width
  y: number;      // 0–1 fraction of page height
  width: number;
  height: number;
  text?: string;
}

interface DrawState {
  page: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// ── Note popup component ───────────────────────────────────────────────────────

function NotePopup({
  clientX,
  clientY,
  initialText,
  onConfirm,
  onCancel,
}: {
  clientX: number;
  clientY: number;
  initialText: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const left = Math.min(clientX + 12, window.innerWidth - 288);
  const top  = Math.min(clientY + 12, window.innerHeight - 180);

  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 100, width: 272 }}
      className="glass-panel rounded-xl shadow-2xl border p-4"
      onClick={e => e.stopPropagation()}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Add note</p>
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type your note…"
        className="w-full text-sm resize-none rounded-lg px-2 py-1.5 outline-none"
        style={{
          background: 'var(--neo-surface)',
          border: '1px solid var(--hairline)',
          color: 'var(--ink-1)',
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirm(text); }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="flex gap-2 mt-3">
        <button onClick={() => onConfirm(text)} className="neo-btn neo-btn-primary h-8 px-3 text-xs flex-1">
          Save
        </button>
        <button onClick={onCancel} className="neo-btn neo-btn-soft h-8 px-3 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PdfEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assetId       = searchParams.get('assetId');
  const assetNameParam = searchParams.get('name');

  const [accessToken] = useLocalStorage<string | null>('access_token', null);

  const [pdfData,    setPdfData]    = useState<Uint8Array | null>(null);
  const [numPages,   setNumPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTool, setActiveTool] = useState<Tool>('cursor');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing,    setDrawing]    = useState<DrawState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteEditing, setNoteEditing] = useState<{
    id: string; text: string; clientX: number; clientY: number;
  } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<{ id: string; x: number; y: number } | null>(null);
  const [fileName,   setFileName]   = useState(assetNameParam ?? '');
  const [assetLoading, setAssetLoading] = useState(!!assetId);
  const [viewerWidth, setViewerWidth] = useState(800);
  const [viewerHeight, setViewerHeight] = useState(600);
  const [zoom, setZoom] = useState(1.0);
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [pageAspectRatio, setPageAspectRatio] = useState(1.414); // default A4 h/w

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const viewerRef     = useRef<HTMLDivElement>(null);
  const pageRefs      = useRef<(HTMLDivElement | null)[]>([]);
  const thumbRefs     = useRef<(HTMLDivElement | null)[]>([]);

  // Stable file object for react-pdf (slice to avoid ArrayBuffer transfer)
  const pdfFile = useMemo(
    () => (pdfData ? { data: pdfData.slice() } : null),
    [pdfData],
  );

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) navigate('/', { replace: true });
  }, [accessToken, navigate]);

  // ── Load PDF from asset ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!assetId || !accessToken) { setAssetLoading(false); return; }
    fetch(`${API_URL}/api/assets/${assetId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async res => {
        if (!res.ok) throw new Error();
        const buf = await res.arrayBuffer();
        setPdfData(new Uint8Array(buf));
        if (assetNameParam) setFileName(assetNameParam);
      })
      .catch(() => {})
      .finally(() => setAssetLoading(false));
  }, [assetId, assetNameParam, accessToken]);

  // ── Measure viewer width on resize ──────────────────────────────────────────
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setViewerWidth(e.contentRect.width);
      setViewerHeight(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Persist / restore annotations ──────────────────────────────────────────
  useEffect(() => {
    if (!fileName) return;
    const raw = localStorage.getItem(`sir:ann:${fileName}`);
    if (raw) { try { setAnnotations(JSON.parse(raw)); } catch { /* ignore */ } }
  }, [fileName]);

  const persist = useCallback((anns: Annotation[]) => {
    if (fileName) localStorage.setItem(`sir:ann:${fileName}`, JSON.stringify(anns));
  }, [fileName]);

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const name = file.name;
      localStorage.removeItem(`sir:ann:${name}`);
      setPdfData(new Uint8Array(ev.target!.result as ArrayBuffer));
      setFileName(name);
      setAnnotations([]);
      setNumPages(0);
      setCurrentPage(1);
      setSelectedId(null);
      setDrawing(null);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ── Page tracking via IntersectionObserver ──────────────────────────────────
  useEffect(() => {
    if (!numPages || !viewerRef.current) return;
    const root = viewerRef.current;
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) setCurrentPage(idx + 1);
          }
        });
      },
      { threshold: 0.3, root },
    );
    pageRefs.current.slice(0, numPages).forEach(el => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [numPages, pdfData]);

  // Scroll active thumbnail into view
  useEffect(() => {
    thumbRefs.current[currentPage - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentPage]);

  const scrollToPage = useCallback((page: number) => {
    setCurrentPage(page);
    if (viewMode !== 'single') {
      pageRefs.current[page - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [viewMode]);

  // ── SVG coordinate helpers ──────────────────────────────────────────────────
  const svgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const handleMouseDown = useCallback((page: number) => (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'cursor') return;
    e.preventDefault();
    const { x, y } = svgCoords(e);
    setDrawing({ page, startX: x, startY: y, currentX: x, currentY: y });
    setSelectedId(null);
  }, [activeTool]);

  const handleMouseMove = useCallback((page: number) => (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawing || drawing.page !== page) return;
    const { x, y } = svgCoords(e);
    setDrawing(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  }, [drawing]);

  const handleMouseUp = useCallback((page: number) => (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawing || drawing.page !== page) return;
    const { x, y } = svgCoords(e);
    const x0 = Math.min(drawing.startX, x);
    const y0 = Math.min(drawing.startY, y);
    const w  = Math.abs(x - drawing.startX);
    const h  = Math.abs(y - drawing.startY);
    const isNote = activeTool === 'note';

    if (isNote || w > 0.008 || h > 0.008) {
      const id = crypto.randomUUID();
      const ann: Annotation = {
        id, page,
        type: activeTool as 'highlight' | 'rectangle' | 'note',
        x: isNote ? x : x0,
        y: isNote ? y : y0,
        width:  isNote ? 0 : w,
        height: isNote ? 0 : h,
        text: isNote ? '' : undefined,
      };
      const next = [...annotations, ann];
      setAnnotations(next);
      persist(next);
      if (isNote) setNoteEditing({ id, text: '', clientX: e.clientX, clientY: e.clientY });
    }
    setDrawing(null);
  }, [drawing, activeTool, annotations, persist]);

  const handleAnnClick = useCallback((id: string, e: React.MouseEvent) => {
    if (activeTool !== 'cursor') return;
    e.stopPropagation();
    setSelectedId(prev => prev === id ? null : id);
  }, [activeTool]);

  // ── Annotation mutation ─────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const next = annotations.filter(a => a.id !== selectedId);
    setAnnotations(next);
    persist(next);
    setSelectedId(null);
  }, [selectedId, annotations, persist]);

  const confirmNote = useCallback((text: string) => {
    if (!noteEditing) return;
    const next = annotations.map(a => a.id === noteEditing.id ? { ...a, text } : a);
    setAnnotations(next);
    persist(next);
    setNoteEditing(null);
  }, [noteEditing, annotations, persist]);

  const cancelNote = useCallback(() => {
    if (!noteEditing) return;
    const next = annotations.filter(a => a.id !== noteEditing.id);
    setAnnotations(next);
    persist(next);
    setNoteEditing(null);
  }, [noteEditing, annotations, persist]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (noteEditing) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') { setSelectedId(null); setActiveTool('cursor'); }
      if (e.key === 'h') setActiveTool('highlight');
      if (e.key === 'r') setActiveTool('rectangle');
      if (e.key === 'n') setActiveTool('note');
      if (e.key === 'v') setActiveTool('cursor');
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')
        setCurrentPage(p => Math.max(1, p - 1));
      if (e.key === 'ArrowRight' || e.key === 'PageDown')
        setCurrentPage(p => Math.min(numPages, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, noteEditing, numPages]);

  // ── Ctrl+scroll to zoom ─────────────────────────────────────────────────────
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.min(3, Math.max(0.25, +( z + delta).toFixed(2))));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // ── Download ────────────────────────────────────────────────────────────────
  const download = useCallback(() => {
    if (!pdfData) return;
    const url = URL.createObjectURL(new Blob([pdfData.buffer as ArrayBuffer], { type: 'application/pdf' }));
    Object.assign(document.createElement('a'), { href: url, download: fileName || 'document.pdf' }).click();
    URL.revokeObjectURL(url);
  }, [pdfData, fileName]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const baseWidth =
    viewMode === 'two-up'   ? Math.max(180, (viewerWidth - 136) / 2) :
    viewMode === 'fit-page' ? Math.min(viewerWidth - 64, (viewerHeight - 80) / pageAspectRatio) :
    /* continuous / single */  Math.max(380, viewerWidth - 96);
  const pageWidth = baseWidth * zoom;

  const annColor = (type: 'highlight' | 'rectangle', selected: boolean) => ({
    fill:   type === 'highlight' ? 'rgba(254,240,138,0.45)' : 'rgba(204,120,92,0.12)',
    stroke: selected
      ? 'rgba(204,120,92,0.9)'
      : type === 'highlight' ? 'rgba(234,179,8,0.55)' : 'rgba(204,120,92,0.6)',
    strokeWidth: selected ? 2 : 1.5,
  });

  const inProgressColor = activeTool === 'highlight'
    ? { fill: 'rgba(254,240,138,0.35)', stroke: 'rgba(234,179,8,0.7)' }
    : { fill: 'rgba(204,120,92,0.1)',   stroke: 'rgba(204,120,92,0.7)' };

  // Render a single PDF page with SVG annotation overlay
  const renderPage = (pageNumber: number) => {
    const idx         = pageNumber - 1;
    const pageAnns    = annotations.filter(a => a.page === pageNumber);
    const drawingHere = drawing?.page === pageNumber;
    const svgPointer  = activeTool === 'cursor' ? 'none' : 'all';
    const svgCursor   = activeTool === 'cursor' ? 'default' : 'crosshair';
    return (
      <div
        key={pageNumber}
        ref={el => { pageRefs.current[idx] = el; }}
        className="relative shadow-xl shrink-0"
        style={{ width: pageWidth }}
      >
        <Page
          pageNumber={pageNumber}
          width={pageWidth}
          renderTextLayer
          renderAnnotationLayer
          onRenderSuccess={pageNumber === 1
            ? ({ width, height }) => setPageAspectRatio(height / width)
            : undefined}
        />
        <svg
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: svgPointer,
            cursor: svgCursor,
          }}
          onMouseDown={activeTool !== 'cursor' ? handleMouseDown(pageNumber) : undefined}
          onMouseMove={activeTool !== 'cursor' ? handleMouseMove(pageNumber) : undefined}
          onMouseUp={activeTool !== 'cursor'   ? handleMouseUp(pageNumber)   : undefined}
        >
          {pageAnns.map(ann => {
            const sel = ann.id === selectedId;
            if (ann.type === 'note') {
              return (
                <g key={ann.id}
                   style={{ pointerEvents: 'all', cursor: 'pointer' }}
                   onClick={e => handleAnnClick(ann.id, e as unknown as React.MouseEvent)}
                   onMouseEnter={e => setHoveredNote({ id: ann.id, x: e.clientX, y: e.clientY })}
                   onMouseLeave={() => setHoveredNote(null)}>
                  <circle cx={`${ann.x * 100}%`} cy={`${ann.y * 100}%`} r="11"
                    fill={sel ? 'rgba(37,99,235,0.95)' : 'rgba(59,130,246,0.85)'}
                    stroke={sel ? '#1d4ed8' : 'transparent'} strokeWidth="2.5" />
                  <text x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="9" fontWeight="700" fill="white"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>N</text>
                </g>
              );
            }
            const c = annColor(ann.type, sel);
            return (
              <rect key={ann.id}
                x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                width={`${ann.width * 100}%`} height={`${ann.height * 100}%`}
                fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeWidth}
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onClick={e => handleAnnClick(ann.id, e as unknown as React.MouseEvent)}
              />
            );
          })}
          {drawingHere && drawing && (
            <rect
              x={`${Math.min(drawing.startX, drawing.currentX) * 100}%`}
              y={`${Math.min(drawing.startY, drawing.currentY) * 100}%`}
              width={`${Math.abs(drawing.currentX - drawing.startX) * 100}%`}
              height={`${Math.abs(drawing.currentY - drawing.startY) * 100}%`}
              fill={inProgressColor.fill} stroke={inProgressColor.stroke}
              strokeWidth="1.5" strokeDasharray="5 3"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: '100vh', background: 'var(--page-bg)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="nav-surface shrink-0 flex items-center gap-2 px-4">

        {/* Logo / back */}
        <button onClick={() => navigate('/dashboard')} title="Back to Dashboard"
                className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        </button>

        <span className="text-xs" style={{ color: 'var(--ink-4)' }}>/</span>
        <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>PDF Editor</span>

        {fileName && (
          <>
            <span className="text-xs" style={{ color: 'var(--ink-4)' }}>/</span>
            <span className="text-xs font-mono truncate max-w-[180px]" style={{ color: 'var(--ink-2)' }}>
              {fileName}
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* Tools — only when PDF loaded */}
        {pdfData && (
          <>
            {/* Tool selector */}
            <div className="flex items-center gap-0.5 rounded-xl p-1"
                 style={{ background: 'var(--neo-surface)', border: '1px solid var(--hairline)' }}>
              {([
                { tool: 'cursor' as Tool,    title: 'Select (V)',    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2z" /> },
                { tool: 'highlight' as Tool, title: 'Highlight (H)', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /> },
                { tool: 'rectangle' as Tool, title: 'Rectangle (R)', icon: <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /> },
                { tool: 'note' as Tool,      title: 'Note (N)',      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /> },
              ] as { tool: Tool; title: string; icon: React.ReactNode }[]).map(({ tool, title, icon }) => (
                <button key={tool} onClick={() => setActiveTool(tool)} title={title}
                        className="flex h-7 w-7 items-center justify-center rounded-lg transition-all"
                        style={{
                          background: activeTool === tool ? 'var(--accent)' : 'transparent',
                          color:      activeTool === tool ? '#fff' : 'var(--ink-3)',
                        }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
                </button>
              ))}
            </div>

            <div className="w-px h-5 mx-0.5 shrink-0" style={{ background: 'var(--hairline)' }} />

            {/* View mode selector */}
            <div className="flex items-center gap-0.5 rounded-xl p-1"
                 style={{ background: 'var(--neo-surface)', border: '1px solid var(--hairline)' }}>
              {([
                {
                  mode: 'continuous' as ViewMode, title: 'Continuous scroll',
                  icon: <>
                    <rect x="4" y="3" width="16" height="5" rx="1" strokeWidth="1.8" />
                    <rect x="4" y="10" width="16" height="5" rx="1" strokeWidth="1.8" />
                    <rect x="4" y="17" width="16" height="4" rx="1" strokeWidth="1.8" />
                  </>,
                },
                {
                  mode: 'fit-page' as ViewMode, title: 'Fit page',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"
                    d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M12 8v8" />,
                },
                {
                  mode: 'two-up' as ViewMode, title: 'Two pages side by side',
                  icon: <>
                    <rect x="2"  y="4" width="9" height="16" rx="1.5" strokeWidth="1.8" />
                    <rect x="13" y="4" width="9" height="16" rx="1.5" strokeWidth="1.8" />
                  </>,
                },
                {
                  mode: 'single' as ViewMode, title: 'Single page (← →)',
                  icon: <rect x="5" y="3" width="14" height="18" rx="1.5" strokeWidth="1.8" />,
                },
              ] as { mode: ViewMode; title: string; icon: React.ReactNode }[]).map(({ mode, title, icon }) => (
                <button key={mode} onClick={() => setViewMode(mode)} title={title}
                        className="flex h-7 w-7 items-center justify-center rounded-lg transition-all"
                        style={{
                          background: viewMode === mode ? 'var(--accent)' : 'transparent',
                          color:      viewMode === mode ? '#fff' : 'var(--ink-3)',
                        }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
                </button>
              ))}
            </div>

            {/* Delete selected annotation */}
            {selectedId && (
              <button onClick={deleteSelected}
                      className="neo-btn neo-btn-soft h-8 px-2.5 text-xs flex items-center gap-1.5"
                      style={{ color: 'var(--accent)' }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}

            <div className="w-px h-5 mx-1 shrink-0" style={{ background: 'var(--hairline)' }} />

            {/* Zoom */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                      className="neo-btn neo-btn-soft h-7 w-7 flex items-center justify-center rounded-lg text-sm"
                      style={{ color: 'var(--ink-3)' }}>−</button>
              <span className="text-xs font-mono w-10 text-center" style={{ color: 'var(--ink-2)' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
                      className="neo-btn neo-btn-soft h-7 w-7 flex items-center justify-center rounded-lg text-sm"
                      style={{ color: 'var(--ink-3)' }}>+</button>
            </div>

            <div className="w-px h-5 mx-1 shrink-0" style={{ background: 'var(--hairline)' }} />

            {/* Page indicator */}
            <span className="text-xs font-mono shrink-0" style={{ color: 'var(--ink-3)' }}>
              {currentPage} / {numPages}
            </span>

            <div className="w-px h-5 mx-1 shrink-0" style={{ background: 'var(--hairline)' }} />

            {/* Download */}
            <button onClick={download}
                    className="neo-btn neo-btn-soft h-8 px-2.5 text-xs flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          </>
        )}

        {/* Open PDF */}
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
               className="hidden" onChange={handleFileUpload} />
        <button onClick={() => fileInputRef.current?.click()}
                className="neo-btn neo-btn-primary h-8 px-3 text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {pdfData ? 'Open PDF' : 'Open PDF'}
        </button>

        <ThemeToggle />
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Asset loading */}
        {assetLoading && (
          <div className="flex-1 flex items-center justify-center gap-3">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Loading PDF…</p>
          </div>
        )}

        {/* Empty state */}
        {!assetLoading && !pdfData && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                 style={{ background: 'var(--neo-surface)', border: '2px dashed var(--hairline)' }}>
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                   style={{ color: 'var(--ink-4)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6M9 17h4" />
              </svg>
            </div>
            <div className="text-center">
              <h2 style={{
                fontFamily: '"Cormorant Garamond","EB Garamond",Georgia,serif',
                fontSize: '1.875rem', fontWeight: 400, letterSpacing: '-0.3px',
                color: 'var(--ink-1)', lineHeight: 1.15, marginBottom: '0.5rem',
              }}>
                Open a PDF document
              </h2>
              <p style={{ color: 'var(--ink-4)', fontSize: '0.9375rem' }}>
                View, navigate, and annotate PDF files
              </p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}
                    className="neo-btn neo-btn-primary h-12 px-8 text-[0.9375rem] font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Open PDF file
            </button>
            <p style={{ color: 'var(--ink-4)', fontSize: '0.8125rem' }}>
              Or open a PDF from the LaTeX Editor's asset panel
            </p>
          </div>
        )}

        {/* PDF content */}
        {!assetLoading && pdfData && pdfFile && (
          <Document
            file={pdfFile}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            className="flex flex-1 min-h-0 overflow-hidden"
            loading={
              <div className="flex-1 flex items-center justify-center gap-3">
                <span className="loading loading-spinner loading-md text-primary" />
                <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Rendering PDF…</p>
              </div>
            }
            error={
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm" style={{ color: 'var(--accent)' }}>Failed to render PDF.</p>
              </div>
            }
          >
            {/* ── Thumbnail sidebar ──────────────────────────────────────── */}
            <aside className="glass-panel w-[11.5rem] shrink-0 flex flex-col border-r rounded-none"
                   style={{ borderColor: 'var(--hairline)' }}>
              <div className="shrink-0 px-3 py-2.5 border-b text-xs font-semibold"
                   style={{ borderColor: 'var(--hairline)', color: 'var(--ink-3)' }}>
                Pages {numPages > 0 && `(${numPages})`}
              </div>
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
                {Array.from({ length: numPages }, (_, i) => (
                  <div
                    key={i}
                    ref={el => { thumbRefs.current[i] = el; }}
                    onClick={() => scrollToPage(i + 1)}
                    className="cursor-pointer rounded-lg overflow-hidden transition-all select-none"
                    style={{
                      border: `2px solid ${currentPage === i + 1 ? 'var(--accent)' : 'transparent'}`,
                    }}
                  >
                    <div className="pointer-events-none overflow-hidden">
                      <Page
                        pageNumber={i + 1}
                        width={156}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </div>
                    <div className="text-center py-1 text-[10px] font-mono"
                         style={{ color: currentPage === i + 1 ? 'var(--accent)' : 'var(--ink-4)' }}>
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* ── Main viewer ────────────────────────────────────────────── */}
            <div
              ref={viewerRef}
              className="flex-1 overflow-y-auto overflow-x-auto"
              style={{ background: 'var(--surface-card)', padding: '2rem' }}
            >
              {/* Single page mode */}
              {viewMode === 'single' && (
                <div className="flex flex-col items-center min-h-full">
                  <div className="flex-1 flex items-center justify-center">
                    {numPages > 0 && renderPage(currentPage)}
                  </div>
                  {/* Prev / Next nav */}
                  <div className="flex items-center gap-3 mt-4 shrink-0">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="neo-btn neo-btn-soft h-8 px-4 text-xs disabled:opacity-30"
                    >← Prev</button>
                    <span className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>
                      {currentPage} / {numPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                      disabled={currentPage >= numPages}
                      className="neo-btn neo-btn-soft h-8 px-4 text-xs disabled:opacity-30"
                    >Next →</button>
                  </div>
                </div>
              )}

              {/* Two-up mode */}
              {viewMode === 'two-up' && (
                <div className="flex flex-col items-center gap-6">
                  {Array.from({ length: Math.ceil(numPages / 2) }, (_, pairIdx) => {
                    const p1 = pairIdx * 2 + 1;
                    const p2 = pairIdx * 2 + 2;
                    return (
                      <div key={pairIdx} className="flex gap-4 items-start">
                        {renderPage(p1)}
                        {p2 <= numPages && renderPage(p2)}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Continuous / fit-page mode */}
              {(viewMode === 'continuous' || viewMode === 'fit-page') && (
                <div className="flex flex-col items-center gap-6">
                  {Array.from({ length: numPages }, (_, i) => renderPage(i + 1))}
                </div>
              )}
            </div>
          </Document>
        )}
      </div>

      {/* ── Note editing popup ─────────────────────────────────────────────── */}
      {noteEditing && (
        <NotePopup
          clientX={noteEditing.clientX}
          clientY={noteEditing.clientY}
          initialText={noteEditing.text}
          onConfirm={confirmNote}
          onCancel={cancelNote}
        />
      )}

      {/* ── Hovered note tooltip ───────────────────────────────────────────── */}
      {hoveredNote && !noteEditing && (() => {
        const ann = annotations.find(a => a.id === hoveredNote.id);
        if (!ann?.text) return null;
        return (
          <div
            className="pointer-events-none fixed z-50 rounded-lg shadow-xl px-3 py-2 text-xs max-w-[220px] leading-relaxed"
            style={{
              left: hoveredNote.x + 16, top: hoveredNote.y - 8,
              background: 'var(--surface-dark)', color: 'var(--canvas)',
            }}
          >
            {ann.text}
          </div>
        );
      })()}
    </div>
  );
}
