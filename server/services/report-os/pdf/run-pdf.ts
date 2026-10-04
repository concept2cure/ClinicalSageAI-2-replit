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
 * Helvetica covers Latin-1 (accents, µ, °); a character outside it prints as
 * "?" and the PDF says how many there were. A chart is named, not drawn. A
 * missing time reads "not recorded".
 *
 * @module server/services/report-os/pdf/run-pdf
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib';
import { GREY, Writer, iso, stampExportIdentity, stampFooters } from './writer';
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
}

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
  'gap-list': (b) => list(b.items).map((i) => `- ${i.title}${i.severity ? ` (${i.severity})` : ''}`),
  disclosure: (b) => [
    `Disclosure: ${b.method ?? 'method not stated'}; ${b.validated ? 'validated' : 'not validated'}${b.confidence != null ? `; confidence ${b.confidence}` : ''}. ${b.note ?? ''}`,
  ],
  chart: (b) => [`[Chart: ${String(b.chartType ?? 'chart')}. Charts are not reproduced in the PDF; the canvas shows it.]`],
};

/** One block of the rendered report, as text lines. */
function blockLines(block: ReportBlock): string[] {
  const render = BLOCK_TEXT[block.kind];
  return render
    ? render(block as AnyBlock).filter((l) => l !== '')
    : [`[A ${String(block.kind)} block is not reproduced in the PDF.]`];
}

/** The signature manifestation line (11.50): who, as what, when. */
function signatureLine(s: RunSealView): string {
  const sig = s.signature;
  const who = sig?.signerName ? ` by ${sig.signerName}` : '';
  const meaning = sig?.meaning ? ` as ${sig.meaning}` : '';
  return `Final. Signed${who}${meaning}, ${iso(sig?.signedAt ?? s.finalizedAt)} (UTC).`;
}

/** The signature and seal of a final run, or why there is none. */
function sealLines(input: RunPdfInput): Array<{ text: string; bold?: boolean }> {
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

function writeHeader(w: Writer, input: RunPdfInput) {
  w.write(input.typeLabel || input.run.reportTypeId, { size: 16, bold: true, gap: 4 });
  w.write(`Run #${input.run.id}${input.run.runUuid ? ` (${input.run.runUuid})` : ''}`, { size: 9, color: GREY, gap: 8 });
  const facts = [
    `Report type: ${input.run.reportTypeId}`,
    `Scope: ${input.run.scopeType} ${input.run.scopeId}`,
    `Status: ${input.run.status}`,
    `Confidence: ${input.run.confidence ?? 'not recorded'}`,
    `Computed: ${iso(input.run.createdAt)} (UTC)`,
    `Run by: ${input.runBy ?? 'not recorded'}`,
  ];
  for (const f of facts) w.write(f, { size: 10 });
  w.write('', { size: 6 });
  for (const l of sealLines(input)) w.write(l.text, { size: 10, bold: l.bold });
  w.write('', { size: 8 });
}

/** Footer and, for a run that is not final, the NOT FINAL mark, on every page. */
function stampPages(w: Writer, input: RunPdfInput, font: PDFFont) {
  stampFooters(w, font, (n, total) => `Run #${input.run.id} · Export ${input.exportId} · Exported ${input.exportedAt} (UTC) · Page ${n} of ${total}`);
  if (input.run.status === 'final') return;
  for (const page of w.pages) {
    page.drawText(`NOT FINAL (${input.run.status.toUpperCase()})`, {
      x: 120, y: 260, size: 48, font, color: rgb(0.85, 0.85, 0.85), rotate: degrees(40), opacity: 0.5,
    });
  }
}

/** Build the run's PDF. */
export async function buildRunPdf(input: RunPdfInput): Promise<{ bytes: Buffer; pages: number; replacedCharacters: number }> {
  const pdf = await PDFDocument.create();
  stampExportIdentity(pdf, { title: `${input.typeLabel}, run ${input.run.id}`, exportId: input.exportId, exportedAt: input.exportedAt });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, regular, bold);

  writeHeader(w, input);
  for (const section of input.report.sections) {
    w.write(section.title, { size: 11, bold: true, gap: 2 });
    for (const block of section.blocks) {
      for (const line of blockLines(block)) w.write(line, { size: 9, indent: 8 });
    }
    w.write('', { size: 6 });
  }
  if (w.replaced > 0) {
    w.write(`${w.replaced} character(s) outside the PDF font's character set are shown as "?". The canvas shows them as written.`, { size: 8, color: GREY });
  }
  stampPages(w, input, regular);
  return { bytes: Buffer.from(await pdf.save()), pages: w.pages.length, replacedCharacters: w.replaced };
}
