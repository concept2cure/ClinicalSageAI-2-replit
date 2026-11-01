/**
 * The self-hosted Docling layout reader (docling-serve), admitted by the founder
 * on 2026-11-01 (P-90, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * Before: this client POSTed raw bytes to `${DOCLING_BASE_URL}/parse` and read
 * `{ text, sections, confidence }`. docling-serve has no such endpoint and
 * returns no such shape, so against a real reader every call came back empty,
 * logged as "docling_unavailable". It was never reached anyway: the intake
 * pipeline that called it has no caller.
 *
 * Now it speaks docling-serve's v1 interface (docs/usage.md of
 * docling-project/docling-serve):
 * - `POST /v1/convert/file`, multipart: `files`, `to_formats=json`, no images.
 *   OCR is left to the platform's own extractor, which has the page budget.
 * - `X-Api-Key` header when the deployment set one (DOCLING_SERVE_API_KEY on the
 *   reader, DOCLING_API_KEY here).
 * - The answer's `document.json_content` is a DoclingDocument. It is read in
 *   reading order (`body`), never as markdown, so each table keeps its cells.
 *
 * What it returns (layoutFromDoclingDocument):
 * - **Text.** Headings on their own lines and paragraphs separated by a blank
 *   line. A table is its caption, then one line per row with its cells separated
 *   by a tab: the same convention pdf-parse and the spreadsheet renderer use,
 *   which the Vault chunker reads as a table (document-section-structure.ts
 *   chunkTypeOf).
 * - **Pages.** Each page's span of that text, built from where each block was
 *   placed. A span map that cannot be verified is not returned.
 * - **Tables.** Their cells (row, column, spans, header flags) and where each
 *   stands in the text.
 * Page headers, page footers and other furniture are left out.
 *
 * The reader runs on the deployment's own infrastructure. Nothing here sends a
 * document anywhere else, and a failure is a refusal with its reason, never an
 * empty reading presented as the document.
 */
import { createScopedLogger } from '../../utils/logger';
import type { ParsedDocument, ParsedDocumentSection } from '../../services/documentIntelligence/contracts';

const logger = createScopedLogger('docling-client');

/** The reader reports no confidence for a document; the parse contract's number says only that. */
const UNREPORTED_CONFIDENCE = 0.7;

/** Why the reader could not read a file. */
export class DoclingReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoclingReaderError';
  }
}

/** One table cell, as the reader placed it. */
export interface LayoutTableCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  columnHeader: boolean;
  rowHeader: boolean;
}

/** One table: its cells, its page and where its rendering stands in the text, `[start, end)`. */
export interface LayoutTable {
  ref: string;
  page: number | null;
  numRows: number;
  numCols: number;
  caption: string | null;
  start: number;
  end: number;
  cells: LayoutTableCell[];
}

/** A document as the layout reader read it. */
export interface LayoutReading {
  text: string;
  /** Each page's text, in page order, for page-offsets.ts alignPageSpans. Empty when pages could not be told apart. */
  pages: Array<{ page: number; text: string }>;
  sections: ParsedDocumentSection[];
  tables: LayoutTable[];
}

// ── The DoclingDocument fields this reads (docling-core DoclingDocument schema) ──
interface RefItem { $ref: string }
interface Prov { page_no?: number }
interface DocItem {
  self_ref?: string;
  label?: string;
  content_layer?: string;
  children?: RefItem[];
  prov?: Prov[];
  text?: string;
  level?: number;
  captions?: RefItem[];
  data?: { num_rows?: number; num_cols?: number; table_cells?: Array<Record<string, unknown>> };
}
export interface DoclingDocumentJson {
  body?: DocItem;
  texts?: DocItem[];
  tables?: DocItem[];
  pictures?: DocItem[];
  groups?: DocItem[];
  key_value_items?: DocItem[];
  form_items?: DocItem[];
  pages?: Record<string, unknown>;
}

const FURNITURE_LABELS = new Set(['page_header', 'page_footer']);
const HEADING_LABELS = new Set(['section_header', 'title']);

/** One block of the reading: its text, the page it stands on, and what it is. */
interface Block { text: string; page: number | null; heading?: { level: number; ref: string }; table?: Omit<LayoutTable, 'start' | 'end'> }

/** The item a `#/<kind>/<index>` reference names, or null. */
function resolve(doc: DoclingDocumentJson, ref: string): DocItem | null {
  const m = /^#\/(texts|tables|pictures|groups|key_value_items|form_items)\/(\d+)$/.exec(ref);
  if (!m) return null;
  const list = doc[m[1] as keyof Omit<DoclingDocumentJson, 'body' | 'pages'>];
  return Array.isArray(list) ? list[Number(m[2])] ?? null : null;
}

const pageOf = (item: DocItem): number | null => {
  const p = item.prov?.[0]?.page_no;
  return typeof p === 'number' && Number.isInteger(p) && p > 0 ? p : null;
};
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/[\t\r\n]+/g, ' ').trim() : '');
const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback);

/** A table's cells, and its rows as tab-separated lines (a spanned cell's text in its first position). */
function tableBlock(item: DocItem, caption: string | null): Block | null {
  const cells: LayoutTableCell[] = (item.data?.table_cells ?? []).map((c) => ({
    row: int(c.start_row_offset_idx, 0),
    col: int(c.start_col_offset_idx, 0),
    rowSpan: Math.max(1, int(c.row_span, 1)),
    colSpan: Math.max(1, int(c.col_span, 1)),
    text: clean(c.text),
    columnHeader: c.column_header === true,
    rowHeader: c.row_header === true,
  }));
  const numRows = Math.max(int(item.data?.num_rows, 0), ...cells.map((c) => c.row + c.rowSpan));
  const numCols = Math.max(int(item.data?.num_cols, 0), ...cells.map((c) => c.col + c.colSpan));
  if (cells.length === 0 || numRows === 0 || numCols === 0) return null;
  const grid = Array.from({ length: numRows }, () => Array<string>(numCols).fill(''));
  for (const c of cells) if (grid[c.row]) grid[c.row][c.col] = c.text;
  const rows = grid.filter((r) => r.some((cell) => cell !== '')).map((r) => r.join('\t'));
  const text = [caption, ...rows].filter((line): line is string => !!line).join('\n');
  return { text, page: pageOf(item), table: { ref: item.self_ref ?? '', page: pageOf(item), numRows, numCols, caption, cells } };
}

/** A table or a picture, read with its own caption once: a table's rows, or a picture's caption alone. */
function captionedBlock(doc: DoclingDocumentJson, item: DocItem, isTable: boolean, seen: Set<string>): Block | null {
  const unread = (item.captions ?? []).filter((c) => typeof c?.$ref === 'string' && !seen.has(c.$ref));
  for (const c of unread) seen.add(c.$ref);
  const caption = unread.map((c) => clean(resolve(doc, c.$ref)?.text)).filter(Boolean).join(' ') || null;
  if (isTable) return tableBlock(item, caption);
  return caption ? { text: caption, page: pageOf(item) } : null;
}

/** A text item as a block: a heading with its level, or a paragraph. Null when it holds no text. */
function textBlock(item: DocItem, ref: string): Block | null {
  const text = clean(item.text);
  if (!text) return null;
  return HEADING_LABELS.has(item.label ?? '')
    ? { text, page: pageOf(item), heading: { level: Math.max(1, int(item.level, 1)), ref } }
    : { text, page: pageOf(item) };
}

/** Whether an item is part of the body: not furniture, not a page header or footer. */
const inBody = (item: DocItem | null): item is DocItem =>
  !!item && (!item.content_layer || item.content_layer === 'body') && !FURNITURE_LABELS.has(item.label ?? '');

/** The reading-order blocks under `refs`, each item visited once. */
function blocksOf(doc: DoclingDocumentJson, refs: RefItem[] | undefined, seen: Set<string>, out: Block[]): Block[] {
  for (const r of refs ?? []) {
    const ref = r?.$ref;
    if (typeof ref !== 'string' || seen.has(ref)) continue;
    seen.add(ref);
    const item = resolve(doc, ref);
    if (!inBody(item)) continue;
    const isTable = ref.startsWith('#/tables/');
    if (isTable || ref.startsWith('#/pictures/')) {
      // A caption belongs to its table or picture; it is read with it, once.
      const block = captionedBlock(doc, item, isTable, seen);
      if (block) out.push(block);
      continue;
    }
    const block = textBlock(item, ref);
    if (block) out.push(block);
    blocksOf(doc, item.children, seen, out);
  }
  return out;
}

/** Each page's span of the text, when every block's page is known and pages only move forward. */
function pagesOf(doc: DoclingDocumentJson, blocks: Block[], starts: number[], text: string): LayoutReading['pages'] {
  const numbered = Object.keys(doc.pages ?? {}).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const last = Math.max(0, ...numbered, ...blocks.map((b) => b.page ?? 0));
  if (last === 0 || blocks.some((b, i) => b.page === null || (i > 0 && b.page < blocks[i - 1].page!))) return [];
  return Array.from({ length: last }, (_, i) => {
    const on = blocks.map((b, j) => ({ b, j })).filter(({ b }) => b.page === i + 1);
    if (on.length === 0) return { page: i + 1, text: '' };
    const first = on[0].j;
    const end = on[on.length - 1].j;
    return { page: i + 1, text: text.slice(starts[first], starts[end] + blocks[end].text.length) };
  });
}

/** The sections: each heading, and the text after it up to the next heading. */
function sectionsOf(blocks: Block[]): ParsedDocumentSection[] {
  const sections: ParsedDocumentSection[] = [];
  let open: { section: ParsedDocumentSection; body: string[] } | null = null;
  const close = () => { if (open) { open.section.text = open.body.join('\n\n'); sections.push(open.section); } };
  for (const b of blocks) {
    if (b.heading) {
      close();
      open = { section: { id: b.heading.ref, title: b.text, level: b.heading.level, text: '', pageStart: b.page ?? undefined, pageEnd: b.page ?? undefined }, body: [] };
      continue;
    }
    if (!open) continue;
    open.body.push(b.text);
    if (b.page !== null) open.section.pageEnd = b.page;
  }
  close();
  return sections;
}

/** A DoclingDocument as the platform reads it: text, pages, sections and tables. Pure. */
export function layoutFromDoclingDocument(doc: DoclingDocumentJson): LayoutReading {
  const blocks = blocksOf(doc, doc.body?.children, new Set(), []);
  const starts: number[] = [];
  let at = 0;
  for (const b of blocks) {
    starts.push(at);
    at += b.text.length + 2;
  }
  const text = blocks.map((b) => b.text).join('\n\n');
  const tables = blocks.flatMap((b, i) => (b.table ? [{ ...b.table, start: starts[i], end: starts[i] + b.text.length }] : []));
  return { text, pages: pagesOf(doc, blocks, starts, text), sections: sectionsOf(blocks), tables };
}

export class DoclingClient {
  constructor(
    private readonly baseUrl = process.env.DOCLING_BASE_URL || 'http://localhost:5001',
    private readonly timeoutMs = Number(process.env.DOCLING_TIMEOUT_MS || 120000),
    private readonly apiKey = process.env.DOCLING_API_KEY || '',
  ) {}

  /** Convert one file with the reader. Throws DoclingReaderError with the reason it could not. */
  async read(input: Buffer, filename: string, mimeType = 'application/pdf'): Promise<LayoutReading> {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(input)], { type: mimeType }), filename || 'document');
    form.append('to_formats', 'json');
    form.append('image_export_mode', 'placeholder');
    form.append('do_ocr', 'false');
    form.append('do_table_structure', 'true');
    form.append('abort_on_error', 'false');
    form.append('document_timeout', String(Math.max(1, Math.floor(this.timeoutMs / 1000))));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/convert/file`, {
        method: 'POST',
        headers: { Accept: 'application/json', ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}) },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      throw new DoclingReaderError(controller.signal.aborted
        ? `The layout reader did not answer within ${this.timeoutMs} ms.`
        : `The layout reader could not be reached (${error instanceof Error ? error.message : String(error)}).`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new DoclingReaderError(`The layout reader refused the file (HTTP ${response.status}).`);
    const payload = (await response.json().catch(() => null)) as {
      status?: string; errors?: unknown[]; document?: { json_content?: DoclingDocumentJson | null };
    } | null;
    if (!payload || payload.status !== 'success' || !payload.document?.json_content) {
      throw new DoclingReaderError(`The layout reader did not convert the file (status ${payload?.status ?? 'unknown'}).`);
    }
    return layoutFromDoclingDocument(payload.document.json_content);
  }

  /** The intake pipeline's contract: never throws; a failure is an empty reading with its reason. */
  async parse(input: Buffer, filename: string): Promise<ParsedDocument> {
    try {
      const reading = await this.read(input, filename);
      return {
        provider: 'docling',
        text: reading.text,
        sections: reading.sections,
        confidence: reading.text ? UNREPORTED_CONFIDENCE : 0,
        warnings: [],
        metadata: { confidenceReported: false, tables: reading.tables },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'docling_unavailable';
      logger.warn('Docling parse failed', { error: reason, filename });
      return { provider: 'docling', text: '', sections: [], confidence: 0, warnings: [reason] };
    }
  }
}
