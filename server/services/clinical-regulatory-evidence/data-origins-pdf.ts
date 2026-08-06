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
 * WHY THIS ROUTES THROUGH THE CANONICAL CONVERTER
 * This file used to build the PDF directly with pdfkit. New PDF entry points
 * must instead go through server/services/pdf-converter.ts so every exported PDF
 * is deterministic and audit-bound — the SHA-256 of the bytes is a stable
 * artifact id (see the converter's header and
 * scripts/ci/check-pdf-runtime-canonicality.mjs). So the report is built ONCE as
 * a presentation-neutral model and rendered two ways:
 *
 *   • to DOCX via docxFactory.renderStyledDocx (the approved `docx` runtime),
 *     which the converter turns into a deterministic PDF via LibreOffice;
 *   • to HTML, passed as the converter's puppeteer fallback so the export still
 *     works in environments without LibreOffice — the resilience the old
 *     dependency-free pdfkit path had, preserved rather than dropped.
 *
 * Labels and colors are therefore defined once, here, and consumed by both
 * renderers.
 *
 * @module server/services/clinical-regulatory-evidence/data-origins-pdf
 */

import {
  renderStyledDocx,
  type StyledBlock,
  type StyledDocModel,
  type StyledRun,
} from '../docx/docxFactory';
import { convertDocxToPdf } from '../pdf-converter';

import type { SelectionOrigins, SpanLineageRow } from './span-lineage.service';

// Hex colors (no '#') shared by both renderers.
const INK = '111827';
const MUTED = '6b7280';
const WARN = 'b45309';
const OK = '047857';

// Sizes in half-points (docx convention); the HTML renderer converts to px.
const SIZE_TITLE = 40;
const SIZE_SECTION = 22;
const SIZE_COVERAGE = 24;
const SIZE_BODY = 20;
const SIZE_SMALL = 18;
const SIZE_TINY = 16;

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
 * Build the presentation-neutral document model — the single source of truth for
 * both the DOCX and the HTML fallback. Mirrors the original pdfkit layout:
 * title block, coverage up front, selected text, per-origin detail, and the
 * unattributed-ranges section printed as prominently as the sources.
 */
function buildModel(report: SelectionOrigins, meta: DataOriginsPdfMeta): StyledDocModel {
  const blocks: StyledBlock[] = [];
  const para = (runs: StyledRun[]) => blocks.push({ kind: 'paragraph', runs });
  const heading = (text: string) =>
    blocks.push({ kind: 'heading', runs: [{ text, bold: true, color: INK, size: SIZE_SECTION }] });

  // ── Title block ────────────────────────────────────────────────────────────
  blocks.push({ kind: 'heading', runs: [{ text: 'Data Origins', bold: true, color: INK, size: SIZE_TITLE }] });
  para([{ text: meta.documentTitle || `${report.documentTable} · ${report.documentId}`, color: MUTED, size: SIZE_BODY }]);
  para([
    {
      text: `Characters ${report.selection.charStart}–${report.selection.charEnd} · generated ${new Date(
        report.generatedAt,
      ).toUTCString()}`,
      color: MUTED,
      size: SIZE_BODY,
    },
  ]);
  if (meta.requestedBy) para([{ text: `Requested by ${meta.requestedBy}`, color: MUTED, size: SIZE_BODY }]);

  // Coverage stated up front — the first thing a reviewer should see.
  blocks.push({ kind: 'spacer' });
  const coverageColor = report.coveragePercent === 100 ? OK : WARN;
  para([
    {
      text: `${report.coveragePercent}% of the selected text has recorded origins`,
      bold: true,
      color: coverageColor,
      size: SIZE_COVERAGE,
    },
  ]);
  para([
    {
      text:
        `${report.counts.total} origin${report.counts.total === 1 ? '' : 's'} · ` +
        `${report.counts.fromSources} from Data Room sources · ` +
        `${report.counts.authorAsserted} author assertion${report.counts.authorAsserted === 1 ? '' : 's'}` +
        (report.counts.stale > 0 ? ` · ${report.counts.stale} against changed sources` : ''),
      color: MUTED,
      size: SIZE_SMALL,
    },
  ]);

  blocks.push({ kind: 'rule' });

  // ── The selected text ────────────────────────────────────────────────────
  if (report.selection.text) {
    heading('Selected text');
    para([{ text: report.selection.text, italic: true, color: INK, size: SIZE_BODY }]);
  }

  // ── Origins ────────────────────────────────────────────────────────────────
  heading('Origins');
  if (report.origins.length === 0) {
    para([{ text: 'No recorded origin for any part of this selection.', color: WARN, size: SIZE_BODY }]);
  }
  for (const row of report.origins) {
    para([{ text: originLabel(row), bold: true, color: INK, size: SIZE_BODY }]);

    const bits: string[] = [`characters ${row.charStart}–${row.charEnd}`, usageLabel(row.usage)];
    if (row.sourceLocator) bits.push(row.sourceLocator);
    if (row.assertedBy) bits.push(`by ${row.assertedBy}`);
    if (row.confidence !== null && row.confidence !== undefined) {
      bits.push(`confidence ${Math.round(row.confidence * 100)}%`);
    }
    para([{ text: bits.join('  ·  '), color: MUTED, size: SIZE_SMALL }]);

    const state = stateLabel(row.state);
    if (state && row.state !== 'current') {
      para([{ text: state.text, bold: true, color: state.color, size: SIZE_SMALL }]);
    }
    if (row.payloadSha256) {
      para([
        { text: `source content hash when cited: ${row.payloadSha256.slice(0, 32)}`, color: MUTED, size: SIZE_TINY },
      ]);
    }
    blocks.push({ kind: 'spacer' });
  }

  // ── What has no origin ───────────────────────────────────────────────────
  blocks.push({ kind: 'rule' });
  heading('Unattributed ranges');
  if (report.uncovered.length === 0) {
    para([{ text: 'None — every character of the selection has a recorded origin.', color: OK, size: SIZE_BODY }]);
  } else {
    para([
      {
        text:
          `${report.uncovered.length} range${report.uncovered.length === 1 ? '' : 's'} of the selection ` +
          'have no recorded origin:',
        color: WARN,
        size: SIZE_BODY,
      },
    ]);
    for (const gap of report.uncovered) {
      para([{ text: `• characters ${gap.charStart}–${gap.charEnd}`, color: MUTED, size: SIZE_SMALL }]);
    }
  }

  return { title: 'Data Origins', footerLabel: `Data Origins · ${report.documentId}`, blocks };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Render the model to a self-contained HTML string for the converter's fallback. */
function modelToHtml(model: StyledDocModel): string {
  const runsToHtml = (runs: StyledRun[] | undefined): string =>
    (runs ?? [])
      .map((r) => {
        const styles = [
          `color:#${r.color ?? INK}`,
          `font-size:${(r.size ?? SIZE_BODY) / 2}pt`,
          r.bold ? 'font-weight:700' : '',
          r.italic ? 'font-style:italic' : '',
        ]
          .filter(Boolean)
          .join(';');
        return `<span style="${styles}">${escapeHtml(r.text)}</span>`;
      })
      .join('');

  const body = model.blocks
    .map((block) => {
      switch (block.kind) {
        case 'rule':
          return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0" />';
        case 'spacer':
          return '<div style="height:8px"></div>';
        case 'heading':
          return `<div style="margin:14px 0 6px">${runsToHtml(block.runs)}</div>`;
        case 'paragraph':
        default:
          return `<p style="margin:0 0 5px;line-height:1.4">${runsToHtml(block.runs)}</p>`;
      }
    })
    .join('\n');

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8" />` +
    `<style>@page{size:letter;margin:54pt}body{font-family:Helvetica,Arial,sans-serif;color:#${INK}}</style>` +
    `<title>${escapeHtml(model.title)}</title></head><body>${body}</body></html>`
  );
}

/**
 * Render the report. Returns the finished PDF bytes.
 *
 * Deterministic apart from the generation timestamp, which the caller supplies
 * via the report itself — two renders of the same report differ only where the
 * report does. Determinism of the PDF envelope (metadata, id) is guaranteed by
 * convertDocxToPdf's makeDeterministic step.
 */
export async function renderDataOriginsPdf(
  report: SelectionOrigins,
  meta: DataOriginsPdfMeta = {},
): Promise<Buffer> {
  const model = buildModel(report, meta);
  const docx = await renderStyledDocx(model);
  const { pdf } = await convertDocxToPdf(docx, { fallbackHtml: modelToHtml(model) });
  return pdf;
}
