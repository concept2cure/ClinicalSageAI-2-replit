/**
 * D18 (2026-10-30): §14.3.3, the patient narratives the narrative job landed,
 * filed as their own leaf of an assembled CSR.
 *
 * What it draws: the section exactly as landed (csr_section_outputs §14.3.3,
 * which workflow-source-import verified against its SHA-256), as the opening
 * and then one subject's narrative at a time, each read from the narrative
 * store a page at a time (csr-narrative-store.ts sqlNarrativeStore.page), so
 * at most a page of narrative text is held. Every subject has a bookmark
 * (under its treatment group) and a named destination, N-<subject>, which the
 * body links to; the leaf's own top destination is H14.3.3.
 *
 * What it checks, failing closed (a §14.3.3 that does not pass is not filed,
 * and the assembly lists it as a blocking gap):
 *   - the landed section is exactly the opening followed by the stored
 *     narratives' blocks (narrative-section.ts narrativeSectionBlock), in
 *     order, with nothing left over: a narrative edited or recomposed after
 *     landing, or a section from an earlier selection, does not match;
 *   - each stored narrative's text has its recorded SHA-256;
 *   - each narrative is drawn as stored: the fonts' one rule (toWinAnsiSafe)
 *     leaves it unchanged, so the receipt's drawn SHA-256 is the stored one;
 *   - read back from the written PDF, the leaf defines H14.3.3 and every
 *     subject's destination.
 * Narratives not landed are a gap, never an empty leaf.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NarrativePageCursor, SavedNarrative } from './csr-narrative-job.js';
import { narrativeSectionBlock } from './narrative-section.js';
import { CsrPdfWriter } from './csr-pdf-writer.js';
import { readLeafTargets } from './csr-pdf-structure.js';
import { toWinAnsiSafe } from '../ectd/leaf-pdf-renderer.js';
import { CSR_NARRATIVES_FILE, CSR_NARRATIVES_SECTION, e3Title, headingDestination, narrativeDestination } from './csr-assembly-plan.js';

/** The build's stored narratives, read a page at a time in landing order (sequence, subject). */
export interface CsrNarrativesSource {
  page(after: NarrativePageCursor | null, limit: number): Promise<SavedNarrative[]>;
  /** When §14.3.3 has not landed: the narrative job's state, for the gap's reason. */
  notLandedReason?: string;
  /**
   * When §14.3.3 has not landed: how many narratives (composed or refused) the
   * job has saved. Any means subjects were selected for one, so §14.3.3 applies
   * and cannot be declared not applicable.
   */
  savedNarratives?: number;
}

export interface NarrativeReceiptEntry { subjectId: string; storedSha256: string | null; drawnSha256: string }
export interface NarrativesVerification {
  verified: boolean;
  subjects: number;
  pages: number | null;
  /** SHA-256 of the landed §14.3.3 text the leaf was drawn from. */
  sectionSha256: string;
  findings: string[];
  /** One entry per narrative drawn: its recorded SHA-256 and the SHA-256 of the text handed to the PDF. */
  receipt: NarrativeReceiptEntry[];
}

export type NarrativesOutcome =
  | { state: 'filed'; path: string; fileName: string; title: string; sha256: string; bytes: number; pages: number; subjects: string[]; verification: NarrativesVerification }
  | { state: 'missing'; reason: string; verification?: NarrativesVerification };

/** Narratives read per page: the most narrative text held at once. */
export const NARRATIVES_PAGE = 50;
const BLOCK_START = '\n\nSubject ';
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function notLanded(source: CsrNarrativesSource | undefined): string {
  return `Section 14.3.3 has not been landed: no narrative run of this build has completed.${source?.notLandedReason ? ` ${source.notLandedReason}` : ''}`
    + ' Run the narratives to completion, or declare Section 14.3.3 not applicable with a reason.';
}

/** Paragraphs and lines as written; a blank line between paragraphs. */
function drawText(writer: CsrPdfWriter, text: string): void {
  for (const paragraph of text.split(/\n{2,}/)) {
    if (!paragraph.trim()) continue;
    writer.lines(paragraph);
    writer.lines('');
  }
}

interface Drawn { offset: number; subjects: string[]; receipt: NarrativeReceiptEntry[]; findings: string[] }

/** Draw each stored narrative the landed section holds at the current offset; skip a row it does not (an earlier selection's, or refused). */
async function drawNarratives(writer: CsrPdfWriter, content: string, source: CsrNarrativesSource, drawn: Drawn): Promise<void> {
  let after: NarrativePageCursor | null = null;
  let arm: string | null = null;
  for (;;) {
    const rows = await source.page(after, NARRATIVES_PAGE);
    if (!rows.length || drawn.offset >= content.length) return;
    const last = rows[rows.length - 1];
    after = { sequence: last.sequence, subjectId: last.subjectId };
    for (const row of rows) {
      if (row.status !== 'composed' || typeof row.content !== 'string') continue;
      const block = narrativeSectionBlock({ subjectId: row.subjectId, armName: row.qc.armName, categories: row.qc.categories, events: row.qc.events, text: row.content });
      if (!content.startsWith(block, drawn.offset)) continue;
      if (row.contentHash !== sha256(row.content)) drawn.findings.push(`The stored narrative of subject ${row.subjectId} does not match its recorded SHA-256.`);
      if (toWinAnsiSafe(block) !== block) drawn.findings.push(`The narrative of subject ${row.subjectId} holds characters the PDF fonts would change, so it cannot be filed as stored.`);
      if (row.qc.armName !== arm) { arm = row.qc.armName; writer.heading(arm, 2); }
      writer.heading(block.slice(2, block.indexOf('\n\n', 2)), 3, narrativeDestination(row.subjectId));
      drawText(writer, row.content);
      drawn.offset += block.length;
      drawn.subjects.push(row.subjectId);
      drawn.receipt.push({ subjectId: row.subjectId, storedSha256: row.contentHash, drawnSha256: sha256(toWinAnsiSafe(row.content)) });
    }
    await writer.drain();
  }
}

/** The subject whose landed text no stored narrative matches, read from the section at that point. */
function unmatchedAt(content: string, offset: number): string {
  const subject = new RegExp(`^${BLOCK_START.replace(/\n/g, '\\n')}(.+?) \\(`).exec(content.slice(offset, offset + 400))?.[1];
  return subject ? `the narrative of subject ${subject} in the section` : `the section's text from character ${offset}`;
}

/** Render §14.3.3 into `outDir`, or say why it is not filed. A leaf that fails any check is removed. */
export async function renderNarrativesLeaf(input: {
  section: { content: string } | undefined; source: CsrNarrativesSource | undefined; outDir: string; studyId: string; stamp: Date;
}): Promise<NarrativesOutcome> {
  if (!input.section) return { state: 'missing', reason: notLanded(input.source) };
  if (!input.source) {
    return { state: 'missing', reason: 'The build landed Section 14.3.3, but its stored narratives were not given to the assembly, so the section cannot be checked against them. Nothing was filed for it.' };
  }
  const content = input.section.content;
  const file = path.join(input.outDir, CSR_NARRATIVES_FILE);
  const title = `${CSR_NARRATIVES_SECTION} ${e3Title(CSR_NARRATIVES_SECTION)}`;
  const writer = new CsrPdfWriter({ path: file, title, runningHeader: `Study ${input.studyId} — Section 14.3.3 narratives`, stamp: input.stamp });
  writer.heading(title, 1, headingDestination(CSR_NARRATIVES_SECTION));
  const start = content.indexOf(BLOCK_START);
  const opening = start < 0 ? content : content.slice(0, start);
  drawText(writer, opening);
  const drawn: Drawn = { offset: opening.length, subjects: [], receipt: [], findings: [] };
  await drawNarratives(writer, content, input.source, drawn);
  const written = await writer.finish();
  if (drawn.offset !== content.length) {
    drawn.findings.unshift(`The landed Section 14.3.3 does not match the stored narratives: no stored narrative has the text of ${unmatchedAt(content, drawn.offset)} (edited or recomposed after it was landed).`);
  } else {
    const targets = await readLeafTargets(file);
    const defined = targets?.destinations ?? new Set<string>();
    for (const name of [headingDestination(CSR_NARRATIVES_SECTION), ...drawn.subjects.map(narrativeDestination)]) {
      if (!defined.has(name)) drawn.findings.push(`The written leaf does not define the destination ${name}.`);
    }
  }
  const verification: NarrativesVerification = { verified: drawn.findings.length === 0, subjects: drawn.subjects.length, pages: written.pages,
    sectionSha256: sha256(content), findings: drawn.findings, receipt: drawn.receipt };
  if (!verification.verified) {
    await fs.rm(file, { force: true });
    const shown = drawn.findings.slice(0, 5).join(' ') + (drawn.findings.length > 5 ? ` (${drawn.findings.length - 5} more.)` : '');
    return { state: 'missing', reason: `${shown} Nothing was filed for Section 14.3.3. Run the narratives again, then assemble.`, verification: { ...verification, pages: null } };
  }
  return { state: 'filed', path: file, fileName: CSR_NARRATIVES_FILE, title, sha256: written.sha256, bytes: written.bytes, pages: written.pages, subjects: drawn.subjects, verification };
}
