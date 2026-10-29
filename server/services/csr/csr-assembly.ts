/**
 * CSR slice 8 (2026-10-29, docs/design/CSR_END_TO_END_2026-10-29.md): assemble
 * an imported CSR into the eCTD leaves Submission Center files under Module
 * 5.3.5.x, each with its Study Tagging File role.
 *
 *   csr-body.pdf           the body: E3 order, generated contents to four
 *                          levels, abbreviations, cross-references linked
 *   csr-14-tables.pdf      §14: the engine tables, numbered 14.1.x/14.2.x/14.3.x
 *   csr-16-2-*.pdf         §16.2 listings, generated from the source, streamed
 *   csr-16-1-*.pdf, 16.3   documents the sponsor supplied, by exact digest
 *
 * The leaves are EctdLeaf records (submission-gateways/ectd-packager/types.ts)
 * with studyId and stfFileTag set, and the body's links between leaves are
 * returned as CrossReference records, so the regional packager
 * (packageEctdSubmission) places them in the study's folder, writes the study's
 * stf-<study-id>.xml and checks every cross-reference, unchanged.
 *
 * Fails closed and fabricates nothing:
 * - A document only the sponsor can supply (protocol, SAP, sample CRF,
 *   investigator list, signatures) is never composed; when absent it is listed
 *   as missing, and the assembly is 'incomplete'.
 * - A listing the source cannot produce is listed as missing with the reason.
 * - The body's bookmarks and links are read back from the PDF and checked
 *   (csr-pdf-structure.ts); each listing is checked back against its source
 *   subject by subject (csr-listing-verify.ts).
 *
 * PDF/A: the leaves are PDF 1.7. The platform's PDF/A converter is the
 * packager's finalizePdfA (pdfa-pipeline.ts, Ghostscript), applied to every
 * leaf at packaging where the binary is installed; ECTD_REQUIRE_PDFA=true
 * refuses a package with an unconverted leaf. This module does not convert.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import type { EctdLeaf } from '../submission-gateways/ectd-packager/types.js';
import type { CrossReference } from '../ectd/cross-reference-resolver.js';
import { generateStfFiles } from '../ectd/stf-generator.js';
import { stableStringify } from '../../../shared/canonical-json.js';
import type { CsrTableKey } from './cortex-authoring-context.js';
import {
  CSR_BODY_FILE, CSR_BODY_FILE_TAG, CSR_CTD_SECTIONS, CSR_LISTING_APPENDICES, CSR_SUPPLIED_APPENDICES, CSR_TABLES_FILE,
  appendixApplies, appendixFileName, appendixFileTag, assertKnownFileTags, compareDotted, e3Title, headingDestination,
  listingDestination, planTfls, tflHeadings, type CsrAppendixNumber, type CsrCtdSection, type CsrTable, type PlannedTfl,
} from './csr-assembly-plan.js';
import { CsrPdfWriter } from './csr-pdf-writer.js';
import { toWinAnsiSafe } from '../ectd/leaf-pdf-renderer.js';
import { planListings, type CsrListingSource, type ListingDefinition } from './csr-listings.js';
import { verifyListingReceipt, type ListingVerification } from './csr-listing-verify.js';
import { renderBody, type AppendixState } from './csr-assembly-body.js';
import { checkCsrAssemblyStructure, type StructureReport } from './csr-pdf-structure.js';
import type { UnresolvedReference } from './csr-cross-references.js';

export class CsrAssemblyError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'CsrAssemblyError'; }
}

export interface SuppliedAppendixDocument { path: string; sha256: string }

export interface CsrAssemblyInput {
  studyId: string;
  title: string;
  ctdSection?: CsrCtdSection;
  /** The saved sections, verified by workflow-source-import (code, title, content). */
  sections: ReadonlyArray<{ code: string; title: string; content: string }>;
  /** What the import already knows is missing (undrafted headings, placeholders, a partial job). */
  gaps?: readonly string[];
  /** The engine tables of the retained run (readSavedClinicalTables / readRetainedStudyForAssembly). */
  tables: Partial<Record<CsrTableKey, CsrTable>>;
  listingSource: CsrListingSource;
  supplied?: Partial<Record<CsrAppendixNumber, SuppliedAppendixDocument>>;
  /** An appendix declared not applicable to this study, with the reason (at least 8 characters). */
  notApplicable?: Partial<Record<CsrAppendixNumber, string>>;
  outDir: string;
  /** Content-derived timestamp for the PDFs, never the wall clock. */
  contentModifiedAt: Date;
}

export interface AssembledLeaf extends EctdLeaf {
  appendix: string;
  stfFileTag: string;
  studyId: string;
  origin: 'generated' | 'supplied';
  sha256: string;
  bytes: number;
  pages: number | null;
}
export interface MissingAppendix { number: string; title: string; fileTag: string; blocking: boolean; reason: string }
export interface AssembledListing { number: string; rows: number; pages: number; receiptPath: string; receiptSha256: string; verification: ListingVerification }

export interface CsrAssemblyResult {
  status: 'complete' | 'incomplete';
  leaves: AssembledLeaf[];
  crossReferences: CrossReference[];
  missing: MissingAppendix[];
  notApplicable: Array<{ number: string; reason: string }>;
  bodyGaps: string[];
  unresolvedReferences: UnresolvedReference[];
  structure: StructureReport;
  listings: AssembledListing[];
  abbreviations: { total: number; undefinedAtFirstUse: string[] };
  stfWarnings: string[];
  pdfa: string;
}

const PDFA_STATEMENT = 'Leaves are PDF 1.7. PDF/A conversion is the packager’s finalizePdfA (Ghostscript) at packaging, where installed; ECTD_REQUIRE_PDFA=true refuses an unconverted leaf.';
const ALL_APPENDICES = [...Object.keys(CSR_SUPPLIED_APPENDICES), ...Object.keys(CSR_LISTING_APPENDICES)].sort(compareDotted) as CsrAppendixNumber[];

function validate(input: CsrAssemblyInput): CsrCtdSection {
  const ctd = input.ctdSection ?? '5.3.5.1';
  if (!CSR_CTD_SECTIONS.includes(ctd)) throw new CsrAssemblyError('CSR_ASSEMBLY_SECTION_INVALID', 'A CSR is filed under 5.3.5.1–5.3.5.4.');
  if (!input.studyId.trim() || input.studyId !== input.listingSource.study.studyId) throw new CsrAssemblyError('CSR_ASSEMBLY_STUDY_MISMATCH', 'The CSR job and the retained source name different studies.');
  if (!input.sections.length) throw new CsrAssemblyError('CSR_ASSEMBLY_NO_SECTIONS', 'The CSR has no saved section to assemble.');
  for (const [number, reason] of Object.entries(input.notApplicable ?? {})) {
    if (typeof reason !== 'string' || reason.trim().length < 8) throw new CsrAssemblyError('CSR_ASSEMBLY_REASON_REQUIRED', `Say why appendix ${number} does not apply (at least 8 characters).`);
    if (input.supplied?.[number as CsrAppendixNumber]) throw new CsrAssemblyError('CSR_ASSEMBLY_APPENDIX_AMBIGUOUS', `Appendix ${number} is both supplied and declared not applicable.`);
  }
  assertKnownFileTags();
  return ctd;
}

async function sha256Of(file: string): Promise<{ sha256: string; bytes: number; head: string }> {
  const hash = createHash('sha256');
  let bytes = 0, head = '';
  for await (const chunk of createReadStream(file)) {
    if (bytes === 0) head = (chunk as Buffer).subarray(0, 5).toString('latin1');
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), bytes, head };
}

interface Built { ctd: CsrCtdSection; leaves: AssembledLeaf[]; appendices: Map<string, AppendixState>; missing: MissingAppendix[]; notApplicable: Array<{ number: string; reason: string }> }

function leaf(input: CsrAssemblyInput, ctd: CsrCtdSection, spec: { appendix: string; fileName: string; title: string; fileTag: string; origin: AssembledLeaf['origin']; sourcePath: string; sha256: string; bytes: number; pages: number | null }): AssembledLeaf {
  return { ctdSection: ctd, operation: 'new', studyId: input.studyId, stfFileTag: spec.fileTag, ...spec };
}

async function supplyDocument(input: CsrAssemblyInput, built: Built, number: CsrAppendixNumber, doc: SuppliedAppendixDocument): Promise<void> {
  const read = await sha256Of(doc.path).catch(() => null);
  if (!read) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_UNREADABLE', `The document supplied for appendix ${number} could not be read.`);
  if (read.head !== '%PDF-') throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_NOT_PDF', `The document supplied for appendix ${number} is not a PDF.`);
  if (read.sha256 !== doc.sha256) throw new CsrAssemblyError('CSR_ASSEMBLY_SUPPLIED_DIGEST', `The document supplied for appendix ${number} is not the version named (SHA-256 differs).`);
  const fileName = appendixFileName(number);
  built.leaves.push(leaf(input, built.ctd, { appendix: number, fileName, title: `${number} ${e3Title(number)}`, fileTag: appendixFileTag(number), origin: 'supplied', sourcePath: doc.path, sha256: read.sha256, bytes: read.bytes, pages: null }));
  built.appendices.set(number, { state: 'filed', fileName, detail: 'Supplied by the sponsor.' });
}

/** Supplied documents, declared exclusions and what is missing; listings the source produces are not in `generated`. */
async function settleAppendices(input: CsrAssemblyInput, built: Built, generated: ReadonlySet<string>, unavailable: ReadonlyMap<string, string>): Promise<void> {
  for (const number of ALL_APPENDICES) {
    const doc = input.supplied?.[number];
    if (generated.has(number)) {
      if (doc) throw new CsrAssemblyError('CSR_ASSEMBLY_APPENDIX_AMBIGUOUS', `Listing ${number} is generated from the source; a supplied copy would be a second version.`);
      if (input.notApplicable?.[number]) throw new CsrAssemblyError('CSR_ASSEMBLY_APPENDIX_AMBIGUOUS', `Listing ${number} is generated from the source, so it cannot be declared not applicable.`);
      continue;
    }
    if (doc) { await supplyDocument(input, built, number, doc); continue; }
    const declared = input.notApplicable?.[number];
    if (declared) { built.notApplicable.push({ number, reason: declared.trim() }); built.appendices.set(number, { state: 'not-applicable', reason: declared.trim() }); continue; }
    const applies = appendixApplies(number);
    const reason = unavailable.get(number) ?? 'Only the sponsor can supply this document; the platform does not compose it.';
    const blocking = applies !== 'when-applicable';
    built.missing.push({ number, title: e3Title(number), fileTag: appendixFileTag(number), blocking, reason });
    built.appendices.set(number, { state: 'missing', reason: blocking ? `${reason} It must be supplied, or declared not applicable with a reason, before filing.` : `${reason} Include it if it applies.` });
  }
}

async function renderListing(input: CsrAssemblyInput, built: Built, def: ListingDefinition): Promise<AssembledListing> {
  const fileName = appendixFileName(def.number);
  const file = path.join(input.outDir, fileName);
  const receiptPath = path.join(input.outDir, 'receipts', `${def.number.replace(/\./g, '-')}.ndjson`);
  const title = `Listing ${def.number} ${e3Title(def.number)}`;
  const writer = new CsrPdfWriter({ path: file, title, runningHeader: `Study ${input.studyId} — ${title}`, stamp: input.contentModifiedAt, landscape: true });
  writer.heading(title, 1, listingDestination(def.number));
  for (const note of def.footnotes) writer.lines(note, { size: 8.5, font: 'Helvetica-Oblique' });
  const receipt = createWriteStream(receiptPath);
  const receiptHash = createHash('sha256');
  const rows = await writer.table({ headers: def.headers, widths: def.widths }, (function* () {
    for (const row of def.rows()) yield { cells: row.cells, bookmark: row.bookmark, subjectId: row.subjectId };
  })(), row => {
    // The receipt records the cells as the fonts draw them (toWinAnsiSafe), so a value the page cannot show fails the source check.
    const line = `${JSON.stringify({ subjectId: row.subjectId, cells: row.cells.map(toWinAnsiSafe) })}\n`;
    receiptHash.update(line);
    receipt.write(line);
  });
  if (!rows) writer.lines(def.emptyStatement);
  receipt.end();
  await once(receipt, 'close');
  const written = await writer.finish();
  built.leaves.push(leaf(input, built.ctd, { appendix: def.number, fileName, title, fileTag: appendixFileTag(def.number), origin: 'generated', sourcePath: file, sha256: written.sha256, bytes: written.bytes, pages: written.pages }));
  built.appendices.set(def.number, { state: 'filed', fileName, detail: `Generated from the source: ${rows} row(s), ${written.pages} page(s).` });
  const verification = await verifyListingReceipt(def.number, receiptPath, input.listingSource, def.headers);
  return { number: def.number, rows, pages: written.pages, receiptPath, receiptSha256: receiptHash.digest('hex'), verification };
}

async function renderTables(input: CsrAssemblyInput, built: Built, tfls: readonly PlannedTfl[]): Promise<void> {
  const file = path.join(input.outDir, CSR_TABLES_FILE);
  const title = `14 ${e3Title('14')}`;
  const writer = new CsrPdfWriter({ path: file, title, runningHeader: `Study ${input.studyId} — Section 14 tables`, stamp: input.contentModifiedAt, landscape: true });
  const heads = tflHeadings(tfls);
  for (const head of heads) {
    writer.heading(`${head.number} ${head.title}`, head.number.split('.').length, headingDestination(head.number));
    for (const t of tfls.filter(x => nearestHeading(x.number, heads) === head.number)) {
      writer.heading(t.caption, t.number.split('.').length, t.destination);
      await writer.table({ headers: t.table.headers, widths: t.table.headers.map(() => 1) }, t.table.rows.map(cells => ({ cells })));
      writer.lines(`Source: engine table "${t.key}" of the retained run; table SHA-256 ${createHash('sha256').update(stableStringify(t.table)).digest('hex')}.`, { size: 8, font: 'Helvetica-Oblique' });
      await writer.drain();
    }
  }
  const written = await writer.finish();
  built.leaves.push(leaf(input, built.ctd, { appendix: '14', fileName: CSR_TABLES_FILE, title, fileTag: CSR_BODY_FILE_TAG, origin: 'generated', sourcePath: file, sha256: written.sha256, bytes: written.bytes, pages: written.pages }));
}

function nearestHeading(number: string, heads: ReadonlyArray<{ number: string }>): string {
  const parts = number.split('.');
  for (let n = parts.length - 1; n >= 1; n--) {
    const candidate = parts.slice(0, n).join('.');
    if (heads.some(h => h.number === candidate)) return candidate;
  }
  return '14';
}

function leafTargets(tfls: readonly PlannedTfl[], built: Built): Map<string, { fileName: string; destination: string | null }> {
  const targets = new Map<string, { fileName: string; destination: string | null }>();
  for (const head of tflHeadings(tfls)) targets.set(head.number, { fileName: CSR_TABLES_FILE, destination: headingDestination(head.number) });
  for (const t of tfls) targets.set(t.number, { fileName: CSR_TABLES_FILE, destination: t.destination });
  for (const l of built.leaves) {
    if (l.appendix === '14') continue;
    targets.set(l.appendix, { fileName: l.fileName, destination: l.origin === 'generated' ? listingDestination(l.appendix) : null });
  }
  return targets;
}

function stfWarnings(input: CsrAssemblyInput, leaves: readonly AssembledLeaf[]): string[] {
  return generateStfFiles(leaves.map((l, i) => ({ studyId: l.studyId, fileTag: l.stfFileTag, ctdSection: l.ctdSection, href: l.fileName, title: l.title,
    operation: 'new' as const, indexLeafId: `csr-leaf-${i}`, indexRelPath: '../../../index.xml' })), [{ studyId: input.studyId, studyTitle: input.title }]).warnings;
}

function crossReferencesOf(body: AssembledLeaf, targets: ReadonlyMap<string, { fileName: string }>, used: ReadonlySet<string>): CrossReference[] {
  return [...new Set([...used].map(n => targets.get(n)?.fileName).filter((f): f is string => !!f))].sort()
    .map(fileName => ({ id: `${body.fileName}->${fileName}`, source: body.fileName, target: fileName, label: `CSR body link to ${fileName}` }));
}

/** Assemble the CSR's leaves into `outDir`. Listings first, then §14, then the body that links to both. */
export async function assembleCsr(input: CsrAssemblyInput): Promise<CsrAssemblyResult> {
  const built: Built = { ctd: validate(input), leaves: [], appendices: new Map(), missing: [], notApplicable: [] };
  await fs.mkdir(path.join(input.outDir, 'receipts'), { recursive: true });
  const plan = planListings(input.listingSource);
  await settleAppendices(input, built, new Set(plan.generated.map(d => d.number)), new Map(plan.unavailable.map(u => [u.number, u.reason])));
  const listings: AssembledListing[] = [];
  for (const def of plan.generated) listings.push(await renderListing(input, built, def));
  const tfls = planTfls(input.tables);
  if (tfls.length) await renderTables(input, built, tfls);
  const targets = leafTargets(tfls, built);
  const bodyPath = path.join(input.outDir, CSR_BODY_FILE);
  const sections = new Map(input.sections.map(s => [s.code, { title: s.title, content: s.content }]));
  const body = await renderBody({ studyId: input.studyId, title: input.title, sections, tfls, appendices: built.appendices, leafTargets: targets, stamp: input.contentModifiedAt }, bodyPath);
  const bodyLeaf = leaf(input, built.ctd, { appendix: 'body', fileName: CSR_BODY_FILE, title: `${input.title} — Clinical Study Report`, fileTag: CSR_BODY_FILE_TAG, origin: 'generated', sourcePath: bodyPath, sha256: body.written.sha256, bytes: body.written.bytes, pages: body.written.pages });
  const leaves = [bodyLeaf, ...built.leaves].sort((a, b) => (a.appendix === 'body' ? -1 : b.appendix === 'body' ? 1 : compareDotted(a.appendix, b.appendix)));
  const structure = await checkCsrAssemblyStructure({ body: { fileName: CSR_BODY_FILE, path: bodyPath, headings: body.headings }, leaves: built.leaves.map(l => ({ fileName: l.fileName, path: l.sourcePath })) });
  const usedTargets = new Set([...targets.keys()]);
  const bodyGaps = [...(input.gaps ?? []), ...(tfls.length ? [] : ['Section 14: the retained run holds no engine table; no Section 14 document is filed.'])];
  const status = built.missing.some(m => m.blocking) || bodyGaps.length || !structure.ok || body.unresolved.length || listings.some(l => !l.verification.ok) ? 'incomplete' : 'complete';
  return { status, leaves, crossReferences: crossReferencesOf(bodyLeaf, targets, usedTargets), missing: built.missing, notApplicable: built.notApplicable, bodyGaps,
    unresolvedReferences: body.unresolved, structure, listings, abbreviations: body.abbreviations, stfWarnings: stfWarnings(input, leaves), pdfa: PDFA_STATEMENT };
}
