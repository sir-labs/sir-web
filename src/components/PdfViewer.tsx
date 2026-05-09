import { useState, useRef, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  data: Uint8Array;
}

export function PdfViewer({ data }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stable object with a fresh buffer copy — PDF.js transfers (detaches) the
  // ArrayBuffer to its worker on first load, so we must copy before handing it over.
  // useMemo keeps the reference stable across re-renders so react-pdf doesn't reload.
  const file = useMemo(() => ({ data: data.slice() }), [data]);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(node);
    containerRef.current = node;
    setWidth(node.clientWidth);
  }, []);

  return (
    <div ref={measureRef} className="overflow-y-auto overflow-x-hidden h-full bg-slate-200">
      <Document
        file={file}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={
          <div className="flex items-center justify-center h-40 gap-2 text-slate-400 text-xs font-mono">
            <span className="loading loading-spinner loading-sm" />
            Rendering…
          </div>
        }
        error={
          <div className="flex items-center justify-center h-40 text-rose-400 text-xs font-mono">
            Failed to render PDF
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i} className="flex justify-center py-2">
            <Page
              pageNumber={i + 1}
              width={width ? width - 32 : undefined}
              renderTextLayer
              renderAnnotationLayer
              className="shadow-md"
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
