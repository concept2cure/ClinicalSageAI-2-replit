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
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { GREY, Writer, iso, stampExportIdentity, stampFooters } from './writer';

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
  const pdf = await PDFDocument.create();
  stampExportIdentity(pdf, { title: `Report bundle: ${input.bundle.name}`, exportId: input.exportId, exportedAt: input.exportedAt });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, regular, bold);

  w.write(`Report bundle: ${input.bundle.name}`, { size: 16, bold: true, gap: 4 });
  w.write(`Bundle ${input.bundle.bundleId}`, { size: 9, color: GREY, gap: 8 });
  if (input.bundle.description) w.write(input.bundle.description, { size: 10, gap: 4 });
  w.write(`Bundled: ${iso(input.bundle.createdAt)}${input.bundle.createdAt ? ' (UTC)' : ''}`, { size: 10 });
  w.write(`Bundled by: ${input.bundledBy ?? 'not recorded'}`, { size: 10 });
  const final = input.items.filter((i) => i.currentStatus === 'final').length;
  w.write(`${final} of ${input.items.length} report(s) are final at export. Each report's own PDF carries its signature and seal.`, { size: 10, bold: final < input.items.length, gap: 8 });
  w.write(`Included reports (${input.items.length})`, { size: 11, bold: true, gap: 2 });
  for (const item of input.items) w.write(itemLine(item), { size: 9, indent: 8 });
  if (w.replaced > 0) {
    w.write(`${w.replaced} character(s) outside the PDF font's character set are shown as "?".`, { size: 8, color: GREY });
  }
  stampFooters(w, regular, (n, total) => `Bundle ${input.bundle.bundleId.slice(0, 8)} · Export ${input.exportId} · Exported ${input.exportedAt} (UTC) · Page ${n} of ${total}`);
  return { bytes: Buffer.from(await pdf.save()), pages: w.pages.length, replacedCharacters: w.replaced };
}
