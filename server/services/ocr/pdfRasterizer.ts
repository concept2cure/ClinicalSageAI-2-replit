/**
 * PDF rasteriser — renders PDF pages to PNG bitmaps for OCR.
 *
 * Lets AnA OCR scanned/image-only PDFs with **no system binary**: pages are
 * rendered with pdfjs-dist onto an `@napi-rs/canvas` surface, then handed to the
 * WASM Tesseract engine. This is the fallback for runtimes without `ocrmypdf`.
 *
 * pdfjs-dist (v5, ESM-only) and @napi-rs/canvas are loaded lazily via dynamic
 * import so a server that never OCRs a PDF doesn't pay the cost — and so the
 * native canvas module is only required when this path is actually used.
 */

import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('pdf-rasterizer');

export interface RasterizeOptions {
  /** Render resolution. 200 is a good OCR/speed trade-off. */
  dpi?: number;
  /** Cap pages rendered (guards against huge documents). */
  maxPages?: number;
}

/** Render each page of a PDF to a PNG buffer. Returns one buffer per page. */
export async function rasterizePdf(
  data: Buffer | Uint8Array,
  options: RasterizeOptions = {},
): Promise<Buffer[]> {
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
    const total = options.maxPages ? Math.min(pdf.numPages, options.maxPages) : pdf.numPages;
    const pages: Buffer[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      // pdfjs v5 accepts the canvas alongside the 2d context.
      await page.render({ canvasContext: ctx as unknown as object, viewport, canvas } as never).promise;
      pages.push(canvas.toBuffer('image/png'));
      page.cleanup();
    }
    logger.info('Rasterized PDF', { pages: pages.length, dpi });
    return pages;
  } finally {
    await pdf.destroy();
  }
}
