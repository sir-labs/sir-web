import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLocalStorage } from "usehooks-ts";
import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";
import { pdfjs } from "react-pdf";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PdfViewer } from "../components/PdfViewer";
import { latexExtensions } from "../lib/latexLang";

import { API_URL } from '../config';

const DEFAULT_LATEX = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{graphicx}
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

type CompileStatus = "idle" | "stale" | "compiling" | "done" | "error";
type ViewMode = "split" | "editor" | "preview";
type Engine = "lualatex" | "pdflatex" | "xelatex";
type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UserAsset {
  id: string;
  name: string;
  thumbnail_r2_key?: string;
  mime_type: string;
  size: number;
  created_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAsset(asset: UserAsset): boolean {
  const ext = asset.name.split(".").pop()?.toLowerCase() ?? "";
  return asset.mime_type.startsWith("image/") || ["jpg", "jpeg", "png", "pdf", "eps", "svg"].includes(ext);
}

function getAssetReference(asset: UserAsset): string {
  return isImageAsset(asset)
    ? `\\includegraphics[width=\\linewidth]{${asset.name}}`
    : asset.name;
}

async function createImageThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("thumbnail image load failed"));
    });
    image.src = sourceUrl;
    await loaded;

    const maxSize = 220;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.72);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function ensureGraphicxPackage(source: string): { source: string; insertedLength: number } {
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bgraphicx\b[^}]*\}/.test(source)) {
    return { source, insertedLength: 0 };
  }

  const packageLine = "\\usepackage{graphicx}\n";
  const usePackageMatches = [...source.matchAll(/^\\usepackage(?:\[[^\]]*\])?\{[^}]+\}\s*$/gm)];
  const lastUsePackage = usePackageMatches.at(-1);

  if (lastUsePackage?.index !== undefined) {
    const insertAt = lastUsePackage.index + lastUsePackage[0].length;
    const prefix = source[insertAt - 1] === "\n" ? "" : "\n";
    const insertion = `${prefix}${packageLine}`;
    return {
      source: source.slice(0, insertAt) + insertion + source.slice(insertAt),
      insertedLength: insertion.length,
    };
  }

  const documentClass = source.match(/^\\documentclass(?:\[[^\]]*\])?\{[^}]+\}\s*$/m);
  if (documentClass?.index !== undefined) {
    const insertAt = documentClass.index + documentClass[0].length;
    const prefix = source[insertAt - 1] === "\n" ? "" : "\n";
    const insertion = `${prefix}${packageLine}`;
    return {
      source: source.slice(0, insertAt) + insertion + source.slice(insertAt),
      insertedLength: insertion.length,
    };
  }

  return { source: packageLine + source, insertedLength: packageLine.length };
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
  const [assetPreviewUrls, setAssetPreviewUrls] = useState<Record<string, string>>({});
  const [hoveredAsset, setHoveredAsset] = useState<UserAsset | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState({ x: 0, y: 0 });
  const [selectedAsset, setSelectedAsset] = useState<UserAsset | null>(null);
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);
  const [selectedAssetLoading, setSelectedAssetLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
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
    return () => {
      Object.values(assetPreviewUrls).forEach(URL.revokeObjectURL);
      if (selectedAssetUrl) URL.revokeObjectURL(selectedAssetUrl);
    };
  }, [assetPreviewUrls, selectedAssetUrl]);

  useEffect(() => {
    if (!accessToken) navigate("/", { replace: true });
  }, [accessToken, navigate]);

  const loadFile = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      setEditorLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/latex-files/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setFileName(data.name);
        setEngine(data.engine as Engine);
        setPdfBytes(null);
        setLatexCode(data.content);
        setStatus("stale");
        setCacheStatus(null);
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
      const res = await fetch(`${API_URL}/api/assets`, {
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

  useEffect(() => {
    if (!accessToken || assets.length === 0) {
      setAssetPreviewUrls(prev => {
        Object.values(prev).forEach(URL.revokeObjectURL);
        return {};
      });
      return;
    }

    let cancelled = false;
    const urls: Record<string, string> = {};
    const previewAssets = assets.filter(asset => isImageAsset(asset) && asset.thumbnail_r2_key);

    Promise.all(previewAssets.map(async (asset) => {
      try {
        const res = await fetch(`${API_URL}/api/assets/${asset.id}/preview`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        urls[asset.id] = URL.createObjectURL(await res.blob());
      } catch {
        /* ignore preview load failures */
      }
    })).then(() => {
      if (cancelled) {
        Object.values(urls).forEach(URL.revokeObjectURL);
        return;
      }
      setAssetPreviewUrls(prev => {
        Object.values(prev).forEach(URL.revokeObjectURL);
        return urls;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, assets]);

  useEffect(() => {
    if (!selectedAsset || !accessToken) {
      setSelectedAssetUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    setSelectedAssetLoading(true);
    fetch(`${API_URL}/api/assets/${selectedAsset.id}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("asset load failed");
        const url = URL.createObjectURL(await res.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setSelectedAssetUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => {
        if (!cancelled) setSelectedAssetUrl(null);
      })
      .finally(() => {
        if (!cancelled) setSelectedAssetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAsset, accessToken]);

  const handleAssetUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !accessToken) return;
    e.target.value = "";
    setUploadingAsset(true);
    try {
      const uploadedAssets: UserAsset[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const thumbnail = await createImageThumbnail(file);
        if (thumbnail) {
          form.append("thumbnail", thumbnail, `${file.name}.preview.webp`);
        }
        const res = await fetch(`${API_URL}/api/assets`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        if (!res.ok) continue;
        uploadedAssets.push(await res.json());
      }
      if (uploadedAssets.length > 0) {
        setAssets(prev => [...uploadedAssets, ...prev]);
      }
    } catch { /* ignore */ }
    finally { setUploadingAsset(false); }
  }, [accessToken]);

  const handleAssetDelete = useCallback(async (asset: UserAsset) => {
    if (!accessToken) return;
    setDeletingAssetId(asset.id);
    try {
      await fetch(`${API_URL}/api/assets/${asset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
    } catch { /* ignore */ }
    finally { setDeletingAssetId(null); }
  }, [accessToken, selectedAsset]);

  const insertAssetRef = useCallback((asset: UserAsset, position?: number) => {
    const ref = getAssetReference(asset);
    const view = editorViewRef.current;
    const currentCode = view?.state.doc.toString() ?? latexCode;
    const packageResult = isImageAsset(asset)
      ? ensureGraphicxPackage(currentCode)
      : { source: currentCode, insertedLength: 0 };
    const from = position ?? view?.state.selection.main.from ?? packageResult.source.length;
    const adjustedFrom = from + packageResult.insertedLength;
    const needsLeadingBreak = adjustedFrom > 0 && !/\s$/.test(packageResult.source[adjustedFrom - 1] ?? "");
    const needsTrailingBreak = !/^\s/.test(packageResult.source[adjustedFrom] ?? "");
    const insertion = `${needsLeadingBreak ? "\n" : ""}${ref}${needsTrailingBreak ? "\n" : ""}`;

    if (view) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert:
            packageResult.source.slice(0, adjustedFrom) +
            insertion +
            packageResult.source.slice(adjustedFrom),
        },
        selection: { anchor: adjustedFrom + insertion.length },
      });
      view.focus();
      return;
    }

    const nextCode =
      packageResult.source.slice(0, adjustedFrom) +
      insertion +
      packageResult.source.slice(adjustedFrom);
    setLatexCode(nextCode);
    setStatus("stale");
    setCacheStatus(null);
  }, [latexCode]);

  const handleEditorDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const assetRaw = event.dataTransfer.getData("application/x-sir-asset");
    if (!assetRaw) return;
    event.preventDefault();

    try {
      const asset = JSON.parse(assetRaw) as UserAsset;
      const view = editorViewRef.current;
      const position = view?.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined;
      insertAssetRef(asset, position);
    } catch {
      /* ignore invalid drag payload */
    }
  }, [insertAssetRef]);

  const handleAssetDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, asset: UserAsset) => {
    const ref = getAssetReference(asset);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-sir-asset", JSON.stringify(asset));
    event.dataTransfer.setData("text/plain", ref);
  }, []);

  const copyAssetRef = useCallback((asset: UserAsset) => {
    const ref = getAssetReference(asset);
    navigator.clipboard.writeText(ref);
    setCopiedAssetId(asset.id);
    setTimeout(() => setCopiedAssetId(null), 1500);
  }, []);

  const compile = useCallback(async (source = latexCode) => {
    if (!source.trim() || !accessToken) return false;

    setStatus("compiling");
    setErrorMsg("");
    setCompileLog("");
    setCacheStatus(null);

    try {
      const res = await fetch(`${API_URL}/api/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ source, engine }),
      });

      if (res.ok) {
        const buf = await res.arrayBuffer();
        setPdfBytes(new Uint8Array(buf));
        setPdfVersion((v) => v + 1);
        setCacheStatus(res.headers.get("X-Cache"));
        setStatus("done");
        setShowLog(false);
        return true;
      } else {
        const data = await res.json();
        const log = data.log || "";
        const parsed = extractLatexError(log);
        setErrorMsg(parsed || data.error || "Compilation failed");
        setCompileLog(log);
        setStatus("error");
        return false;
      }
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || "Network error");
      setStatus("error");
      return false;
    }
  }, [latexCode, engine, accessToken]);

  const saveFile = useCallback(async () => {
    if (saveStatus === "saving" || !accessToken) return;
    setSaveStatus("saving");
    try {
      if (fileId) {
        const res = await fetch(`${API_URL}/api/latex-files/${fileId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: fileName, content: latexCode, engine }),
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch(`${API_URL}/api/latex-files`, {
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
      await compile(latexCode);
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
    compile,
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

  const handleDownloadPdf = () => {
    if (!pdfBytes) return;
    const pdfBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" }));
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
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
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
    stale: "text-amber-500",
    compiling: "text-indigo-400",
    done: "text-emerald-400",
    error: "text-rose-400",
  }[status];

  const statusLabel = {
    idle: "Ready",
    stale: "Not compiled",
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
            onChange={(e) => {
              setEngine(e.target.value as Engine);
              setStatus("stale");
              setCacheStatus(null);
            }}
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
            {status === "stale"     && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
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

          {/* Compile */}
          <button
            onClick={() => compile(latexCode)}
            disabled={status === "compiling" || saveStatus === "saving"}
            className="neo-btn neo-btn-soft flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "compiling" ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M14.752 11.168l-5.197-3.027A1 1 0 008 9.006v5.988a1 1 0 001.555.832l5.197-2.961a1 1 0 000-1.697z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            Compile
          </button>

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

      {/* ─── Panes ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor Pane */}
        {(viewMode === "split" || viewMode === "editor") && (
          <div
              className={`glass-panel flex flex-col min-h-0 ${viewMode === "split" ? "w-1/2" : "w-full"} border-r border-white/30 relative rounded-none`}
              onDragOver={(event) => {
                if (Array.from(event.dataTransfer.types).includes("application/x-sir-asset")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={handleEditorDrop}
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
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                }}
                onChange={(value) => {
                  setLatexCode(value);
                  setStatus("stale");
                  setCacheStatus(null);
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

        {/* Assets Sidebar */}
        {assetsOpen && (
          <aside className="glass-panel flex w-80 max-w-[36vw] shrink-0 flex-col border-l border-white/30 rounded-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/30 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">Assets</span>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                    {assets.length}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] font-mono text-slate-400">
                  Drag into editor or click file name
                </div>
              </div>
              <button
                onClick={() => setAssetsOpen(false)}
                title="Close assets"
                className="neo-btn neo-btn-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-b border-white/30 px-4 py-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAssetUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAsset}
                className="neo-btn neo-btn-soft flex h-8 flex-1 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-violet-600 disabled:opacity-50"
              >
                {uploadingAsset ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                Upload
              </button>
              <button
                onClick={fetchAssets}
                disabled={assetsLoading}
                title="Refresh assets"
                className="neo-btn neo-btn-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 disabled:opacity-40"
              >
                <svg className={`h-3.5 w-3.5 ${assetsLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-visible px-3 py-3">
              {assetsLoading && (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
                  <span className="loading loading-spinner loading-xs" />
                  Loading files...
                </div>
              )}
              {!assetsLoading && assets.length === 0 && (
                <div className="neo-inset flex h-28 items-center justify-center rounded-lg text-xs text-slate-400">
                  No assets uploaded
                </div>
              )}
              {assets.length > 0 && (
                <div className="space-y-2">
                  {assets.map(asset => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(event) => handleAssetDragStart(event, asset)}
                      onDoubleClick={() => insertAssetRef(asset)}
                      onMouseEnter={(event) => {
                        if (!assetPreviewUrls[asset.id]) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHoverPreviewPosition({ x: rect.left - 12, y: rect.top + rect.height / 2 });
                        setHoveredAsset(asset);
                      }}
                      onMouseMove={(event) => {
                        if (!assetPreviewUrls[asset.id]) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHoverPreviewPosition({ x: rect.left - 12, y: rect.top + rect.height / 2 });
                      }}
                      onMouseLeave={() => setHoveredAsset(null)}
                      className="neo-inset group relative grid cursor-grab grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-xs active:cursor-grabbing"
                      title={asset.name}
                    >
                      <button
                        type="button"
                        onClick={() => isImageAsset(asset) && setSelectedAsset(asset)}
                        disabled={!isImageAsset(asset)}
                        className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border ${
                        isImageAsset(asset)
                          ? "border-violet-200 bg-violet-100 text-violet-600"
                          : "border-slate-200 bg-white/10 text-slate-500"
                      }`}>
                        {assetPreviewUrls[asset.id] ? (
                          <img
                            src={assetPreviewUrls[asset.id]}
                            alt={asset.name}
                            className="h-full w-full object-cover"
                          />
                        ) : isImageAsset(asset) ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => insertAssetRef(asset)}
                        className="min-w-0 text-left"
                        title="Insert"
                      >
                        <div className="truncate font-mono font-semibold text-slate-700">{asset.name}</div>
                        <div className="truncate text-[10px] text-slate-400">
                          {isImageAsset(asset) ? "image" : "file"} - {formatBytes(asset.size)}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => copyAssetRef(asset)}
                          title="Copy reference"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-violet-100 hover:text-violet-600"
                        >
                          {copiedAssetId === asset.id ? (
                            <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleAssetDelete(asset)}
                          disabled={deletingAssetId === asset.id}
                          title="Delete"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-rose-100 hover:text-rose-500 disabled:opacity-50"
                        >
                          {deletingAssetId === asset.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {selectedAsset && isImageAsset(selectedAsset) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-5 backdrop-blur-sm"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="glass-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/20 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-bold text-slate-100">{selectedAsset.name}</div>
                <div className="text-[10px] text-slate-400">{selectedAsset.mime_type} - {formatBytes(selectedAsset.size)}</div>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                title="Close preview"
                className="neo-btn neo-btn-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex min-h-[18rem] flex-1 items-center justify-center overflow-auto bg-slate-950/40 p-4">
              {selectedAssetLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="loading loading-spinner loading-sm" />
                  Loading image...
                </div>
              )}
              {!selectedAssetLoading && selectedAssetUrl && (
                <img
                  src={selectedAssetUrl}
                  alt={selectedAsset.name}
                  className="max-h-[76vh] max-w-full object-contain"
                />
              )}
              {!selectedAssetLoading && !selectedAssetUrl && (
                <div className="text-xs text-slate-400">Preview unavailable</div>
              )}
            </div>
          </div>
        </div>
      )}

      {hoveredAsset && assetPreviewUrls[hoveredAsset.id] && !selectedAsset && (
        <div
          className="pointer-events-none fixed z-[60] w-52 rounded-lg border border-white/20 bg-slate-950/90 p-2 shadow-2xl backdrop-blur-md"
          style={{
            left: hoverPreviewPosition.x,
            top: hoverPreviewPosition.y,
            transform: "translate(-100%, -50%)",
          }}
        >
          <img
            src={assetPreviewUrls[hoveredAsset.id]}
            alt={hoveredAsset.name}
            className="h-36 w-full rounded-md bg-slate-900 object-contain"
          />
          <div className="mt-2 truncate font-mono text-[10px] font-semibold text-slate-100">
            {hoveredAsset.name}
          </div>
        </div>
      )}

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
          setPdfBytes(null);
          setStatus("stale");
          setCacheStatus(null);
        }}
        onCancel={() => setConfirmNewDoc(false)}
      />
    </div>
  );
}
