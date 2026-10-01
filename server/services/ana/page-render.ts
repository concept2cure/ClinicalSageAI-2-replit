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
  dpi: number;
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

export async function renderDocumentPage(params: {
  /** Already confined to the tenant's workspace by the caller. */
  documentPath: string;
  page: number;
  dpi: number;
  /** A scratch directory in the tenant's area; created here. */
  outputDir: string;
}): Promise<RenderedPage> {
  const { documentPath, page, dpi, outputDir } = params;
  const ext = path.extname(documentPath).toLowerCase();
  if (ext !== '.pdf' && ext !== '.docx') {
    throw new Error('rasterize_page renders .pdf and .docx files only.');
  }
  await fs.mkdir(outputDir, { recursive: true });
  const stem = workspaceFileName(path.basename(documentPath, ext), 'document');

  let pdfPath = documentPath;
  let convertedPdf: string | undefined;
  if (ext === '.docx') {
    const { runDocxPdfPipeline } = await import('../docx-pdf-pipeline.js');
    const result = await runDocxPdfPipeline({
      inputDocxPath: documentPath,
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
  const [rendered] = await rasterizePdfPages(pdf, { pages: [page], dpi });
  if (!rendered) throw new Error(`Page ${page} could not be rendered.`);

  const pngPath = path.join(outputDir, `${stem}-p${page}-${dpi}dpi.png`);
  await fs.writeFile(pngPath, rendered.png);
  const written = await fs.readFile(pngPath);
  return {
    pngPath,
    page,
    pageCount,
    dpi,
    ...pngSize(written),
    bytes: written.length,
    sha256: createHash('sha256').update(written).digest('hex'),
    ...(convertedPdf ? { convertedPdf } : {}),
  };
}
