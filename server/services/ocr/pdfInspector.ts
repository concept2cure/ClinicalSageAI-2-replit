/**
 * PDF inspector — fast structural inventory of a PDF BEFORE committing to a
 * parsing/OCR strategy.
 *
 * This is the triage step a careful analyst runs on a 1,000-page scanned
 * binder: how many pages, are there embedded bookmarks/TOC to navigate by,
 * which pages actually carry a text layer, and is the document born-digital,
 * scanned, or mixed. The verdict drives the strategy — read the text layer
 * directly, sweep a cheap OCR band to locate separators, or full OCR.
 *
 * Uses pdfjs-dist (already a dependency of the rasteriser) via lazy import;
 * no page is ever rendered here, so inspection stays cheap even for huge files.
 */

import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('pdf-inspector');

/** Below this many characters a page's text layer is treated as absent. */
const PAGE_TEXT_PRESENT_MIN = 32;

export interface PdfOutlineEntry {
  title: string;
  /** 1-based page number when the destination could be resolved. */
  page: number | null;
  depth: number;
}

export interface PdfPageTextStat {
  /** 1-based page number. */
  page: number;
  /** Characters in the embedded text layer. */
  chars: number;
}

export interface PdfInventory {
  numPages: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
  };
  /** Embedded bookmarks/TOC, flattened with depth. Empty when none exist. */
  outline: PdfOutlineEntry[];
  /** Text-layer census for the sampled pages. */
  pageTextStats: PdfPageTextStat[];
  sampledPages: number;
  /** Share of sampled pages with no usable text layer (0–1). */
  scannedPageRatio: number;
  assessment: 'born_digital' | 'scanned' | 'mixed';
  recommendation: string;
}

type PdfDocument = {
  numPages: number;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
  getOutline(): Promise<OutlineNode[] | null>;
  getDestination(dest: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: { str?: string }[] }>;
    cleanup(): void;
  }>;
  destroy(): Promise<void>;
};

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
}

async function loadPdf(data: Buffer | Uint8Array): Promise<PdfDocument> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : data;
  const task = getDocument({ data: bytes, disableFontFace: true, isEvalSupported: false });
  return (await task.promise) as unknown as PdfDocument;
}

async function resolveOutlinePage(pdf: PdfDocument, dest: string | unknown[] | null): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (Array.isArray(explicit) && explicit[0] != null) {
      const index = await pdf.getPageIndex(explicit[0]);
      return index + 1;
    }
  } catch {
    /* unresolvable destination — keep the title without a page */
  }
  return null;
}

async function flattenOutline(
  pdf: PdfDocument,
  nodes: OutlineNode[],
  depth: number,
  out: PdfOutlineEntry[],
  cap = 500,
): Promise<void> {
  for (const node of nodes) {
    if (out.length >= cap) return;
    out.push({ title: node.title, page: await resolveOutlinePage(pdf, node.dest), depth });
    if (node.items?.length) {
      await flattenOutline(pdf, node.items, depth + 1, out, cap);
    }
  }
}

/**
 * Pick pages to census: every page for small documents, otherwise the first
 * few + last few + a uniform spread (separators and front-matter live at the
 * edges; the spread catches mixed scanned/digital bodies).
 */
export function samplePageNumbers(numPages: number, maxSampled: number): number[] {
  if (numPages <= maxSampled) {
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }
  const picked = new Set<number>();
  const edge = Math.min(3, Math.floor(maxSampled / 4));
  for (let i = 1; i <= edge; i++) picked.add(i);
  for (let i = 0; i < edge; i++) picked.add(numPages - i);
  const remaining = maxSampled - picked.size;
  for (let i = 1; i <= remaining; i++) {
    picked.add(Math.max(1, Math.min(numPages, Math.round((i * numPages) / (remaining + 1)))));
  }
  return [...picked].sort((a, b) => a - b);
}

/** Extract the embedded text layer of specific pages (1-based, inclusive). */
export async function extractPdfPagesText(
  data: Buffer | Uint8Array,
  firstPage: number,
  lastPage: number,
): Promise<{ numPages: number; pages: { page: number; text: string }[] }> {
  const pdf = await loadPdf(data);
  try {
    const first = Math.max(1, Math.floor(firstPage));
    const last = Math.min(pdf.numPages, Math.floor(lastPage));
    const pages: { page: number; text: string }[] = [];
    for (let n = first; n <= last; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push({
        page: n,
        text: content.items.map((i) => i.str ?? '').join(' ').replace(/\s+/g, ' ').trim(),
      });
      page.cleanup();
    }
    return { numPages: pdf.numPages, pages };
  } finally {
    await pdf.destroy();
  }
}

export interface InspectPdfOptions {
  /** Cap on pages whose text layer is censused (default 30, max 200). */
  maxSampledPages?: number;
}

export async function inspectPdf(
  data: Buffer | Uint8Array,
  options: InspectPdfOptions = {},
): Promise<PdfInventory> {
  const pdf = await loadPdf(data);
  try {
    const numPages = pdf.numPages;

    let info: Record<string, unknown> = {};
    try {
      info = (await pdf.getMetadata()).info ?? {};
    } catch {
      /* metadata is optional */
    }
    const str = (k: string): string | undefined =>
      typeof info[k] === 'string' && (info[k] as string).trim() ? (info[k] as string) : undefined;

    const outline: PdfOutlineEntry[] = [];
    try {
      const nodes = await pdf.getOutline();
      if (nodes?.length) await flattenOutline(pdf, nodes, 0, outline);
    } catch {
      /* no outline */
    }

    const maxSampled = Math.min(Math.max(1, options.maxSampledPages ?? 30), 200);
    const sampled = samplePageNumbers(numPages, maxSampled);
    const pageTextStats: PdfPageTextStat[] = [];
    for (const n of sampled) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const chars = content.items.reduce((sum, item) => sum + (item.str?.length ?? 0), 0);
      pageTextStats.push({ page: n, chars });
      page.cleanup();
    }

    const textless = pageTextStats.filter((p) => p.chars < PAGE_TEXT_PRESENT_MIN).length;
    const scannedPageRatio = pageTextStats.length ? textless / pageTextStats.length : 0;
    const assessment: PdfInventory['assessment'] =
      scannedPageRatio >= 0.8 ? 'scanned' : scannedPageRatio <= 0.2 ? 'born_digital' : 'mixed';

    const recommendation =
      assessment === 'born_digital'
        ? 'Embedded text layer is present — read it directly with read_uploaded_document (page-ranged for large documents). OCR is not needed.'
        : assessment === 'scanned'
          ? outline.length
            ? 'No usable text layer, but embedded bookmarks exist — navigate by the outline and OCR only the page ranges you need with ocr_document_pages.'
            : 'No usable text layer and no bookmarks. For large documents, run a cheap top-band OCR sweep (ocr_document_pages with region "top_band") to locate section/exhibit separators, then full-OCR only the pages that matter.'
          : 'Mixed text coverage — read the text layer page-ranged with read_uploaded_document, and OCR only the page ranges the census shows as textless (ocr_document_pages).';

    logger.info('PDF inspected', {
      numPages,
      outlineEntries: outline.length,
      sampled: sampled.length,
      scannedPageRatio: Math.round(scannedPageRatio * 100) / 100,
      assessment,
    });

    return {
      numPages,
      metadata: {
        title: str('Title'),
        author: str('Author'),
        subject: str('Subject'),
        creator: str('Creator'),
        producer: str('Producer'),
        creationDate: str('CreationDate'),
      },
      outline,
      pageTextStats,
      sampledPages: sampled.length,
      scannedPageRatio,
      assessment,
      recommendation,
    };
  } finally {
    await pdf.destroy();
  }
}
