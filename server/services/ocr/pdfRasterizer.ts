/**
 * PDF rasteriser — renders PDF pages to PNG bitmaps for OCR.
 *
 * Lets AnA OCR scanned/image-only PDFs with **no system binary**: pages are
 * rendered with pdfjs-dist onto an `@napi-rs/canvas` surface, then handed to the
 * WASM Tesseract engine. This is the fallback for runtimes without `ocrmypdf`.
 *
 * Supports targeted rendering — an explicit page list / range and an optional
 * page REGION (fractional crop) — so a 1,000-page scanned binder can be swept
 * cheaply (e.g. OCR only the top band of each page to find exhibit separators)
 * before committing to full-page OCR of the pages that matter.
 *
 * pdfjs-dist (v5, ESM-only) and @napi-rs/canvas are loaded lazily via dynamic
 * import so a server that never OCRs a PDF doesn't pay the cost — and so the
 * native canvas module is only required when this path is actually used.
 */

import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('pdf-rasterizer');

/** Fractional crop of a page, all values 0–1. Omitted axes default to full page. */
export interface RasterizeRegion {
  /** Top edge as a fraction of page height (0 = top). */
  top?: number;
  /** Left edge as a fraction of page width (0 = left). */
  left?: number;
  /** Region width as a fraction of page width. */
  width?: number;
  /** Region height as a fraction of page height. */
  height?: number;
}

export interface RasterizeOptions {
  /** Render resolution. 200 is a good OCR/speed trade-off. */
  dpi?: number;
  /** Cap pages rendered (guards against huge documents). */
  maxPages?: number;
  /** First page to render, 1-based inclusive. Default 1. */
  firstPage?: number;
  /** Last page to render, 1-based inclusive. Default: last page. */
  lastPage?: number;
  /** Explicit 1-based page list — overrides firstPage/lastPage when set. */
  pages?: number[];
  /** Crop each rendered page to this fractional region. */
  region?: RasterizeRegion;
}

export interface RasterizedPage {
  /** 1-based page number in the source PDF. */
  page: number;
  png: Buffer;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function selectPages(numPages: number, options: RasterizeOptions): number[] {
  let selected: number[];
  if (options.pages?.length) {
    selected = [...new Set(options.pages.map((p) => Math.floor(p)))]
      .filter((p) => p >= 1 && p <= numPages)
      .sort((a, b) => a - b);
  } else {
    const first = Math.max(1, Math.floor(options.firstPage ?? 1));
    const last = Math.min(numPages, Math.floor(options.lastPage ?? numPages));
    selected = [];
    for (let n = first; n <= last; n++) selected.push(n);
  }
  if (options.maxPages && selected.length > options.maxPages) {
    selected = selected.slice(0, options.maxPages);
  }
  return selected;
}

/** Render selected pages of a PDF to PNG buffers, tagged with page numbers. */
export async function rasterizePdfPages(
  data: Buffer | Uint8Array,
  options: RasterizeOptions = {},
): Promise<RasterizedPage[]> {
  const dpi = options.dpi ?? 200;
  const scale = dpi / 72;

  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('@napi-rs/canvas'),
  ]);

  // pdfjs requires a plain Uint8Array — a Node Buffer (Uint8Array subclass) is rejected.
  const bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : data;
  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  try {
    const pageNumbers = selectPages(pdf.numPages, options);
    const pages: RasterizedPage[] = [];
    for (const n of pageNumbers) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      // pdfjs v5 accepts the canvas alongside the 2d context.
      await page.render({ canvasContext: ctx as unknown as object, viewport, canvas } as never).promise;

      if (options.region) {
        const r = options.region;
        const left = clamp01(r.left ?? 0);
        const top = clamp01(r.top ?? 0);
        const width = clamp01(r.width ?? 1 - left);
        const height = clamp01(r.height ?? 1 - top);
        const sx = Math.floor(canvas.width * left);
        const sy = Math.floor(canvas.height * top);
        const sw = Math.max(1, Math.min(canvas.width - sx, Math.ceil(canvas.width * width)));
        const sh = Math.max(1, Math.min(canvas.height - sy, Math.ceil(canvas.height * height)));
        const crop = createCanvas(sw, sh);
        crop.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        pages.push({ page: n, png: crop.toBuffer('image/png') });
      } else {
        pages.push({ page: n, png: canvas.toBuffer('image/png') });
      }
      page.cleanup();
    }
    logger.info('Rasterized PDF', {
      pages: pages.length,
      dpi,
      region: options.region ? 'cropped' : 'full',
    });
    return pages;
  } finally {
    await pdf.destroy();
  }
}

/** Render each selected page of a PDF to a PNG buffer. Returns one buffer per page. */
export async function rasterizePdf(
  data: Buffer | Uint8Array,
  options: RasterizeOptions = {},
): Promise<Buffer[]> {
  return (await rasterizePdfPages(data, options)).map((p) => p.png);
}
