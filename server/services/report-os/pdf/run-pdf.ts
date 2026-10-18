/**
 * The governed PDF of one report run (reporting review 2026-10-01, Part 11
 * lens: "PDF exports are not faithful, marked copies" and "the sealed/final
 * state is not manifested anywhere a reader can see it").
 *
 * The export was a one-page cover sheet: five lines, the providers and up to
 * twenty blockers, cut off without a word when the page ran out, every
 * character outside ASCII turned into a space, a missing time printed as the
 * moment of export, nothing to say a partial report was not final, and no
 * seal, signer or export identity. 21 CFR 11.10(b) asks for accurate and
 * complete copies in human-readable form. This prints:
 *
 *   - the report body: every section and block of the rendered report (for a
 *     final run, the sealed document itself), wrapped and paginated, never cut;
 *   - for a final run, the signature manifestation (11.50: who, when, meaning)
 *     with the reason, the prior status, the seal hash and the verification
 *     verdict; for any other run, "NOT FINAL" across every page;
 *   - on every page, the run, the export id and the export time in UTC, and
 *     "page n of N".
 *
 * PDFKit embeds Noto font subsets, preserving multilingual content. A glyph
 * unavailable on this deployment refuses the export. Supported recorded charts
 * are drawn as vectors with their data; missing series never create sample data.
 * A missing time reads "not recorded".
 *
 * @module server/services/report-os/pdf/run-pdf
 */
import { GREY, Writer, iso } from './writer';
import { prepareReportPdfBranding } from './company-branding';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
import type { RenderedReport, ReportBlock } from '../render/types';
import type { RunSealView } from '../sealing/run-seal';

export interface RunPdfInput {
  run: {
    id: number;
    runUuid: string | null;
    reportTypeId: string;
    scopeType: string;
    scopeId: string;
    status: string;
    confidence: number | null;
    createdAt: Date | string | null;
  };
  typeLabel: string;
  /** The report body: the sealed document for a final run, the render otherwise. */
  report: RenderedReport;
  /** The seal read back (GET /runs/:id/seal's view), for a final run. */
  seal: RunSealView | null;
  /** The printed name of whoever ran the report, when known. */
  runBy: string | null;
  exportId: string;
  exportedAt: string;
  /** Optional export presentation, kept outside the retained/sealed report body. */
  companyBranding?: CompanyDocumentProfile | null;
}

/** The admitted retained document and its run facts, independent of export identity. */
export type RunPdfContent = Omit<RunPdfInput, 'exportId' | 'exportedAt' | 'companyBranding'>;

type AnyBlock = Record<string, any>;
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const cell = (c: unknown) => (c == null ? '' : String(c));

/** Each block kind, as text lines. A chart is named; a kind with no printed form says so. */
const BLOCK_TEXT: Record<string, (b: AnyBlock) => string[]> = {
  summary: (b) => [String(b.text ?? '')],
  narrative: (b) => [String(b.text ?? ''), b.disclosure ? `(${b.disclosure})` : ''],
  metric: (b) => [`${b.label}: ${b.value ?? 'not available'}${b.unit && b.value != null ? ` ${b.unit}` : ''}`],
  table: (b) => [list(b.columns).join(' | '), ...list(b.rows).map((r) => list(r).map(cell).join(' | '))],
  'blocker-list': (b) => list(b.items).map((i) => `- ${String(i)}`),
  'gap-list': (b) => list(b.items).map((i) => `- ${i.title}${i.severity ? ` (${i.severity})` : ''}${i.message ? `: ${i.message}` : ''}`),
  disclosure: (b) => [
    `Disclosure: ${b.method ?? 'method not stated'}; ${b.validated ? 'validated' : 'not validated'}${b.confidence != null ? `; confidence ${b.confidence}` : ''}. ${b.note ?? ''}`,
  ],

};

/** One block of the rendered report, as text lines. */
function blockLines(block: ReportBlock): string[] {
  const render = BLOCK_TEXT[block.kind];
  return render
    ? render(block as AnyBlock).filter((l) => l !== '')
    : [`[Unsupported block ${String(block.kind)}; recorded content: ${JSON.stringify(block)}]`];
}

/** The signature manifestation line (11.50): who, as what, when. */
function signatureLine(s: RunSealView): string {
  const sig = s.signature;
  const who = sig?.signerName || 'not recorded';
  const meaning = sig?.meaning || 'not recorded';
  // A chain's finalization time cannot fill in a missing signature time.
  return `Final. Signed by ${who} as ${meaning}, ${iso(sig?.signedAt)} (UTC).`;
}

/** The signature and seal of a final run, or why there is none. */
function sealLines(input: RunPdfContent): Array<{ text: string; bold?: boolean }> {
  if (input.run.status !== 'final') return [];
  const s = input.seal;
  if (!s) return [{ text: 'Final. The seal could not be read for this export.', bold: true }];
  const lines: Array<{ text: string; bold?: boolean }> = [{ text: signatureLine(s), bold: true }];
  if (s.finalization?.reason) lines.push({ text: `Reason: ${s.finalization.reason}` });
  if (s.finalization?.priorStatus) lines.push({ text: `Status before finalizing: ${s.finalization.priorStatus}` });
  if (s.seal?.contentHash) lines.push({ text: `Seal: ${s.seal.algorithm ?? 'sha256'} ${s.seal.contentHash}, sealed ${iso(s.seal.sealedAt)}` });
  lines.push({ text: `Seal verification at export: ${s.verification.verdict}.`, bold: s.verification.verdict !== 'intact' });
  for (const c of s.verification.checks.filter((x) => !x.ok)) lines.push({ text: `- ${c.detail}` });
  return lines;
}

function writeHeader(w: Writer, input: RunPdfContent) {
  w.write(input.typeLabel || input.run.reportTypeId, { size: 16, bold: true, gap: 4 });
  w.write(`Run #${input.run.id}${input.run.runUuid ? ` (${input.run.runUuid})` : ''}`, { size: 9, color: GREY, gap: 8 });
  const facts = [
    `Report type: ${input.run.reportTypeId}`,
    // The scope by name when the run stored one (QA 2026-10-08, j8: "Scope: project 1").
    `Scope: ${input.report.scopeLabel ?? `${input.run.scopeType} ${input.run.scopeId}`}`,
    ...(input.report.computedScope ? [`Data scope: ${input.report.computedScope}`] : []),
    `Status: ${input.run.status}`,
    // No engine behind the generic run measures a confidence (orchestrator.ts).
    `Confidence: ${input.run.confidence ?? 'not computed'}`,
    `Computed: ${iso(input.run.createdAt)} (UTC)`,
    `Run by: ${input.runBy ?? 'not recorded'}`,
  ];
  for (const f of facts) w.write(f, { size: 10 });
  w.write('', { size: 6 });
  for (const l of sealLines(input)) w.write(l.text, { size: 10, bold: l.bold });
  w.write('', { size: 8 });
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function writeChartExtras(w: Writer, spec: Record<string, unknown>, allowed: string[], rowExtras = false) {
  if (rowExtras || Object.keys(spec).some((key) => !allowed.includes(key))) {
    w.write(`Additional recorded chart data: ${JSON.stringify(spec)}`, { size: 8, indent: 8 });
  }
}

function writeReadinessRing(w: Writer, s: Record<string, unknown>, label: string): boolean {
  if (!finite(s.value) || s.value < 0 || s.value > 100) return false;
  w.write(`${label}: ${s.value} of 100`, { size: 10, bold: true, indent: 8 });
  const y = w.reserve(86);
  const p = w.pdf;
  const cx = w.marginLeft + 48, cy = y + 40, radius = 30;
  p.save().lineWidth(8).strokeColor('#e1e5e9').circle(cx, cy, radius).stroke();
  if (s.value > 0) {
    const steps = Math.max(1, Math.ceil(s.value));
    for (let i = 0; i <= steps; i += 1) {
      const angle = -Math.PI / 2 + 2 * Math.PI * (s.value / 100) * i / steps;
      const x = cx + radius * Math.cos(angle), yy = cy + radius * Math.sin(angle);
      if (i === 0) p.moveTo(x, yy); else p.lineTo(x, yy);
    }
    p.strokeColor('#216e58').stroke();
  }
  p.restore();
  w.drawText(String(s.value), cx - 16, cy - 8, { size: 15, bold: true });
  writeChartExtras(w, s, ['value', 'label']);
  return true;
}

function writeBars(w: Writer, s: Record<string, unknown>, label: string): boolean {
  const rows = Array.isArray(s.data) ? s.data as Array<{ label?: unknown; value?: unknown }> : [];
  if (!rows.length || !rows.every((r) => typeof r.label === 'string' && finite(r.value) && r.value >= 0)) return false;
  // The recorded label/value contract used by the canvas.
  w.write(label, { size: 10, bold: true, indent: 8 });
  const max = Math.max(1, ...rows.map((r) => r.value as number));
  const chartWidth = Math.min(350, w.contentWidth - 16);
  for (const row of rows) {
    w.write(`${row.label}: ${row.value}`, { size: 9, indent: 8 });
    const y = w.reserve(13);
    w.pdf.save().fillColor('#edf0f2').rect(w.marginLeft + 8, y, chartWidth, 6).fill();
    w.pdf.fillColor('#216e58').rect(w.marginLeft + 8, y, chartWidth * (row.value as number) / max, 6).fill().restore();
  }
  writeChartExtras(w, s, ['data', 'label'], rows.some((r) => Object.keys(r).some((key) => key !== 'label' && key !== 'value')));
  return true;
}

function writeTrend(w: Writer, s: Record<string, unknown>, label: string): boolean {
  const points = Array.isArray(s.points) ? s.points : [];
  if (!points.length || !points.every(finite)) return false;
  w.write(`${label}: ${points.join(', ')}`, { size: 9, indent: 8 });
  const y = w.reserve(100), low = Math.min(0, ...points), high = Math.max(1, ...points);
  const chartWidth = Math.min(350, w.contentWidth - 16);
  const coord = (v: number, i: number) => [w.marginLeft + 8 + i * chartWidth / Math.max(1, points.length - 1), y + 80 - (v - low) * 70 / (high - low)];
  const p = w.pdf;
  p.save().lineWidth(1.5).strokeColor('#216e58');
  points.forEach((v, i) => { const [x, yy] = coord(v, i); if (i === 0) p.moveTo(x, yy); else p.lineTo(x, yy); });
  p.stroke();
  points.forEach((v, i) => { const [x, yy] = coord(v, i); p.fillColor('#216e58').circle(x, yy, 2).fill(); });
  p.restore();
  writeChartExtras(w, s, ['points', 'label']);
  return true;
}

/** Draw only recorded values. No default trend or synthetic forecast series. */
function writeChart(w: Writer, block: Extract<ReportBlock, { kind: 'chart' }>) {
  const s = block.spec;
  const label = typeof s.label === 'string' ? s.label : block.chartType.replace(/_/g, ' ');
  const drawn = block.chartType === 'readiness_ring' ? writeReadinessRing(w, s, label)
    : block.chartType === 'bar' ? writeBars(w, s, label)
    : block.chartType === 'trend' ? writeTrend(w, s, label) : false;
  if (drawn) return;
  // Unsupported formats retain their complete specification visibly; no data
  // is manufactured, discarded or claimed to be absent without evidence.
  w.write(`${label}: ${Object.keys(s).length ? 'visualization is unavailable for this recorded chart specification' : 'chart data not recorded'}.`, { size: 9, indent: 8 });
  w.write(`Recorded chart specification: ${JSON.stringify(s)}`, { size: 8, indent: 8 });
}

function writeProvenance(w: Writer, block: ReportBlock) {
  if (!('provenance' in block) || !block.provenance?.length) return;
  for (const ref of block.provenance) {
    const source = `${ref.sourceTable}${ref.sourceField ? `.${ref.sourceField}` : ''}${ref.recordId != null ? ` #${ref.recordId}` : ''}`;
    w.write(`Source: ${source}${ref.transformation ? `; ${ref.transformation}` : ''}${ref.auditId ? `; audit ${ref.auditId}` : ''}${ref.confidence != null ? `; confidence ${ref.confidence}` : ''}`, { size: 8, color: GREY, indent: 8 });
  }
}

/** One canonical body writer for individual exports and admitted retained report packs.
 * The caller owns page boundaries, export stamps and saving the writer. */
export function writeRunPdfContent(w: Writer, input: RunPdfContent): void {
  writeHeader(w, input);
  for (const section of input.report.sections) {
    w.write(section.title, { size: 11, bold: true, gap: 2 });
    for (const block of section.blocks) {
      if (block.kind === 'chart') writeChart(w, block);
      else for (const line of blockLines(block)) w.write(line, { size: 9, indent: 8 });
      writeProvenance(w, block);
    }
    w.write('', { size: 6 });
  }
  if (input.report.provenance) {
    w.write('Recorded calculation evidence', { size: 11, bold: true, gap: 2 });
    w.write(JSON.stringify(input.report.provenance, null, 2), { size: 8, indent: 8 });
  }
}

/** Build the saved report's PDF; governance identity is manifested on every page. */
export async function buildRunPdf(input: RunPdfInput): Promise<{ bytes: Buffer; pages: number; replacedCharacters: number }> {
  const w = new Writer({ title: `${input.typeLabel}, run ${input.run.id}`, exportId: input.exportId, exportedAt: input.exportedAt }, await prepareReportPdfBranding(input.companyBranding));
  writeRunPdfContent(w, input);
  w.stampPages((n, total) => `Run #${input.run.id} · Export ${input.exportId} · Exported ${input.exportedAt} (UTC) · Page ${n} of ${total}`,
    input.run.status === 'final' ? undefined : `NOT FINAL (${input.run.status.toUpperCase()})`);
  return { bytes: await w.save(), pages: w.pages.length, replacedCharacters: 0 };
}
