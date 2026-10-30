/**
 * D18 (2026-10-30): §14.3.3, the patient narratives the narrative job landed,
 * filed as their own leaf of an assembled CSR.
 *
 * What it draws: the section exactly as landed (csr_section_outputs §14.3.3;
 * since 2026-10-30 read from the database a slice at a time,
 * csr-narrative-landed.ts sqlLandedNarratives, never as one string), as the opening
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
 * The match itself is csr-narrative-landed.ts walkLandedNarratives, the same
 * one the Authoring import's reference is made through.
 * Narratives not landed are a gap, never an empty leaf.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SavedNarrative } from './csr-narrative-job.js';
import { CsrPdfWriter } from './csr-pdf-writer.js';
import { readLeafTargets } from './csr-pdf-structure.js';
import { toWinAnsiSafe } from '../ectd/leaf-pdf-renderer.js';
import { CSR_NARRATIVES_FILE, CSR_NARRATIVES_SECTION, e3Title, headingDestination, narrativeDestination } from './csr-assembly-plan.js';
import { walkLandedNarratives, type LandedNarratives, type NarrativePages } from './csr-narrative-landed.js';

export { NARRATIVES_PAGE } from './csr-narrative-landed.js';

/** The build's stored narratives, read a page at a time in landing order (sequence, subject). */
export interface CsrNarrativesSource extends NarrativePages {
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

/** Draw one matched narrative under its treatment group's bookmark, with its subject's destination. */
function drawer(writer: CsrPdfWriter, receipt: NarrativeReceiptEntry[], findings: string[]) {
  let arm: string | null = null;
  return ({ row, block }: { row: SavedNarrative & { content: string }; block: string }) => {
    if (toWinAnsiSafe(block) !== block) findings.push(`The narrative of subject ${row.subjectId} holds characters the PDF fonts would change, so it cannot be filed as stored.`);
    if (row.qc.armName !== arm) { arm = row.qc.armName; writer.heading(arm, 2); }
    writer.heading(block.slice(2, block.indexOf('\n\n', 2)), 3, narrativeDestination(row.subjectId));
    drawText(writer, row.content);
    receipt.push({ subjectId: row.subjectId, storedSha256: row.contentHash, drawnSha256: sha256(toWinAnsiSafe(row.content)) });
  };
}

/**
 * Render §14.3.3 into `outDir`, or say why it is not filed. A leaf that fails any check is removed.
 * `section` is the landed text: in memory (inlineLandedNarratives) or read from
 * the database a slice at a time (csr-narrative-landed.ts sqlLandedNarratives).
 */
export async function renderNarrativesLeaf(input: {
  section: LandedNarratives | undefined; source: CsrNarrativesSource | undefined; outDir: string; studyId: string; stamp: Date;
}): Promise<NarrativesOutcome> {
  if (!input.section) return { state: 'missing', reason: notLanded(input.source) };
  if (!input.source) {
    return { state: 'missing', reason: 'The build landed Section 14.3.3, but its stored narratives were not given to the assembly, so the section cannot be checked against them. Nothing was filed for it.' };
  }
  const landed = input.section;
  const file = path.join(input.outDir, CSR_NARRATIVES_FILE);
  const title = `${CSR_NARRATIVES_SECTION} ${e3Title(CSR_NARRATIVES_SECTION)}`;
  const writer = new CsrPdfWriter({ path: file, title, runningHeader: `Study ${input.studyId} — Section 14.3.3 narratives`, stamp: input.stamp });
  writer.heading(title, 1, headingDestination(CSR_NARRATIVES_SECTION));
  drawText(writer, landed.opening);
  const receipt: NarrativeReceiptEntry[] = [];
  const drawnFindings: string[] = [];
  const walk = await walkLandedNarratives(landed, input.source, drawer(writer, receipt, drawnFindings), () => writer.drain());
  const written = await writer.finish();
  const findings = [...walk.findings, ...drawnFindings];
  if (walk.complete) {
    const targets = await readLeafTargets(file);
    const defined = targets?.destinations ?? new Set<string>();
    for (const name of [headingDestination(CSR_NARRATIVES_SECTION), ...walk.subjects.map(narrativeDestination)]) {
      if (!defined.has(name)) findings.push(`The written leaf does not define the destination ${name}.`);
    }
  }
  const verification: NarrativesVerification = { verified: findings.length === 0, subjects: walk.subjects.length, pages: written.pages,
    sectionSha256: landed.sha256, findings, receipt };
  if (!verification.verified) {
    await fs.rm(file, { force: true });
    const shown = findings.slice(0, 5).join(' ') + (findings.length > 5 ? ` (${findings.length - 5} more.)` : '');
    return { state: 'missing', reason: `${shown} Nothing was filed for Section 14.3.3. Run the narratives again, then assemble.`, verification: { ...verification, pages: null } };
  }
  return { state: 'filed', path: file, fileName: CSR_NARRATIVES_FILE, title, sha256: written.sha256, bytes: written.bytes, pages: written.pages, subjects: walk.subjects, verification };
}
