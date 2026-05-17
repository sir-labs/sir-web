import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ThemeToggle } from '../components/ThemeToggle';
import { API_URL } from '../config';

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = 'cursor' | 'highlight' | 'rectangle' | 'note' | 'text';
type ViewMode = 'continuous' | 'fit-page' | 'two-up' | 'single';

interface Annotation {
  id: string;
  page: number;
  type: 'highlight' | 'rectangle' | 'note' | 'text';
  x: number;       // 0–1 fraction of page width
  y: number;       // 0–1 fraction of page height
  width: number;
  height: number;
  text?: string;
  fontSize?: number;   // fraction of page width, e.g. 0.025
  color?: string;      // CSS color
  lineHeight?: number; // line-height multiplier, e.g. 1.4
  bold?: boolean;
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
  title = 'Add note',
  onConfirm,
  onCancel,
}: {
  clientX: number;
  clientY: number;
  initialText: string;
  title?: string;
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
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>{title}</p>
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

// ── Inline text editor (rendered directly on the PDF page) ───────────────────

// Fraction ↔ pt conversion uses A4 width (595pt) as reference so the numbers
// feel familiar regardless of actual page size on screen.
const fracToPt  = (f: number) => Math.round(f * 595);
const ptToFrac  = (pt: number) => pt / 595;

function InlineTextEditor({
  ann,
  pageWidth,
  pageHeight,
  onConfirm,
  onCancel,
}: {
  ann: Annotation;
  pageWidth: number;
  pageHeight: number;
  onConfirm: (text: string, lineHeight: number, fontSize: number, bold: boolean) => void;
  onCancel: () => void;
}) {
  const [text,       setText]       = useState(ann.text ?? '');
  const [lineHeight, setLineHeight] = useState(ann.lineHeight ?? 1.4);
  const [fontSize,   setFontSize]   = useState(ann.fontSize   ?? 0.025);
  const [bold,       setBold]       = useState(ann.bold       ?? false);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stable refs — onBlur closure always reads latest values
  const stateRef = useRef({ text, lineHeight, fontSize, bold });
  stateRef.current = { text, lineHeight, fontSize, bold };

  const fs   = fontSize * pageWidth;
  const left = ann.x * pageWidth;
  const top  = ann.y * pageHeight - fs * 1.05;

  // Auto-resize textarea to content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = el.scrollHeight + 'px';
    el.style.width  = '0';
    el.style.width  = Math.max(80, el.scrollWidth + 4) + 'px';
  }, [text, lineHeight, fontSize, bold]);

  const refocus = () => requestAnimationFrame(() => textareaRef.current?.focus());

  const save = useCallback(() => {
    const s = stateRef.current;
    onConfirm(s.text, s.lineHeight, s.fontSize, s.bold);
  }, [onConfirm]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      style={{ position: 'absolute', left, top, zIndex: 20, outline: 'none' }}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) save();
      }}
    >
      {/* ── Floating toolbar ── */}
      <div style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 5,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 7, whiteSpace: 'nowrap',
        background: 'var(--neo-surface)', border: '1px solid var(--hairline)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.16)',
        fontSize: 11, color: 'var(--ink-3)',
      }}>

        {/* Font size — slider + numeric input */}
        <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>A</span>
        <input
          type="range" min={6} max={96} step={1}
          value={fracToPt(fontSize)}
          onChange={e => { setFontSize(ptToFrac(Number(e.target.value))); refocus(); }}
          style={{ width: 72, cursor: 'pointer', accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-4)' }}>A</span>
        <input
          type="number" min={6} max={96} step={1}
          value={fracToPt(fontSize)}
          onChange={e => {
            const v = Number(e.target.value);
            if (v >= 6 && v <= 96) setFontSize(ptToFrac(v));
          }}
          onBlur={refocus}
          style={{
            width: 38, textAlign: 'center', fontSize: 11,
            background: 'var(--neo-surface)', border: '1px solid var(--hairline)',
            borderRadius: 4, outline: 'none', padding: '1px 2px',
            color: 'var(--ink-2)',
          }}
        />
        <span style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: -2 }}>pt</span>

        {/* Divider */}
        <span style={{ width: 1, height: 14, background: 'var(--hairline)', margin: '0 2px', flexShrink: 0 }} />

        {/* Bold toggle */}
        <button
          onMouseDown={e => { e.preventDefault(); setBold(b => !b); refocus(); }}
          title="Bold (Ctrl+B)"
          style={{
            width: 22, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, fontFamily: 'serif',
            background: bold ? 'var(--accent)' : 'transparent',
            color:      bold ? '#fff' : 'var(--ink-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >B</button>

        {/* Divider */}
        <span style={{ width: 1, height: 14, background: 'var(--hairline)', margin: '0 2px', flexShrink: 0 }} />

        {/* Line spacing */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="15" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
        <input
          type="range" min={1} max={3} step={0.05}
          value={lineHeight}
          onChange={e => { setLineHeight(Number(e.target.value)); refocus(); }}
          style={{ width: 60, cursor: 'pointer', accentColor: 'var(--accent)' }}
        />
        <span style={{ minWidth: 26, textAlign: 'right' }}>{lineHeight.toFixed(1)}×</span>

        {/* Divider + hint */}
        <span style={{ width: 1, height: 14, background: 'var(--hairline)', margin: '0 2px', flexShrink: 0 }} />
        <span style={{ opacity: 0.38, fontSize: 10 }}>Ctrl+↵ save · Esc cancel</span>
      </div>

      {/* ── Editable textarea ── */}
      <textarea
        ref={textareaRef}
        autoFocus
        wrap="off"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={1}
        placeholder="Type here…"
        style={{
          display: 'block',
          fontSize: fs,
          fontFamily: 'Arial, sans-serif',
          fontWeight: bold ? 700 : 400,
          color: ann.color ?? '#1e1e1e',
          lineHeight,
          background: 'rgba(37,99,235,0.04)',
          border: '1.5px solid rgba(37,99,235,0.55)',
          borderRadius: 2,
          outline: 'none',
          resize: 'none',
          padding: '0 3px',
          minWidth: 80,
          overflow: 'hidden',
          whiteSpace: 'pre',
          boxSizing: 'border-box',
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
          if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setBold(b => !b); }
        }}
      />
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [noteEditing, setNoteEditing] = useState<{
    id: string; text: string; clientX: number; clientY: number;
  } | null>(null);
  const [textEditing, setTextEditing] = useState<{
    id: string; isNew: boolean;
  } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<{ id: string; x: number; y: number } | null>(null);
  const [textFontSize, setTextFontSize] = useState(0.025); // fraction of page width
  const [textColor, setTextColor] = useState('#1e1e1e');
  const [dragging, setDragging] = useState(false);
  const [marqueeDisplay, setMarqueeDisplay] = useState<{
    page: number; x: number; y: number; w: number; h: number;
  } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'pages' | 'layers'>('pages');
  const [layerDrop, setLayerDrop] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const layerDragIdRef = useRef<string | null>(null);
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
  const numPagesRef      = useRef(0);
  const activeToolRef    = useRef<Tool>('cursor');
  const drawingRef       = useRef<DrawState | null>(null);
  const annotationsRef   = useRef<Annotation[]>([]);
  const selectedIdsRef   = useRef<string[]>([]);
  const draggingRef      = useRef<{
    id: string; svgRect: DOMRect;
    initialPositions: Map<string, { x: number; y: number }>;
    startFracX: number; startFracY: number;
  } | null>(null);
  const pendingDragRef   = useRef<{
    id: string; svgRect: DOMRect;
    initialPositions: Map<string, { x: number; y: number }>;
    startFracX: number; startFracY: number;
    startClientX: number; startClientY: number;
  } | null>(null);
  type ResizeHandle = 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
  const resizingRef      = useRef<{
    id: string; handle: ResizeHandle; svgRect: DOMRect;
    origX: number; origY: number; origW: number; origH: number;
    startFracX: number; startFracY: number;
  } | null>(null);
  const textFontSizeRef  = useRef(0.025);
  const textColorRef     = useRef('#1e1e1e');
  const marqueeRef       = useRef<{
    page: number; pageRect: DOMRect;
    startX: number; startY: number;
    currentX: number; currentY: number;
    startClientX: number; startClientY: number;
  } | null>(null);
  const noteEditingRef   = useRef<typeof noteEditing>(null);
  const textEditingRef   = useRef<typeof textEditing>(null);
  const historyRef       = useRef<Annotation[][]>([]);   // undo stack (max 50)
  const clipboardRef     = useRef<Annotation[]>([]); // copy/cut buffer

  // Sync refs every render so event handlers always read current values
  numPagesRef.current     = numPages;
  textFontSizeRef.current = textFontSize;
  textColorRef.current    = textColor;
  activeToolRef.current   = activeTool;
  drawingRef.current      = drawing;
  annotationsRef.current  = annotations;
  selectedIdsRef.current  = selectedIds;
  noteEditingRef.current  = noteEditing;
  textEditingRef.current  = textEditing;

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
      setSelectedIds([]);
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
  const svgCoords = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>, el: Element) => {
    const rect = el.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const handlePointerDown = useCallback((page: number) => (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeToolRef.current === 'cursor') return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId); // ensures pointerup always fires here
    const { x, y } = svgCoords(e, e.currentTarget);
    const next = { page, startX: x, startY: y, currentX: x, currentY: y };
    drawingRef.current = next;
    setDrawing(next);
    setSelectedIds([]);
  }, []);

  const handlePointerMove = useCallback((page: number) => (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current || drawingRef.current.page !== page) return;
    const { x, y } = svgCoords(e, e.currentTarget);
    const next = { ...drawingRef.current, currentX: x, currentY: y };
    drawingRef.current = next;
    setDrawing(next);
  }, []);

  const handlePointerUp = useCallback((page: number) => (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drawingRef.current;
    if (!d || d.page !== page) return;
    const { x, y } = svgCoords(e, e.currentTarget);
    const x0 = Math.min(d.startX, x);
    const y0 = Math.min(d.startY, y);
    const w  = Math.abs(x - d.startX);
    const h  = Math.abs(y - d.startY);
    const tool   = activeToolRef.current;
    const isNote = tool === 'note';
    const isText = tool === 'text';

    if (isNote || isText || w > 0.008 || h > 0.008) {
      const id = crypto.randomUUID();
      const ann: Annotation = {
        id, page,
        type: tool as 'highlight' | 'rectangle' | 'note' | 'text',
        x: (isNote || isText) ? x : x0,
        y: (isNote || isText) ? y : y0,
        width:  (isNote || isText) ? 0 : w,
        height: (isNote || isText) ? 0 : h,
        text: (isNote || isText) ? '' : undefined,
        ...(isText ? { fontSize: textFontSizeRef.current, color: textColorRef.current } : {}),
      };
      const next = [...annotationsRef.current, ann];
      annotationsRef.current = next;
      setAnnotations(next);
      persist(next);
      if (isNote) setNoteEditing({ id, text: '', clientX: e.clientX, clientY: e.clientY });
      if (isText) setTextEditing({ id, isNew: true });
    }
    drawingRef.current = null;
    setDrawing(null);
  }, [persist]);

  const handleAnnClick = useCallback((id: string, e: React.MouseEvent) => {
    if (activeToolRef.current !== 'cursor') return;
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Toggle this annotation in the selection
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id],
      );
    } else {
      // Plain click → select only this one, or deselect if already sole selection
      setSelectedIds(prev => (prev.length === 1 && prev[0] === id ? [] : [id]));
    }
  }, []);

  // ── Annotation drag ─────────────────────────────────────────────────────────
  // Pending-drag pattern: only activate drag after moving > threshold to avoid
  // intercepting clicks (e.g. clicking Save in note/text popup).
  const handleAnnPointerDown = useCallback((annId: string) => (e: React.PointerEvent) => {
    const isCursor = activeToolRef.current === 'cursor';
    const isCtrl   = e.ctrlKey || e.metaKey;
    if (!isCursor && !isCtrl) return;
    e.stopPropagation();
    e.preventDefault();

    const currentSelected = selectedIdsRef.current;
    const isDraggingSelected = currentSelected.includes(annId);

    // Which annotations will move: all currently selected if dragging a selected item,
    // otherwise just this one
    const idsToMove = isDraggingSelected && currentSelected.length > 1
      ? currentSelected
      : [annId];

    const initialPositions = new Map<string, { x: number; y: number }>();
    for (const id of idsToMove) {
      const ann = annotationsRef.current.find(a => a.id === id);
      if (ann) initialPositions.set(id, { x: ann.x, y: ann.y });
    }

    const svgEl   = (e.currentTarget as SVGElement).ownerSVGElement!;
    const svgRect = svgEl.getBoundingClientRect();

    // Stage in pending; global onMove will promote to active drag after threshold
    pendingDragRef.current = {
      id: annId, svgRect, initialPositions,
      startFracX: (e.clientX - svgRect.left) / svgRect.width,
      startFracY: (e.clientY - svgRect.top)  / svgRect.height,
      startClientX: e.clientX, startClientY: e.clientY,
    };
  }, []);

  const handleResizePointerDown = useCallback((annId: string, handle: ResizeHandle) =>
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const ann = annotationsRef.current.find(a => a.id === annId);
      if (!ann) return;
      const svgEl   = (e.currentTarget as SVGElement).ownerSVGElement!;
      const svgRect = svgEl.getBoundingClientRect();
      resizingRef.current = {
        id: annId, handle,
        svgRect,
        origX: ann.x, origY: ann.y, origW: ann.width, origH: ann.height,
        startFracX: (e.clientX - svgRect.left) / svgRect.width,
        startFracY: (e.clientY - svgRect.top)  / svgRect.height,
      };
      setDragging(true); // reuse dragging state to show grabbing cursor
    }, []);

  useEffect(() => {
    const DRAG_THRESHOLD_PX = 5;
    const MIN_SIZE = 0.01;
    const onMove = (e: PointerEvent) => {
      // Resize takes priority
      const r = resizingRef.current;
      if (r) {
        const curFracX = (e.clientX - r.svgRect.left) / r.svgRect.width;
        const curFracY = (e.clientY - r.svgRect.top)  / r.svgRect.height;
        const dx = curFracX - r.startFracX;
        const dy = curFracY - r.startFracY;
        let x = r.origX, y = r.origY, w = r.origW, hh = r.origH;
        const handle = r.handle;
        if (handle === 'nw' || handle === 'w' || handle === 'sw') { x = r.origX + dx; w = r.origW - dx; }
        if (handle === 'ne' || handle === 'e' || handle === 'se') { w = r.origW + dx; }
        if (handle === 'nw' || handle === 'n' || handle === 'ne') { y = r.origY + dy; hh = r.origH - dy; }
        if (handle === 'sw' || handle === 's' || handle === 'se') { hh = r.origH + dy; }
        // Enforce minimum size
        if (w < MIN_SIZE) { if (handle === 'nw' || handle === 'w' || handle === 'sw') x = r.origX + r.origW - MIN_SIZE; w = MIN_SIZE; }
        if (hh < MIN_SIZE) { if (handle === 'nw' || handle === 'n' || handle === 'ne') y = r.origY + r.origH - MIN_SIZE; hh = MIN_SIZE; }
        const next = annotationsRef.current.map(a => a.id === r.id ? { ...a, x, y, width: w, height: hh } : a);
        annotationsRef.current = next;
        setAnnotations(next);
        return;
      }

      const p = pendingDragRef.current;
      if (p && !draggingRef.current) {
        const dx = e.clientX - p.startClientX;
        const dy = e.clientY - p.startClientY;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
          // Promote pending → active drag
          draggingRef.current = {
            id: p.id, svgRect: p.svgRect,
            initialPositions: p.initialPositions,
            startFracX: p.startFracX, startFracY: p.startFracY,
          };
          pendingDragRef.current = null;
          setDragging(true);
          setSelectedIds(prev => prev.includes(p.id) ? prev : [p.id]);
        }
      }
      const d = draggingRef.current;
      if (!d) return;
      const ddx = (e.clientX - d.svgRect.left) / d.svgRect.width  - d.startFracX;
      const ddy = (e.clientY - d.svgRect.top)  / d.svgRect.height - d.startFracY;
      const next = annotationsRef.current.map(a => {
        const init = d.initialPositions.get(a.id);
        if (!init) return a;
        return { ...a, x: Math.max(0.01, Math.min(0.98, init.x + ddx)), y: Math.max(0.01, Math.min(0.98, init.y + ddy)) };
      });
      annotationsRef.current = next;
      setAnnotations(next);
    };
    const onUp = () => {
      pendingDragRef.current = null;
      if (resizingRef.current) {
        pushHistory();
        persist(annotationsRef.current);
        resizingRef.current = null;
        setDragging(false);
        return;
      }
      if (draggingRef.current) {
        pushHistory();
        persist(annotationsRef.current);
        draggingRef.current = null;
        setDragging(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]); // pushHistory is stable (ref-only) — safe to omit from deps

  // ── Annotation mutation ─────────────────────────────────────────────────────

  const pushHistory = useCallback(() => {
    const stack = historyRef.current;
    // Keep at most 50 snapshots
    if (stack.length >= 50) stack.shift();
    stack.push([...annotationsRef.current]);
  }, []);

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (!ids.length) return;
    pushHistory();
    const next = annotationsRef.current.filter(a => !ids.includes(a.id));
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
    setSelectedIds([]);
  }, [persist, pushHistory]);

  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (!ids.length) return;
    pushHistory();
    const newAnns: Annotation[] = [];
    const newIds: string[] = [];
    for (const id of ids) {
      const ann = annotationsRef.current.find(a => a.id === id);
      if (!ann) continue;
      const newAnn: Annotation = {
        ...ann,
        id: crypto.randomUUID(),
        x: Math.min(0.9, ann.x + 0.02),
        y: Math.min(0.9, ann.y + 0.02),
      };
      newAnns.push(newAnn);
      newIds.push(newAnn.id);
    }
    const next = [...annotationsRef.current, ...newAnns];
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
    setSelectedIds(newIds);
  }, [persist, pushHistory]);

  const copySelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    clipboardRef.current = annotationsRef.current.filter(a => ids.includes(a.id));
  }, []);

  const cutSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (!ids.length) return;
    clipboardRef.current = annotationsRef.current.filter(a => ids.includes(a.id));
    pushHistory();
    const next = annotationsRef.current.filter(a => !ids.includes(a.id));
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
    setSelectedIds([]);
  }, [persist, pushHistory]);

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current.length) return;
    pushHistory();
    const newAnns = clipboardRef.current.map(src => ({
      ...src,
      id: crypto.randomUUID(),
      x: Math.min(0.9, src.x + 0.02),
      y: Math.min(0.9, src.y + 0.02),
    }));
    // Update clipboard so repeated pastes stack
    clipboardRef.current = newAnns;
    const next = [...annotationsRef.current, ...newAnns];
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
    setSelectedIds(newAnns.map(a => a.id));
  }, [persist, pushHistory]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    annotationsRef.current = prev;
    setAnnotations(prev);
    persist(prev);
    setSelectedIds([]);
  }, [persist]);

  const moveLayerForward = useCallback(() => {
    const id = selectedIdsRef.current[0];
    if (!id) return;
    const anns = annotationsRef.current;
    const idx  = anns.findIndex(a => a.id === id);
    if (idx >= anns.length - 1) return;
    pushHistory();
    const next = [...anns];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
  }, [persist, pushHistory]);

  const moveLayerBackward = useCallback(() => {
    const id = selectedIdsRef.current[0];
    if (!id) return;
    const anns = annotationsRef.current;
    const idx  = anns.findIndex(a => a.id === id);
    if (idx <= 0) return;
    pushHistory();
    const next = [...anns];
    [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
  }, [persist, pushHistory]);

  const reorderLayers = useCallback((draggedId: string, targetId: string, pos: 'before' | 'after') => {
    if (draggedId === targetId) return;
    // UI shows reversed order; work in that space then flip back
    const rev = [...annotationsRef.current].reverse();
    const fromIdx = rev.findIndex(a => a.id === draggedId);
    const item    = rev[fromIdx];
    rev.splice(fromIdx, 1);
    const toIdx   = rev.findIndex(a => a.id === targetId);
    rev.splice(pos === 'before' ? toIdx : toIdx + 1, 0, item);
    const next = rev.reverse();
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
  }, [persist]);

  const confirmNote = useCallback((text: string) => {
    const ne = noteEditingRef.current;
    if (!ne) return;
    const next = annotationsRef.current.map(a => a.id === ne.id ? { ...a, text } : a);
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
    setNoteEditing(null);
  }, [persist]);

  const cancelNote = useCallback(() => {
    const ne = noteEditingRef.current;
    if (!ne) return;
    const next = annotationsRef.current.filter(a => a.id !== ne.id);
    annotationsRef.current = next;
    setAnnotations(next);
    persist(next);
    setNoteEditing(null);
  }, [persist]);

  const confirmTextEdit = useCallback((text: string, lineHeight: number, fontSize: number, bold: boolean) => {
    const te = textEditingRef.current;
    if (!te) return;
    if (!text.trim() && te.isNew) {
      const next = annotationsRef.current.filter(a => a.id !== te.id);
      annotationsRef.current = next;
      setAnnotations(next);
      persist(next);
    } else {
      const next = annotationsRef.current.map(a =>
        a.id === te.id ? { ...a, text, lineHeight, fontSize, bold } : a,
      );
      annotationsRef.current = next;
      setAnnotations(next);
      persist(next);
    }
    setTextEditing(null);
  }, [persist]);

  const cancelTextEdit = useCallback(() => {
    const te = textEditingRef.current;
    if (!te) return;
    if (te.isNew) {
      const next = annotationsRef.current.filter(a => a.id !== te.id);
      annotationsRef.current = next;
      setAnnotations(next);
      persist(next);
    }
    setTextEditing(null);
  }, [persist]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Always block if an inline text editor is open
      if (noteEditingRef.current) return;
      if (textEditingRef.current) return;

      const tag  = (e.target as HTMLElement).tagName;
      const ctrl = e.ctrlKey || e.metaKey;

      // Allow shortcuts in inputs only when ctrl is held
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && !ctrl) return;

      // ── Ctrl combos ──────────────────────────────────────────────────────
      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case 'z': e.preventDefault(); undo(); return;
          case 'd': e.preventDefault(); duplicateSelected(); return;
          case 'c': e.preventDefault(); copySelected(); return;
          case 'x': e.preventDefault(); cutSelected(); return;
          case 'v': e.preventDefault(); pasteClipboard(); return;
          case ']': e.preventDefault(); moveLayerForward(); return;
          case '[': e.preventDefault(); moveLayerBackward(); return;
          case 'a': e.preventDefault(); setSelectedIds(annotationsRef.current.map(a => a.id)); return;
        }
      }

      // ── Plain keys (no ctrl) ─────────────────────────────────────────────
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      if (e.key === 'Escape') { setSelectedIds([]); setActiveTool('cursor'); }
      if (e.key === 'h') setActiveTool('highlight');
      if (e.key === 'r') setActiveTool('rectangle');
      if (e.key === 'n') setActiveTool('note');
      if (e.key === 't') setActiveTool('text');
      if (e.key === 'v' && !ctrl) setActiveTool('cursor');
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')
        setCurrentPage(p => Math.max(1, p - 1));
      if (e.key === 'ArrowRight' || e.key === 'PageDown')
        setCurrentPage(p => Math.min(numPagesRef.current, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, duplicateSelected, copySelected, cutSelected, pasteClipboard, undo, moveLayerForward, moveLayerBackward]);

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

  // ── Save (embed annotations into PDF via pdf-lib) ───────────────────────────
  const [saving, setSaving] = useState(false);

  const download = useCallback(async () => {
    if (!pdfData) return;
    setSaving(true);
    try {
      const pdfDoc  = await PDFDocument.load(pdfData);
      const pages   = pdfDoc.getPages();
      const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Helper: parse CSS hex color → rgb()
      const hexToRgb = (hex: string) => {
        const h = hex.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16) / 255;
        const g = parseInt(h.slice(2, 4), 16) / 255;
        const b = parseInt(h.slice(4, 6), 16) / 255;
        return rgb(r, g, b);
      };

      for (const ann of annotationsRef.current) {
        const page = pages[ann.page - 1];
        if (!page) continue;

        // Use MediaBox so origin (ox, oy) is accounted for (most PDFs have ox=oy=0)
        const mb = page.getMediaBox();   // { x, y, width, height }
        const pw = mb.width;
        const ph = mb.height;
        const ox = mb.x;   // MediaBox lower-left x (usually 0)
        const oy = mb.y;   // MediaBox lower-left y (usually 0)

        // Convert our 0-1 fractions (origin = page top-left, y↓) →
        // PDF user-space (origin = MediaBox lower-left, y↑)
        const pdfX  = (frac: number) => ox + frac * pw;
        const pdfY  = (frac: number) => oy + (1 - frac) * ph;        // top → bottom in PDF
        const pdfYr = (frac: number, h: number) => oy + (1 - frac - h) * ph; // rect bottom-left

        if (ann.type === 'highlight') {
          page.drawRectangle({
            x: pdfX(ann.x),
            y: pdfYr(ann.y, ann.height),
            width:  ann.width  * pw,
            height: ann.height * ph,
            color: rgb(0.996, 0.941, 0.541),
            opacity: 0.45,
          });
        }

        if (ann.type === 'rectangle') {
          page.drawRectangle({
            x: pdfX(ann.x),
            y: pdfYr(ann.y, ann.height),
            width:  ann.width  * pw,
            height: ann.height * ph,
            borderColor: rgb(0.8, 0.47, 0.36),
            borderWidth: 1.5,
            color: rgb(0.8, 0.47, 0.36),
            opacity: 0.12,
          });
        }

        if (ann.type === 'text' && ann.text?.trim()) {
          const fs      = (ann.fontSize ?? 0.025) * pw;
          const color   = hexToRgb(ann.color ?? '#1e1e1e');
          const usedFont = ann.bold ? fontBold : font;
          const lines   = ann.text.split('\n');
          const lineH   = fs * (ann.lineHeight ?? 1.4);
          lines.forEach((line, i) => {
            if (!line) return;
            page.drawText(line, {
              x:    pdfX(ann.x),
              y:    pdfY(ann.y) - i * lineH,
              size: fs,
              font: usedFont,
              color,
            });
          });
        }

        if (ann.type === 'note' && ann.text?.trim()) {
          const cx = pdfX(ann.x);
          const cy = pdfY(ann.y);
          page.drawCircle({ x: cx, y: cy, size: 7, color: rgb(0.23, 0.51, 0.96), opacity: 0.85 });
          page.drawText('N', { x: cx - 3, y: cy - 3.5, size: 7, font, color: rgb(1, 1, 1) });
        }
      }

      const bytes = await pdfDoc.save();
      const url   = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
      Object.assign(document.createElement('a'), { href: url, download: fileName || 'document.pdf' }).click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('pdf-lib save error', err);
      // Fallback: download original
      const url = URL.createObjectURL(new Blob([pdfData.buffer as ArrayBuffer], { type: 'application/pdf' }));
      Object.assign(document.createElement('a'), { href: url, download: fileName || 'document.pdf' }).click();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
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

  // ── Marquee (drag-to-select) ────────────────────────────────────────────────
  const rectsIntersect = useCallback((ann: Annotation, rx: number, ry: number, rw: number, rh: number) => {
    if (ann.type === 'note' || ann.type === 'text') {
      return ann.x >= rx && ann.x <= rx + rw && ann.y >= ry && ann.y <= ry + rh;
    }
    return ann.x < rx + rw && ann.x + ann.width > rx && ann.y < ry + rh && ann.y + ann.height > ry;
  }, []);

  const handleMarqueePointerDown = useCallback((pageNumber: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    marqueeRef.current = {
      page: pageNumber, pageRect: rect,
      startX:   (e.clientX - rect.left) / rect.width,
      startY:   (e.clientY - rect.top)  / rect.height,
      currentX: (e.clientX - rect.left) / rect.width,
      currentY: (e.clientY - rect.top)  / rect.height,
      startClientX: e.clientX, startClientY: e.clientY,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const handleMarqueePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const m = marqueeRef.current;
    if (!m) return;
    m.currentX = (e.clientX - m.pageRect.left) / m.pageRect.width;
    m.currentY = (e.clientY - m.pageRect.top)  / m.pageRect.height;
    const dx = e.clientX - m.startClientX, dy = e.clientY - m.startClientY;
    if (Math.sqrt(dx * dx + dy * dy) > 4) {
      setMarqueeDisplay({
        page: m.page,
        x: Math.min(m.startX, m.currentX),
        y: Math.min(m.startY, m.currentY),
        w: Math.abs(m.currentX - m.startX),
        h: Math.abs(m.currentY - m.startY),
      });
    }
  }, []);

  const handleMarqueePointerUp = useCallback((pageNumber: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    const m = marqueeRef.current;
    if (!m) return;
    const dx = e.clientX - m.startClientX, dy = e.clientY - m.startClientY;
    if (Math.sqrt(dx * dx + dy * dy) > 4) {
      const rx = Math.min(m.startX, m.currentX);
      const ry = Math.min(m.startY, m.currentY);
      const rw = Math.abs(m.currentX - m.startX);
      const rh = Math.abs(m.currentY - m.startY);
      const hitIds = annotationsRef.current
        .filter(a => a.page === pageNumber && rectsIntersect(a, rx, ry, rw, rh))
        .map(a => a.id);
      if (e.shiftKey) {
        setSelectedIds(prev => [...new Set([...prev, ...hitIds])]);
      } else {
        setSelectedIds(hitIds);
      }
    } else {
      // Plain click on empty space → deselect all
      setSelectedIds([]);
    }
    marqueeRef.current = null;
    setMarqueeDisplay(null);
  }, [rectsIntersect]);

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
        style={{
          width: pageWidth,
          cursor: activeTool === 'cursor'
            ? (marqueeDisplay ? 'crosshair' : 'default')
            : undefined,
        }}
        onPointerDown={activeTool === 'cursor' ? handleMarqueePointerDown(pageNumber) : undefined}
        onPointerMove={activeTool === 'cursor' ? handleMarqueePointerMove : undefined}
        onPointerUp={activeTool === 'cursor' ? handleMarqueePointerUp(pageNumber) : undefined}
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
            zIndex: 10,
            pointerEvents: svgPointer,
            cursor: svgCursor,
          }}
          onPointerDown={activeTool !== 'cursor' ? handlePointerDown(pageNumber) : undefined}
          onPointerMove={activeTool !== 'cursor' ? handlePointerMove(pageNumber) : undefined}
          onPointerUp={activeTool !== 'cursor'   ? handlePointerUp(pageNumber)   : undefined}
        >
          {pageAnns.map(ann => {
            const sel       = selectedIds.includes(ann.id);
            const moveCursor = activeTool === 'cursor' ? (sel && dragging ? 'grabbing' : sel ? 'grab' : 'default') : 'crosshair';

            if (ann.type === 'note') {
              return (
                <g key={ann.id}
                   style={{ pointerEvents: 'all', cursor: moveCursor }}
                   onPointerDown={handleAnnPointerDown(ann.id)}
                   onClick={e => { if (!draggingRef.current) handleAnnClick(ann.id, e as unknown as React.MouseEvent); }}
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
            if (ann.type === 'text') {
              const isEditing = textEditing?.id === ann.id;
              // While inline-editing, suppress the SVG text (InlineTextEditor renders over it)
              if (isEditing) return null;
              const fs = (ann.fontSize ?? 0.025) * pageWidth;
              const color = ann.color ?? '#1e1e1e';
              const lines = (ann.text ?? '').split('\n');
              const lineHeight = fs * (ann.lineHeight ?? 1.4);
              return (
                <g key={ann.id}
                   style={{ pointerEvents: 'all', cursor: moveCursor }}
                   onPointerDown={handleAnnPointerDown(ann.id)}
                   onClick={e => { if (!draggingRef.current) handleAnnClick(ann.id, e as unknown as React.MouseEvent); }}
                   onDoubleClick={e => {
                     e.stopPropagation();
                     setTextEditing({ id: ann.id, isNew: false });
                   }}
                >
                  <rect
                    x={`${(ann.x - 0.005) * 100}%`}
                    y={`${(ann.y - fs / pageWidth * 0.9) * 100}%`}
                    width={`${Math.max(0.05, lines.reduce((m, l) => Math.max(m, l.length), 0) * fs * 0.6 / pageWidth) * 100}%`}
                    height={`${(lines.length * lineHeight / pageWidth) * 100}%`}
                    fill="transparent"
                    stroke={sel ? 'rgba(37,99,235,0.7)' : 'none'}
                    strokeWidth="1.5" strokeDasharray="5 3" rx="3"
                    style={{ pointerEvents: 'all' }}
                  />
                  <text
                    x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                    fontSize={fs} fill={sel ? 'rgba(37,99,235,0.9)' : color}
                    fontFamily="Arial, sans-serif"
                    fontWeight={ann.bold ? 700 : 400}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={`${ann.x * 100}%`} dy={i === 0 ? 0 : lineHeight}>{line || ' '}</tspan>
                    ))}
                  </text>
                  {sel && (
                    <circle cx={`${ann.x * 100}%`} cy={`${ann.y * 100}%`} r="4"
                      fill="rgba(37,99,235,0.8)" style={{ pointerEvents: 'none' }} />
                  )}
                </g>
              );
            }
            // highlight / rectangle
            const c = annColor(ann.type, sel);
            const showHandles = sel && selectedIds.length === 1 && activeTool === 'cursor';
            // Resize handle positions (fraction of SVG)
            const rx = ann.x, ry = ann.y, rw = ann.width, rh = ann.height;
            const hx = rx + rw / 2, hy = ry + rh / 2; // midpoints
            const resizeHandles: { id: ResizeHandle; fx: number; fy: number; cursor: string }[] = [
              { id: 'nw', fx: rx,      fy: ry,      cursor: 'nwse-resize' },
              { id: 'n',  fx: hx,      fy: ry,      cursor: 'ns-resize'   },
              { id: 'ne', fx: rx + rw, fy: ry,      cursor: 'nesw-resize' },
              { id: 'e',  fx: rx + rw, fy: hy,      cursor: 'ew-resize'   },
              { id: 'se', fx: rx + rw, fy: ry + rh, cursor: 'nwse-resize' },
              { id: 's',  fx: hx,      fy: ry + rh, cursor: 'ns-resize'   },
              { id: 'sw', fx: rx,      fy: ry + rh, cursor: 'nesw-resize' },
              { id: 'w',  fx: rx,      fy: hy,      cursor: 'ew-resize'   },
            ];
            return (
              <g key={ann.id}
                 style={{ pointerEvents: 'all', cursor: moveCursor }}
                 onPointerDown={handleAnnPointerDown(ann.id)}
                 onClick={e => { if (!draggingRef.current) handleAnnClick(ann.id, e as unknown as React.MouseEvent); }}
              >
                <rect
                  x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                  width={`${ann.width * 100}%`} height={`${ann.height * 100}%`}
                  fill={c.fill} stroke={c.stroke} strokeWidth={c.strokeWidth}
                />
                {showHandles && resizeHandles.map(h => (
                  <circle
                    key={h.id}
                    cx={`${h.fx * 100}%`} cy={`${h.fy * 100}%`} r="5"
                    fill="white" stroke="rgba(37,99,235,0.9)" strokeWidth="1.5"
                    style={{ cursor: h.cursor, pointerEvents: 'all' }}
                    onPointerDown={handleResizePointerDown(ann.id, h.id)}
                  />
                ))}
              </g>
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
          {marqueeDisplay?.page === pageNumber && (
            <rect
              x={`${marqueeDisplay.x * 100}%`}
              y={`${marqueeDisplay.y * 100}%`}
              width={`${marqueeDisplay.w * 100}%`}
              height={`${marqueeDisplay.h * 100}%`}
              fill="rgba(37,99,235,0.07)"
              stroke="rgba(37,99,235,0.65)"
              strokeWidth="1"
              strokeDasharray="5 3"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* Inline text editor — rendered on top of the page at the annotation position */}
        {(() => {
          if (!textEditing) return null;
          const ann = annotations.find(a => a.id === textEditing.id && a.page === pageNumber);
          if (!ann) return null;
          const pageHeight = pageWidth * pageAspectRatio;
          return (
            <InlineTextEditor
              key={ann.id}
              ann={ann}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              onConfirm={confirmTextEdit}
              onCancel={cancelTextEdit}
            />
          );
        })()}
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
                { tool: 'text' as Tool,      title: 'Text (T)',      icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7V4h16v3M9 20h6M12 4v16" /></> },
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

            {/* Text tool options */}
            {activeTool === 'text' && (
              <>
                <select
                  value={textFontSize}
                  onChange={e => setTextFontSize(Number(e.target.value))}
                  title="Font size"
                  className="h-7 rounded-lg px-1 text-xs outline-none"
                  style={{ background: 'var(--neo-surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
                >
                  <option value={0.015}>S</option>
                  <option value={0.025}>M</option>
                  <option value={0.04}>L</option>
                  <option value={0.06}>XL</option>
                </select>
                <div className="flex items-center gap-1">
                  {['#1e1e1e','#dc2626','#2563eb','#16a34a','#9333ea','#ea580c'].map(c => (
                    <button
                      key={c}
                      onClick={() => setTextColor(c)}
                      title={c}
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        background: c,
                        outline: textColor === c ? '2px solid var(--accent)' : '2px solid transparent',
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </div>
                <div className="w-px h-5 mx-0.5 shrink-0" style={{ background: 'var(--hairline)' }} />
              </>
            )}

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
            {selectedIds.length > 0 && (
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

            {annotations.length > 0 && (
              <span className="text-[10px] shrink-0 flex items-center gap-1" style={{ color: 'var(--ink-4)' }}>
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Auto-saved
              </span>
            )}

            <div className="w-px h-5 mx-1 shrink-0" style={{ background: 'var(--hairline)' }} />

            {/* Save / Download with annotations embedded */}
            <button onClick={download} disabled={saving}
                    className="neo-btn neo-btn-primary h-8 px-2.5 text-xs flex items-center gap-1.5 disabled:opacity-60">
              {saving
                ? <span className="loading loading-spinner loading-xs" />
                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
              }
              {saving ? 'Saving…' : 'Save PDF'}
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
            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <aside className="glass-panel w-[11.5rem] shrink-0 flex flex-col border-r rounded-none"
                   style={{ borderColor: 'var(--hairline)' }}>

              {/* Tab header */}
              <div className="shrink-0 flex border-b" style={{ borderColor: 'var(--hairline)' }}>
                {(['pages', 'layers'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    className="flex-1 py-2 text-[11px] font-semibold transition-colors"
                    style={{
                      color: sidebarTab === tab ? 'var(--accent)' : 'var(--ink-4)',
                      borderBottom: sidebarTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                  >
                    {tab === 'pages' ? `Pages${numPages > 0 ? ` (${numPages})` : ''}` : `Layers${annotations.length > 0 ? ` (${annotations.length})` : ''}`}
                  </button>
                ))}
              </div>

              {/* Pages tab */}
              {sidebarTab === 'pages' && (
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
              )}

              {/* Layers tab */}
              {sidebarTab === 'layers' && (
                <div className="flex-1 overflow-y-auto py-1.5">
                  {annotations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center">
                      <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>No objects yet</p>
                    </div>
                  ) : (
                    // Newest on top (reversed)
                    [...annotations].reverse().map(ann => {
                      const sel = selectedIds.includes(ann.id);
                      const isCurrentPage = ann.page === currentPage;
                      const label =
                        ann.type === 'text'      ? (ann.text?.trim() || 'Text')
                      : ann.type === 'note'      ? (ann.text?.trim() || 'Note')
                      : ann.type === 'highlight' ? 'Highlight'
                      :                            'Rectangle';
                      const icon =
                        ann.type === 'highlight' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        ) : ann.type === 'rectangle' ? (
                          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
                        ) : ann.type === 'note' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        ) : (
                          <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7V4h16v3M9 20h6M12 4v16" /></>
                        );

                      const isDragTarget = layerDrop?.id === ann.id;
                      return (
                        <div
                          key={ann.id}
                          draggable
                          onDragStart={e => {
                            layerDragIdRef.current = ann.id;
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            layerDragIdRef.current = null;
                            setLayerDrop(null);
                          }}
                          onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
                            setLayerDrop({ id: ann.id, pos });
                          }}
                          onDragLeave={() => setLayerDrop(null)}
                          onDrop={e => {
                            e.preventDefault();
                            const draggedId = layerDragIdRef.current;
                            if (draggedId && layerDrop) reorderLayers(draggedId, layerDrop.id, layerDrop.pos);
                            layerDragIdRef.current = null;
                            setLayerDrop(null);
                          }}
                          onClick={() => {
                            setSelectedIds([ann.id]);
                            scrollToPage(ann.page);
                          }}
                          className="group flex items-center gap-1.5 mx-1.5 px-2 py-1.5 rounded-lg transition-all"
                          style={{
                            cursor: 'grab',
                            background: sel ? 'var(--accent)' : 'transparent',
                            opacity: isCurrentPage ? 1 : 0.5,
                            borderTop:    isDragTarget && layerDrop?.pos === 'before' ? '2px solid var(--accent)' : '2px solid transparent',
                            borderBottom: isDragTarget && layerDrop?.pos === 'after'  ? '2px solid var(--accent)' : '2px solid transparent',
                          }}
                        >
                          {/* Drag handle */}
                          <svg className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                               style={{ color: sel ? '#fff' : 'var(--ink-3)' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                          </svg>

                          {/* Type icon */}
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                               style={{ color: sel ? '#fff' : 'var(--ink-3)' }}>
                            {icon}
                          </svg>

                          {/* Label */}
                          <span className="flex-1 text-[11px] truncate"
                                style={{ color: sel ? '#fff' : 'var(--ink-2)' }}>
                            {label}
                          </span>

                          {/* Page badge */}
                          <span className="text-[9px] font-mono shrink-0 rounded px-1"
                                style={{
                                  background: sel ? 'rgba(255,255,255,0.2)' : 'var(--neo-surface)',
                                  color: sel ? '#fff' : 'var(--ink-4)',
                                }}>
                            p{ann.page}
                          </span>

                          {/* Delete button */}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const next = annotationsRef.current.filter(a => a.id !== ann.id);
                              annotationsRef.current = next;
                              setAnnotations(next);
                              persist(next);
                              if (selectedIds.includes(ann.id)) setSelectedIds(prev => prev.filter(id => id !== ann.id));
                            }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                            style={{ color: sel ? '#fff' : 'var(--accent)' }}
                            title="Delete"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
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
