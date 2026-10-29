/**
 * CSR slice 8 (2026-10-29): the structural check an assembled CSR must pass
 * before it is handed to Submission Center, read from the PDF bytes, not from
 * what the assembler meant to write.
 *
 * - Bookmarks: the body's outline reaches four levels, and every heading the
 *   body draws (to four levels) has a bookmark at its own depth. FDA's PDF
 *   specifications (FDA_PDF_SPECS, regulatory-basis.ts; recall) ask for
 *   bookmarks that mirror the table of contents; four levels is this design's
 *   requirement (docs/design/CSR_END_TO_END_2026-10-29.md, slice 8).
 * - Links: every link resolves. A GoTo names a destination defined in the same
 *   file; a GoToR names a file of this assembly, and a named destination that
 *   file defines (or a page it has). A link anywhere else is broken.
 *
 * Uses pdf-lib, which the eCTD bookmark generator (pdf-bookmark-generator.ts)
 * already uses, to read the outline, the name tree and the link annotations.
 *
 * A link's target leaf (a listing can run to thousands of pages) is not loaded:
 * only its page count and named destinations are read, through its
 * cross-reference table (readLeafTargets). A leaf laid out otherwise (an xref
 * stream or an incremental update, as a supplied PDF may be) is read whole.
 */
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { PDFArray, PDFContext, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFObjectParser, PDFRef, PDFString, type PDFObject } from 'pdf-lib';

export interface PdfLink { page: number; action: string; destination: string | number | null; file: string | null }
export interface PdfStructure { pages: number; outline: Array<{ title: string; depth: number }>; outlineDepth: number; destinations: Set<string>; links: PdfLink[] }
export interface StructureFinding { file: string; code: 'BOOKMARK_DEPTH' | 'BOOKMARK_MISSING' | 'BROKEN_LINK'; message: string }
export interface StructureReport { ok: boolean; findings: StructureFinding[]; bodyOutlineDepth: number; linksChecked: number }

const text = (o: PDFObject | undefined): string | null =>
  o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : o instanceof PDFName ? o.decodeText() : null;

function outlineOf(doc: PDFDocument): PdfStructure['outline'] {
  const out: PdfStructure['outline'] = [];
  const walk = (first: PDFObject | undefined, depth: number, guard: Set<PDFObject>) => {
    let node = first ? doc.context.lookup(first) : undefined;
    while (node instanceof PDFDict && !guard.has(node)) {
      guard.add(node);
      out.push({ title: text(node.lookup(PDFName.of('Title'))) ?? '', depth });
      walk(node.get(PDFName.of('First')), depth + 1, guard);
      const next = node.get(PDFName.of('Next'));
      node = next ? doc.context.lookup(next) : undefined;
    }
  };
  const root = doc.catalog.lookup(PDFName.of('Outlines'));
  if (root instanceof PDFDict) walk(root.get(PDFName.of('First')), 1, new Set());
  return out;
}

function destinationsOf(doc: PDFDocument): Set<string> {
  const names = new Set<string>();
  const visit = (node: PDFObject | undefined, guard: Set<PDFObject>) => {
    const dict = node ? doc.context.lookup(node) : undefined;
    if (!(dict instanceof PDFDict) || guard.has(dict)) return;
    guard.add(dict);
    const pairs = dict.lookup(PDFName.of('Names'));
    if (pairs instanceof PDFArray) for (let i = 0; i < pairs.size(); i += 2) { const key = text(pairs.get(i)); if (key !== null) names.add(key); }
    const kids = dict.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) visit(kids.get(i), guard);
  };
  const tree = doc.catalog.lookup(PDFName.of('Names'));
  if (tree instanceof PDFDict) visit(tree.get(PDFName.of('Dests')), new Set());
  return names;
}

function destinationValue(d: PDFObject | undefined): string | number | null {
  const named = text(d);
  if (named !== null) return named;
  if (d instanceof PDFArray && d.get(0) instanceof PDFNumber) return (d.get(0) as PDFNumber).asNumber();
  return null;
}

function linksOf(doc: PDFDocument): PdfLink[] {
  const links: PdfLink[] = [];
  doc.getPages().forEach((page, index) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFDict) || annot.lookup(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
      const action = annot.lookup(PDFName.of('A'));
      if (action instanceof PDFDict) {
        links.push({ page: index, action: text(action.lookup(PDFName.of('S'))) ?? '', destination: destinationValue(action.lookup(PDFName.of('D'))), file: text(action.lookup(PDFName.of('F'))) });
      } else {
        links.push({ page: index, action: 'Dest', destination: destinationValue(annot.lookup(PDFName.of('Dest'))), file: null });
      }
    }
  });
  return links;
}

export async function readPdfStructure(bytes: Uint8Array): Promise<PdfStructure> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const outline = outlineOf(doc);
  return { pages: doc.getPageCount(), outline, outlineDepth: outline.reduce((m, o) => Math.max(m, o.depth), 0), destinations: destinationsOf(doc), links: linksOf(doc) };
}

type LeafTargets = Pick<PdfStructure, 'pages' | 'destinations'>;
const XREF_ENTRY = 20;
const MAX_OBJECT_READ = 16 * 2 ** 20;

/** One indirect object of a file whose classic xref table (one subsection from 0) starts at `entriesAt`. */
async function objectReader(fh: FileHandle, size: number, entriesAt: number, count: number) {
  const context = PDFContext.create();
  const read = async (at: number, length: number) => {
    const buf = Buffer.alloc(Math.max(0, Math.min(length, size - at)));
    await fh.read(buf, 0, buf.length, at);
    return buf;
  };
  const parseAt = async (at: number, prefix: RegExp): Promise<PDFObject | undefined> => {
    for (let length = 64 * 1024; ; length *= 2) {
      const bytes = await read(at, length);
      const head = prefix.exec(bytes.toString('latin1', 0, 64));
      if (!head) return undefined;
      try { return PDFObjectParser.forBytes(bytes.subarray(head[0].length), context).parseObject(); } catch (error) {
        if (length >= MAX_OBJECT_READ || at + length >= size) throw error;
      }
    }
  };
  const lookup = async (o: PDFObject | undefined): Promise<PDFObject | undefined> => {
    if (!(o instanceof PDFRef)) return o;
    if (o.objectNumber <= 0 || o.objectNumber >= count) return undefined;
    const entry = /^(\d{10}) (\d{5}) n/.exec((await read(entriesAt + XREF_ENTRY * o.objectNumber, XREF_ENTRY)).toString('latin1'));
    return entry ? parseAt(Number(entry[1]), new RegExp(`^\\s*${o.objectNumber}\\s+${o.generationNumber}\\s+obj\\s*`)) : undefined;
  };
  return { read, parseAt, lookup };
}

/** The Dests name tree's keys, read node by node. */
async function namedDestinations(lookup: (o: PDFObject | undefined) => Promise<PDFObject | undefined>, root: PDFObject | undefined): Promise<Set<string>> {
  const names = new Set<string>();
  const pending = [root];
  for (let visited = 0; pending.length && visited < 100_000; visited++) {
    const node = await lookup(pending.pop());
    if (!(node instanceof PDFDict)) continue;
    const pairs = await lookup(node.get(PDFName.of('Names')));
    if (pairs instanceof PDFArray) for (let i = 0; i < pairs.size(); i += 2) { const key = text(pairs.get(i)); if (key !== null) names.add(key); }
    const kids = await lookup(node.get(PDFName.of('Kids')));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) pending.push(kids.get(i));
  }
  return names;
}

/**
 * A leaf's page count and named destinations, read through its classic xref
 * table (pdfkit writes one subsection from object 0) without loading the
 * document. Null when the file is laid out otherwise; the caller reads it whole.
 */
export async function readLeafTargets(file: string): Promise<LeafTargets | null> {
  const fh = await fs.open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    const probe = await objectReader(fh, size, 0, 0);
    const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec((await probe.read(Math.max(0, size - 1024), 1024)).toString('latin1'));
    if (!startxref) return null;
    const xrefAt = Number(startxref[1]);
    const header = /^xref\s+0\s+(\d+)[ \t]*\r?\n/.exec((await probe.read(xrefAt, 64)).toString('latin1'));
    if (!header) return null;
    const count = Number(header[1]);
    const entriesAt = xrefAt + header[0].length;
    const reader = await objectReader(fh, size, entriesAt, count);
    const trailer = await reader.parseAt(entriesAt + XREF_ENTRY * count, /^\s*trailer\s*/);
    if (!(trailer instanceof PDFDict) || trailer.get(PDFName.of('Prev')) || (trailer.get(PDFName.of('Size')) as PDFNumber | undefined)?.asNumber?.() !== count) return null;
    const catalog = await reader.lookup(trailer.get(PDFName.of('Root')));
    if (!(catalog instanceof PDFDict)) return null;
    const pagesRoot = await reader.lookup(catalog.get(PDFName.of('Pages')));
    const pages = pagesRoot instanceof PDFDict ? await reader.lookup(pagesRoot.get(PDFName.of('Count'))) : undefined;
    if (!(pages instanceof PDFNumber)) return null;
    const nameTree = await reader.lookup(catalog.get(PDFName.of('Names')));
    const destinations = nameTree instanceof PDFDict ? await namedDestinations(reader.lookup, nameTree.get(PDFName.of('Dests'))) : new Set<string>();
    return { pages: pages.asNumber(), destinations };
  } finally {
    await fh.close();
  }
}

async function targetStructure(file: string): Promise<LeafTargets> {
  return (await readLeafTargets(file).catch(() => null)) ?? readPdfStructure(await fs.readFile(file));
}

export interface StructureInput {
  body: { fileName: string; path: string; headings: ReadonlyArray<{ number: string; title: string }> };
  /** Every other leaf of the assembly, by the file name a link names. */
  leaves: ReadonlyArray<{ fileName: string; path: string }>;
  minimumDepth?: number;
}

function checkBookmarks(body: StructureInput['body'], structure: PdfStructure, minimumDepth: number, findings: StructureFinding[]): void {
  if (structure.outlineDepth < minimumDepth) {
    findings.push({ file: body.fileName, code: 'BOOKMARK_DEPTH', message: `The body's bookmarks reach ${structure.outlineDepth} level(s); ${minimumDepth} are required.` });
  }
  for (const h of body.headings) {
    const depth = h.number.split('.').length;
    if (depth > 4) continue;
    if (!structure.outline.some(o => o.depth === depth && o.title.startsWith(`${h.number} `))) {
      findings.push({ file: body.fileName, code: 'BOOKMARK_MISSING', message: `Heading ${h.number} has no bookmark at level ${depth}.` });
    }
  }
}

async function checkLink(link: PdfLink, body: StructureInput['body'], own: PdfStructure, targets: (file: string) => Promise<LeafTargets | null>): Promise<string | null> {
  const where = `page ${link.page + 1}`;
  if (link.action === 'GoTo' || link.action === 'Dest') {
    if (typeof link.destination === 'string' && own.destinations.has(link.destination)) return null;
    return `A link on ${where} names destination ${String(link.destination)}, which ${body.fileName} does not define.`;
  }
  if (link.action !== 'GoToR' || !link.file) return `A link on ${where} is a ${link.action || 'non-'} action, not a link within the assembly.`;
  const target = await targets(link.file);
  if (!target) return `A link on ${where} names ${link.file}, which is not a file of this assembly.`;
  if (typeof link.destination === 'string' && target.destinations.has(link.destination)) return null;
  if (typeof link.destination === 'number' && link.destination >= 0 && link.destination < target.pages) return null;
  return `A link on ${where} names ${link.file}#${String(link.destination)}, which that file does not define.`;
}

/** Check the body's bookmarks and every link in it against the files of the assembly. */
export async function checkCsrAssemblyStructure(input: StructureInput): Promise<StructureReport> {
  const findings: StructureFinding[] = [];
  const body = await readPdfStructure(await fs.readFile(input.body.path));
  checkBookmarks(input.body, body, input.minimumDepth ?? 4, findings);
  const cache = new Map<string, Promise<LeafTargets | null>>();
  const paths = new Map(input.leaves.map(l => [l.fileName, l.path]));
  const targets = (file: string) => {
    if (!cache.has(file)) {
      const path = paths.get(file);
      cache.set(file, path ? targetStructure(path) : Promise.resolve(null));
    }
    return cache.get(file)!;
  };
  for (const link of body.links) {
    const problem = await checkLink(link, input.body, body, targets);
    if (problem) findings.push({ file: input.body.fileName, code: 'BROKEN_LINK', message: problem });
  }
  return { ok: findings.length === 0, findings, bodyOutlineDepth: body.outlineDepth, linksChecked: body.links.length };
}
