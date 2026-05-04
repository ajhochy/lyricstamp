// use-pdf.ts — pdfjs-dist browser-side PDF rendering hook
import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker is served from public/ — copied there by the copy:pdf-worker npm script.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export interface PdfRenderer {
  pageCount: number;
  /** Render page `pageNum` (1-indexed) into an existing visible canvas. */
  renderToCanvas: (pageNum: number, canvas: HTMLCanvasElement) => Promise<void>;
  /** Render page `pageNum` (1-indexed) to a PNG data URL (offscreen — safe for export). */
  renderToDataUrl: (pageNum: number) => Promise<string>;
}

const EMPTY_RENDERER: PdfRenderer = {
  pageCount: 0,
  renderToCanvas: async () => undefined,
  renderToDataUrl: async () => '',
};

export function usePdf(file: File | null): PdfRenderer {
  const [pageCount, setPageCount] = useState<number>(0);
  // Hold the loaded pdf document in a ref so it survives re-renders without
  // recreating callbacks.
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // Cache getPage() proxies by 1-indexed page number.
  const pageCache = useRef<Map<number, pdfjsLib.PDFPageProxy>>(new Map());

  // Load / reload the pdf whenever the File changes.
  useEffect(() => {
    if (!file) {
      // Release old document
      pdfRef.current?.destroy();
      pdfRef.current = null;
      pageCache.current.clear();
      setPageCount(0);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const arrayBuffer = await file.arrayBuffer();
      if (cancelled) return;
      // Release any previously loaded doc
      pdfRef.current?.destroy();
      pdfRef.current = null;
      pageCache.current.clear();

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (cancelled) {
        pdf.destroy();
        return;
      }
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
    };

    load().catch((err) => {
      if (!cancelled) console.error('[use-pdf] Failed to load PDF:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const getPage = useCallback(async (pageNum: number): Promise<pdfjsLib.PDFPageProxy | null> => {
    if (!pdfRef.current) return null;
    const cached = pageCache.current.get(pageNum);
    if (cached) return cached;
    const proxy = await pdfRef.current.getPage(pageNum);
    pageCache.current.set(pageNum, proxy);
    return proxy;
  }, []);

  const renderPageToCanvas = useCallback(
    async (pageNum: number, canvas: HTMLCanvasElement): Promise<void> => {
      const page = await getPage(pageNum);
      if (!page) return;

      const scale = 1.5 * window.devicePixelRatio;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      // Scale CSS size back down by DPR so physical pixels map to CSS pixels.
      canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
      canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    },
    [getPage],
  );

  const renderToDataUrl = useCallback(
    async (pageNum: number): Promise<string> => {
      const page = await getPage(pageNum);
      if (!page) return '';

      const scale = 1.5 * window.devicePixelRatio;
      const viewport = page.getViewport({ scale });

      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;

      const ctx = offscreen.getContext('2d');
      if (!ctx) return '';

      await page.render({ canvas: offscreen, canvasContext: ctx, viewport }).promise;
      return offscreen.toDataURL('image/png');
    },
    [getPage],
  );

  if (!file) return EMPTY_RENDERER;

  return {
    pageCount,
    renderToCanvas: renderPageToCanvas,
    renderToDataUrl,
  };
}
