/**
 * Data Origins report → PDF.
 *
 * The printable form of "where did this text come from". A reader selects a
 * passage, asks for its origins, and needs to hand the answer to someone who
 * was not at the screen — a reviewer, an inspector, a colleague in another
 * timezone. That artefact has to stand on its own, so it restates the selected
 * text, every span backing it, and — deliberately — what it could NOT account
 * for.
 *
 * WHY THE GAPS ARE PRINTED AS PROMINENTLY AS THE SOURCES
 * A provenance report that lists only what it found reads as complete. The
 * unattributed ranges are the part a reviewer most needs to see, so they are a
 * section of the document rather than a footnote, and the coverage figure is on
 * the first page next to the title.
 *
 * pdfkit, matching the renderers already in server/services/authoring.
 *
 * @module server/services/clinical-regulatory-evidence/data-origins-pdf
 */

import PDFDocument from 'pdfkit';

import { makeDeterministic } from '../pdf-converter';
import type { SelectionOrigins, SpanLineageRow } from './span-lineage.service';

const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';
const WARN = '#b45309';
const OK = '#047857';

/** Human label for a provenance kind — no jargon in a document a reviewer reads. */
function originLabel(row: SpanLineageRow): string {
  if (row.provenanceKind === 'author_assertion') return 'Author assertion';
  return row.sourceTitle ? `Source: ${row.sourceTitle}` : `Source #${row.referenceId ?? '—'}`;
}

/** How the source was used, spelled out rather than left as a verb stem. */
function usageLabel(usage: string): string {
  switch (usage) {
    case 'quoted':
      return 'Quoted verbatim';
    case 'paraphrased':
      return 'Paraphrased';
    case 'summarized':
      return 'Summarised';
    case 'derived':
      return 'Derived from';
    case 'computed':
      return 'Computed from';
    case 'asserted':
      return 'Asserted by the author';
    default:
      return usage;
  }
}

function stateLabel(state?: string): { text: string; color: string } | null {
  switch (state) {
    case 'changed':
      return { text: 'SOURCE HAS CHANGED SINCE THIS WAS WRITTEN', color: WARN };
    case 'unverified':
      return { text: 'Source checksum unavailable', color: MUTED };
    case 'unresolved':
      return { text: 'Source no longer resolvable', color: WARN };
    case 'current':
      return { text: 'Current', color: OK };
    default:
      return null;
  }
}

export interface DataOriginsPdfMeta {
  documentTitle?: string | null;
  requestedBy?: string | null;
}

/**
 * Render the report. Returns the finished PDF bytes.
 *
 * DETERMINISM
 * The bytes go out through `makeDeterministic()` from the canonical converter
 * (server/services/pdf-converter.ts), which strips the fields pdfkit varies on
 * every run — CreationDate, ModDate, the Producer build string, the document
 * /ID. Without that, two exports of the SAME report differ, and the SHA-256 of
 * a provenance report that changes every time it is printed cannot be bound to
 * anything. A traceability artefact whose own hash is unstable is the exact
 * failure this module exists to argue against.
 *
 * This service generates directly rather than converting a DOCX, so it cannot
 * call convertDocxToPdf() — it borrows the determinism step alone, which is the
 * part of that contract that applies. Two renders of the same report now differ
 * only where the report itself does: the generation timestamp the caller
 * supplies on `report.generatedAt`.
 */
export function renderDataOriginsPdf(
  report: SelectionOrigins,
  meta: DataOriginsPdfMeta = {},
): Promise<Buffer> {
  // pdfkit ships no type definitions, so the constructor and the drawing API
  // are reached through `any` — the same pattern documentExportService and
  // cerGenerator already use for this dependency. Kept to one place here.
  const doc: any = new (PDFDocument as any)({ size: 'LETTER', margin: 54, bufferPages: true });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  /** Full-width hairline at the current cursor. */
  const rule = () => {
    doc.moveTo(doc.x, doc.y).lineTo(doc.x + W, doc.y).strokeColor(RULE).stroke();
  };

  // ── Title block ───────────────────────────────────────────────────────────
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('Data Origins');
  doc.moveDown(0.2);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(meta.documentTitle || `${report.documentTable} · ${report.documentId}`);
  doc.text(
    `Characters ${report.selection.charStart}–${report.selection.charEnd} · generated ${new Date(
      report.generatedAt,
    ).toUTCString()}`,
  );
  if (meta.requestedBy) doc.text(`Requested by ${meta.requestedBy}`);

  // Coverage stated up front — the first thing a reviewer should see.
  doc.moveDown(0.8);
  const coverageColor = report.coveragePercent === 100 ? OK : WARN;
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(coverageColor)
    .text(`${report.coveragePercent}% of the selected text has recorded origins`);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `${report.counts.total} origin${report.counts.total === 1 ? '' : 's'} · ` +
        `${report.counts.fromSources} from Data Room sources · ` +
        `${report.counts.authorAsserted} author assertion${report.counts.authorAsserted === 1 ? '' : 's'}` +
        (report.counts.stale > 0 ? ` · ${report.counts.stale} against changed sources` : ''),
    );

  doc.moveDown(0.6);
  rule();
  doc.moveDown(0.8);

  // ── The selected text ─────────────────────────────────────────────────────
  if (report.selection.text) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Selected text');
    doc.moveDown(0.3);
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor(INK)
      .text(report.selection.text, { width: W, align: 'left' });
    doc.moveDown(0.8);
  }

  // ── Origins ───────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Origins');
  doc.moveDown(0.4);

  if (report.origins.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(WARN)
      .text('No recorded origin for any part of this selection.');
    doc.moveDown(0.5);
  }

  for (const row of report.origins) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(originLabel(row));

    const bits: string[] = [
      `characters ${row.charStart}–${row.charEnd}`,
      usageLabel(row.usage),
    ];
    if (row.sourceLocator) bits.push(row.sourceLocator);
    if (row.assertedBy) bits.push(`by ${row.assertedBy}`);
    if (row.confidence !== null && row.confidence !== undefined) {
      bits.push(`confidence ${Math.round(row.confidence * 100)}%`);
    }
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(bits.join('  ·  '));

    const state = stateLabel(row.state);
    if (state && row.state !== 'current') {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(state.color).text(state.text);
    }
    if (row.payloadSha256) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(`source content hash when cited: ${row.payloadSha256.slice(0, 32)}`);
    }
    doc.moveDown(0.6);
  }

  // ── What has no origin ────────────────────────────────────────────────────
  // Printed as its own section: a report that lists only what it found reads as
  // complete, and this is the part a reviewer most needs.
  doc.moveDown(0.2);
  rule();
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Unattributed ranges');
  doc.moveDown(0.3);

  if (report.uncovered.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(OK)
      .text('None — every character of the selection has a recorded origin.');
  } else {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(WARN)
      .text(
        `${report.uncovered.length} range${report.uncovered.length === 1 ? '' : 's'} of the selection ` +
          'have no recorded origin:',
      );
    doc.moveDown(0.2);
    for (const gap of report.uncovered) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`• characters ${gap.charStart}–${gap.charEnd}`);
    }
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Data Origins · ${report.documentId} · page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 12,
        { width: W, align: 'center' },
      );
  }

  doc.end();
  return done.then(makeDeterministic);
}
