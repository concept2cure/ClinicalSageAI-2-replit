/**
 * The governed PDF of a report bundle (reporting review 2026-10-01, Part 11
 * lens, the bundle half of "PDF exports are not faithful, marked copies").
 *
 * The bundle export printed one page: each report's status as it was when the
 * bundle was made, under "Generated:" (the bundle's creation time, not the
 * export's), and the list cut off without a word when the page ran out. This
 * prints every report, paginated, with its status NOW (read at export) beside
 * the status it was bundled at, says how many are final, labels the bundle's
 * own time as when it was bundled, and puts the bundle, the export id and time
 * and "page n of N" on every page. A report no longer readable says so.
 *
 * @module server/services/report-os/pdf/bundle-pdf
 */
import { GREY, ReportingPdfError, Writer, iso } from './writer';
import { writeRunPdfContent, type RunPdfContent } from './run-pdf';
import type { SealVerdict } from '../sealing/run-seal';
import { prepareReportPdfBranding } from './company-branding';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';

export interface BundlePdfItem {
  runId: number;
  label: string;
  scopeType: string;
  scopeId: string;
  /** The status recorded when the run was bundled. */
  bundledStatus: string;
  /** The run's status at export, or null when the run can no longer be read. */
  currentStatus: string | null;
  confidence: number | null;
}

export interface BundlePdfInput {
  bundle: { bundleId: string; name: string; description?: string | null; createdAt: string | null };
  bundledBy: string | null;
  items: BundlePdfItem[];
  exportId: string;
  exportedAt: string;
  companyBranding?: CompanyDocumentProfile | null;
}

/** One report's line: its status now, and what it was bundled at when that differs. */
function itemLine(i: BundlePdfItem): string {
  const now = i.currentStatus == null ? 'no longer found' : i.currentStatus;
  const then = i.currentStatus != null && i.currentStatus === i.bundledStatus ? '' : ` (bundled as ${i.bundledStatus})`;
  const confidence = i.confidence == null ? 'not recorded' : String(i.confidence);
  return `#${i.runId} ${i.label} - ${i.scopeType} ${i.scopeId} - status now: ${now}${then} - confidence ${confidence}`;
}

/** Build the bundle's PDF. */
export async function buildBundlePdf(input: BundlePdfInput): Promise<{ bytes: Buffer; pages: number; replacedCharacters: number }> {
  const w = new Writer({ title: `Report bundle: ${input.bundle.name}`, exportId: input.exportId, exportedAt: input.exportedAt }, await prepareReportPdfBranding(input.companyBranding));

  w.write(`Report bundle: ${input.bundle.name}`, { size: 16, bold: true, gap: 4 });
  w.write(`Bundle ${input.bundle.bundleId}`, { size: 9, color: GREY, gap: 8 });
  if (input.bundle.description) w.write(input.bundle.description, { size: 10, gap: 4 });
  w.write(`Bundled: ${iso(input.bundle.createdAt)}${input.bundle.createdAt ? ' (UTC)' : ''}`, { size: 10 });
  w.write(`Bundled by: ${input.bundledBy ?? 'not recorded'}`, { size: 10 });
  const final = input.items.filter((i) => i.currentStatus === 'final').length;
  w.write(`${final} of ${input.items.length} report(s) are final at export. Each report's own PDF carries its signature and seal.`, { size: 10, bold: final < input.items.length, gap: 8 });
  w.write(`Included reports (${input.items.length})`, { size: 11, bold: true, gap: 2 });
  for (const item of input.items) w.write(itemLine(item), { size: 9, indent: 8 });
  w.stampPages((n, total) => `Bundle ${input.bundle.bundleId.slice(0, 8)} · Export ${input.exportId} · Exported ${input.exportedAt} (UTC) · Page ${n} of ${total}`);
  return { bytes: await w.save(), pages: w.pages.length, replacedCharacters: w.replaced };
}

/** The route supplies every currently admitted constituent in recorded bundle order.
 * Rendering has no database, policy, provider or signature-creation capability. */
export interface ReportPackPdfItem {
  content: RunPdfContent;
  bundledStatus: string;
  sourceDocument: 'verified-sealed' | 'retained-run-render';
}

export interface ReportPackPdfInput extends Omit<BundlePdfInput, 'items'> {
  items: ReportPackPdfItem[];
}

/** Actual source identity and one-based written PDF page range for the audit event. */
export interface ReportPackPdfConstituent {
  runId: number;
  runUuid: string | null;
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  bundledStatus: string;
  statusAtRead: string;
  sourceDocument: ReportPackPdfItem['sourceDocument'];
  sealVerdict: SealVerdict | null;
  sealHash: string | null;
  firstPage: number;
  lastPage: number;
}

export interface ReportPackPdfResult {
  bytes: Buffer;
  pages: number;
  replacedCharacters: number;
  constituents: ReportPackPdfConstituent[];
}

function validPackIdentity({ run, report, seal }: RunPdfContent): boolean {
  return Number.isSafeInteger(run.id) && run.id > 0 && Boolean(run.status.trim()) &&
    report.reportTypeId === run.reportTypeId && report.scopeType === run.scopeType && report.scopeId === run.scopeId &&
    (!seal || seal.runId === run.id);
}

function validFinalPackSource({ content: { report, seal }, sourceDocument }: ReportPackPdfItem): boolean {
  if (!seal?.sealed) return false;
  return sourceDocument === 'verified-sealed'
    ? seal.verification.verdict === 'intact' && Boolean(seal.seal?.contentHash) && report.status === 'final'
    : seal.verification.verdict === 'not-verifiable';
}

function validPackSource(item: ReportPackPdfItem): boolean {
  const { content: { run, report, seal }, sourceDocument } = item;
  if (sourceDocument !== 'verified-sealed' && sourceDocument !== 'retained-run-render') return false;
  if (seal?.verification.verdict === 'mismatch') return false;
  if (run.status === 'final') return validFinalPackSource(item);
  return sourceDocument === 'retained-run-render' && !seal?.sealed && report.status !== 'final';
}

function assertReportPackContent(items: ReportPackPdfItem[]): void {
  const ids = new Set<number>();
  for (const item of items) {
    if (!validPackIdentity(item.content) || ids.has(item.content.run.id) || !validPackSource(item)) {
      throw new ReportingPdfError(422, 'REPORT_PACK_CONTENT_INVALID', 'The retained report packet is inconsistent or cannot be verified. Nothing was exported.');
    }
    ids.add(item.content.run.id);
  }
  if (ids.size === 0) throw new ReportingPdfError(422, 'REPORT_PACK_CONTENT_INVALID', 'A retained report packet must contain reports. Nothing was exported.');
}

function packWatermark(item: ReportPackPdfConstituent): string | undefined {
  if (item.statusAtRead !== 'final') return `NOT FINAL (${item.statusAtRead.toUpperCase()})`;
  return item.sourceDocument === 'verified-sealed' ? undefined : 'UNVERIFIED FINAL COPY';
}

function writePackCover(w: Writer, input: ReportPackPdfInput): void {
  w.write(`Retained report pack: ${input.bundle.name}`, { size: 16, bold: true, gap: 4 });
  w.write(`Bundle ${input.bundle.bundleId}`, { size: 9, color: GREY, gap: 8 });
  if (input.bundle.description) w.write(input.bundle.description, { size: 10, gap: 4 });
  w.write(`Bundled: ${iso(input.bundle.createdAt)}${input.bundle.createdAt ? ' (UTC)' : ''}`, { size: 10 });
  w.write(`Bundled by: ${input.bundledBy ?? 'not recorded'}`, { size: 10 });
  const final = input.items.filter(item => item.content.run.status === 'final').length;
  const unverified = input.items.filter(item => item.content.run.status === 'final' && item.sourceDocument !== 'verified-sealed').length;
  w.write(`${final} of ${input.items.length} report(s) are final in the retained records read for this export.`, { size: 10, bold: true });
  if (final < input.items.length) w.write('This packet contains non-final reports; each is marked on every report page.', { size: 10, bold: true });
  if (unverified) w.write(`${unverified} final report(s) cannot be verified against a stored sealed document. Their reconstructed copies are marked UNVERIFIED FINAL COPY.`, { size: 10, bold: true });
  w.write('This packet is a copy of retained reports and has no separate approval or signature. Report content was not recomputed for this export.', { size: 10, gap: 8 });
  w.write(`Included reports (${input.items.length}), in recorded bundle order`, { size: 11, bold: true, gap: 2 });
  for (const { content, bundledStatus } of input.items) {
    w.write(itemLine({ runId: content.run.id, label: content.typeLabel, scopeType: content.run.scopeType,
      scopeId: content.run.scopeId, bundledStatus, currentStatus: content.run.status, confidence: content.run.confidence }), { size: 9, indent: 8 });
  }
}

/** Full retained bodies using the individual run export's one canonical renderer.
 * The returned ranges include every overflow/signature/calculation-evidence page. */
export async function buildReportPackPdf(input: ReportPackPdfInput): Promise<ReportPackPdfResult> {
  assertReportPackContent(input.items);
  const w = new Writer({ title: `Retained report pack: ${input.bundle.name}`, exportId: input.exportId, exportedAt: input.exportedAt }, await prepareReportPdfBranding(input.companyBranding));
  writePackCover(w, input);
  const constituents: ReportPackPdfConstituent[] = [];
  for (const item of input.items) {
    const { content, bundledStatus, sourceDocument } = item;
    const firstPage = w.startPage();
    w.write(`Status at bundling: ${bundledStatus}`, { size: 9, color: GREY });
    w.write(sourceDocument === 'verified-sealed' ? 'Record source: verified sealed document.' : content.run.status === 'final'
      ? 'Record source: reconstructed from retained run data. The sealed content cannot be verified.'
      : 'Record source: retained run data; this report has not been finalized.', { size: 9, color: GREY, gap: 4 });
    writeRunPdfContent(w, content);
    constituents.push({ runId: content.run.id, runUuid: content.run.runUuid, reportTypeId: content.run.reportTypeId,
      scopeType: content.run.scopeType, scopeId: content.run.scopeId, bundledStatus, statusAtRead: content.run.status,
      sourceDocument, sealVerdict: content.seal?.sealed ? content.seal.verification.verdict : null,
      sealHash: content.seal?.seal?.contentHash ?? null, firstPage, lastPage: w.pages.length });
  }
  const pageSources = new Map<number, ReportPackPdfConstituent>();
  for (const constituent of constituents) {
    for (let page = constituent.firstPage; page <= constituent.lastPage; page += 1) pageSources.set(page, constituent);
  }
  w.stampPages((page, total) => {
    const item = pageSources.get(page);
    const source = item ? `Run #${item.runId} · ${item.scopeType} ${item.scopeId}` : 'Index';
    return [`Pack ${input.bundle.bundleId.slice(0, 8)} · ${source}`,
      `Export ${input.exportId} · Exported ${input.exportedAt} (UTC) · Page ${page} of ${total}`];
  }, page => {
    const item = pageSources.get(page);
    return item ? packWatermark(item) : undefined;
  });
  return { bytes: await w.save(), pages: w.pages.length, replacedCharacters: w.replaced, constituents };
}
