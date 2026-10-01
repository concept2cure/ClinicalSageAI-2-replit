/**
 * A compliance report as one CSV file.
 *
 * It opens with a block of `# ` lines that say what the file is — the report,
 * the organisation, the period, when it was generated, what it says about the
 * audit chain, each section's row count, completeness and notes, and what the
 * platform does not record — then a blank line (review round 1, DP-52: a CSV
 * without them was a table nobody could place). Each of those lines is ONE
 * quoted cell: their text contains commas, and a cell after a comma that
 * began with `=` would be a formula.
 *
 * Then, for each section, a `# <title>` line, the header row, the rows and a
 * blank line. Only the section's declared columns are written, in their
 * declared order. Every cell goes through the signed audit export's own
 * `sanitizeCsvValue`, so a cell a spreadsheet would run as a formula is
 * neutralised the same way in every file this product hands an inspector.
 *
 * @module server/services/audit/compliance-reports/csv
 */
import { sanitizeCsvValue } from '../signedAuditExport';
import type { ChainSummary, ReportData, ReportSection } from './types';

/** A cell's text: a date as its UTC instant, an object as JSON, nothing as empty. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** One `# ` line, as a single quoted cell, on one line. */
function commentLine(text: string): string {
  return sanitizeCsvValue(`# ${text.replace(/[\r\n]+/g, ' ')}`);
}

function chainText(chain: ChainSummary): string {
  const reason = chain.reason ? ` ${chain.reason}` : '';
  if (chain.ok === true) {
    const counted = chain.checks ? ` (${chain.checks.intact} of ${chain.checks.total} checks intact)` : '';
    return `verified${counted}.${reason}`;
  }
  if (chain.ok === false) return `broken.${reason}`;
  return `${chain.scope === 'not-checked' ? 'not checked' : 'not verified'}.${reason}`;
}

function leadingBlock(data: ReportData): string[] {
  const p = data.period;
  const lines = [
    data.report.title,
    `Report: ${data.report.id}, version ${data.report.version}`,
    `Organisation: ${data.organizationId}`,
    `Period: ${p.kind === 'as-of' || !p.from ? `as of ${p.to}` : `${p.from} to ${p.to}`}`,
    `Generated at: ${data.generatedAt}`,
    `Audit chain: ${chainText(data.chain)}`,
  ];
  for (const s of data.sections) {
    const rows = `${s.rowCount} ${s.rowCount === 1 ? 'row' : 'rows'}`;
    lines.push(`Section ${s.title}: ${rows}, ${s.truncated ? 'truncated at the row limit' : 'complete'}`);
    for (const note of s.notes ?? []) lines.push(`Section ${s.title} note: ${note}`);
  }
  for (const item of data.notRecorded) lines.push(`Not recorded: ${item}`);
  return [...lines.map(commentLine), ''];
}

function sectionBlock(section: ReportSection): string[] {
  const header = section.columns.map((c) => sanitizeCsvValue(c.label)).join(',');
  const rows = section.rows.map((row) => section.columns.map((c) => sanitizeCsvValue(cellText(row[c.key]))).join(','));
  return [`# ${section.title}`, header, ...rows, ''];
}

export function formatReportCsv(data: ReportData): string {
  return [...leadingBlock(data), ...data.sections.flatMap(sectionBlock)].join('\n');
}
