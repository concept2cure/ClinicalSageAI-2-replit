/**
 * rasterize_page's engine: one page of a PDF or DOCX rendered to a PNG file.
 *
 * A DOCX is converted with the one DOCX→PDF pipeline (docx-pdf-pipeline.ts,
 * headless LibreOffice); the PDF page is rendered by pdfRasterizer.ts
 * (pdfjs on a native canvas, no system binary). The result names a file that
 * exists, with its size, dimensions and SHA-256 — the tool used to return
 * `success: true` and a shell command it never ran.
 *
 * The caller confines both paths to the tenant's document workspace.
 *
 * @module server/services/ana/page-render
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { rasterizePdfPages } from '../ocr/pdfRasterizer.js';
import { pdfPageCount } from '../ocr/pdfInspector.js';
import { workspaceFileName } from './document-workspace.js';

export interface RenderedPage {
  pngPath: string;
  page: number;
  pageCount: number;
  /** The dpi rendered at: dpiRequested, or lower where the page would exceed maxPixels. */
  dpi: number;
  dpiRequested: number;
  widthPx: number;
  heightPx: number;
  bytes: number;
  sha256: string;
  /** For a DOCX: the PDF it was converted to first. */
  convertedPdf?: string;
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { widthPx: number; heightPx: number } {
  return { widthPx: png.readUInt32BE(16), heightPx: png.readUInt32BE(20) };
}

/** Pixels one rendered page may have: 40 Mpx, about 160 MB of canvas. */
export const MAX_PAGE_PIXELS = 40_000_000;

/**
 * What the file is: by its extension, or — for an upload, which is stored
 * without one (uploads/org-<id>/file_<ts>_<rand>) — by its first bytes.
 */
async function documentKind(documentPath: string): Promise<'pdf' | 'docx' | null> {
  const ext = path.extname(documentPath).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext !== '') return null;
  const handle = await fs.open(documentPath, 'r');
  try {
    const head = Buffer.alloc(5);
    await handle.read(head, 0, 5, 0);
    if (head.toString('latin1') === '%PDF-') return 'pdf';
    if (head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'docx';
    return null;
  } finally {
    await handle.close();
  }
}

export async function renderDocumentPage(params: {
  /** Already confined to the tenant's workspace by the caller. */
  documentPath: string;
  page: number;
  dpi: number;
  /** A scratch directory in the tenant's area; created here. */
  outputDir: string;
  maxPixels?: number;
}): Promise<RenderedPage> {
  const { documentPath, page, dpi, outputDir } = params;
  const kind = await documentKind(documentPath);
  if (!kind) throw new Error('rasterize_page renders PDF and DOCX files only.');
  await fs.mkdir(outputDir, { recursive: true });
  const stem = workspaceFileName(path.basename(documentPath, path.extname(documentPath)), 'document');

  let pdfPath = documentPath;
  let convertedPdf: string | undefined;
  if (kind === 'docx') {
    // The converter keys on the extension, which an upload does not have.
    let docxPath = documentPath;
    if (path.extname(documentPath).toLowerCase() !== '.docx') {
      docxPath = path.join(outputDir, `${stem}.docx`);
      await fs.copyFile(documentPath, docxPath);
    }
    const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
    const result = await runDocxPdfPipeline({
      inputDocxPath: docxPath,
      outputPdfPath: path.join(outputDir, `${stem}.pdf`),
    });
    pdfPath = result.finalPdf;
    convertedPdf = result.finalPdf;
  }

  const pdf = await fs.readFile(pdfPath);
  const pageCount = await pdfPageCount(pdf);
  if (pageCount === null) throw new Error('The PDF could not be read, so no page was rendered.');
  if (page > pageCount) {
    throw new Error(`Page ${page} does not exist: the document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
  }
  const [rendered] = await rasterizePdfPages(pdf, {
    pages: [page],
    dpi,
    maxPixels: params.maxPixels ?? MAX_PAGE_PIXELS,
  });
  if (!rendered) throw new Error(`Page ${page} could not be rendered.`);
  const dpiUsed = Math.round(rendered.dpi);

  const pngPath = path.join(outputDir, `${stem}-p${page}-${dpiUsed}dpi.png`);
  await fs.writeFile(pngPath, rendered.png);
  const written = await fs.readFile(pngPath);
  return {
    pngPath,
    page,
    pageCount,
    dpi: dpiUsed,
    dpiRequested: dpi,
    ...pngSize(written),
    bytes: written.length,
    sha256: createHash('sha256').update(written).digest('hex'),
    ...(convertedPdf ? { convertedPdf } : {}),
  };
}
