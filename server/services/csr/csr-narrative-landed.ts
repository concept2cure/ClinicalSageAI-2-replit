/**
 * The landed §14.3.3 and the narrative store, read together and never whole
 * (2026-10-30, docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e, "§14.3.3 by
 * reference").
 *
 *   sqlLandedNarratives   the landed §14.3.3 row of csr_section_outputs, read
 *                         as its database-checked hash, its length, its
 *                         opening and slices of its text. The text is never
 *                         selected whole.
 *   walkLandedNarratives  the one match of the landed text to the stored
 *                         narratives: the opening, then each stored narrative's
 *                         block (narrative-section.ts narrativeSectionBlock) in
 *                         (sequence, subject) order, a page of 50 at a time,
 *                         with nothing left over. The leaf renderer draws
 *                         through it (csr-assembly-narratives.ts), and the
 *                         reference below is made through it.
 *   readCsrNarrativeReference
 *                         what an Authoring import holds for §14.3.3 in place
 *                         of its text (shared/csr-narrative-reference.ts):
 *                         made only when every stored narrative matched;
 *                         otherwise the finding names the subject.
 */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { CSR_NARRATIVE_REFERENCE_SCHEMA, type CsrNarrativeReference } from '../../../shared/csr-narrative-reference';
import type { NarrativePageCursor, SavedNarrative } from './csr-narrative-job.js';
import { sqlNarrativeStore, type NarrativeQueryable } from './csr-narrative-store.js';
import { narrativeSectionBlock } from './narrative-section.js';

/** Narratives read per page: the most narrative text held at once. */
export const NARRATIVES_PAGE = 50;
export const BLOCK_START = '\n\nSubject ';
const OPENING_MAX = 200_000;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The landed §14.3.3, read in parts. Offsets and lengths are in characters. */
export interface LandedNarratives {
  length: number;
  /** The text before the first subject's block: the selection basis. */
  opening: string;
  /** The SHA-256 of the whole landed text. */
  sha256: string;
  slice(start: number, count: number): Promise<string>;
}

/** The store's rows, a page at a time, in landing order (sequence, subject). */
export interface NarrativePages { page(after: NarrativePageCursor | null, limit: number): Promise<SavedNarrative[]> }

/** A landed section already in memory (an assembly given its sections inline). */
export function inlineLandedNarratives(content: string): LandedNarratives {
  const start = content.indexOf(BLOCK_START);
  return { length: content.length, opening: start < 0 ? content : content.slice(0, start), sha256: sha256(content),
    slice: async (from, count) => content.slice(from, from + count) };
}

export class LandedNarrativesError extends Error {
  constructor(readonly code: 'CSR_NARRATIVES_HASH_MISMATCH' | 'CSR_NARRATIVES_UNSUPPORTED_TEXT', message: string) { super(message); this.name = 'LandedNarrativesError'; }
}

type Job = { organizationId: number; jobId: number };

/**
 * The landed §14.3.3 of a build, or null when none has landed. Refused when the
 * database's SHA-256 of the text is not its recorded hash, or when the text holds a
 * character outside the Basic Multilingual Plane (offsets here are characters, the
 * database's and JavaScript's alike only inside it; the PDF fonts refuse it anyway).
 */
export async function sqlLandedNarratives(q: NarrativeQueryable, job: Job): Promise<LandedNarratives | null> {
  const { rows } = await q.query(`SELECT content_hash, char_length(content) AS length,
      content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex') AS verified,
      content ~ '[^\\x01-\\uffff]' AS astral,
      substr(content, 1, LEAST(CASE WHEN strpos(content, $3) > 0 THEN strpos(content, $3) - 1 ELSE char_length(content) END, $4)) AS opening
    FROM csr_section_outputs WHERE organization_id = $1 AND job_id = $2 AND section_number = '14.3.3'`, [job.organizationId, job.jobId, BLOCK_START, OPENING_MAX]);
  const row = rows[0];
  if (!row) return null;
  if (row.verified !== true || typeof row.content_hash !== 'string') throw new LandedNarrativesError('CSR_NARRATIVES_HASH_MISMATCH', 'Saved CSR section 14.3.3 does not match its recorded content hash.');
  if (row.astral === true) throw new LandedNarrativesError('CSR_NARRATIVES_UNSUPPORTED_TEXT', 'Saved CSR section 14.3.3 holds characters the report cannot carry (outside the Basic Multilingual Plane).');
  return { length: Number(row.length), opening: String(row.opening ?? ''), sha256: row.content_hash,
    async slice(start, count) {
      if (count <= 0) return '';
      const part = await q.query(`SELECT substr(content, $3::int, $4::int) AS text FROM csr_section_outputs
        WHERE organization_id = $1 AND job_id = $2 AND section_number = '14.3.3'`, [job.organizationId, job.jobId, start + 1, count]);
      return String(part.rows[0]?.text ?? '');
    } };
}

export interface WalkedNarrative { row: SavedNarrative & { content: string }; block: string }
export interface NarrativeWalk { matched: number; subjects: string[]; findings: string[]; complete: boolean; offset: number }

/** The subject whose landed text no stored narrative matches, read from the section at that point. */
async function unmatchedAt(landed: LandedNarratives, offset: number): Promise<string> {
  const text = await landed.slice(offset, 400);
  const subject = new RegExp(`^${BLOCK_START.replace(/\n/g, '\\n')}(.+?) \\(`).exec(text)?.[1];
  return subject ? `the narrative of subject ${subject} in the section` : `the section's text from character ${offset}`;
}

const blockOf = (row: SavedNarrative & { content: string }) =>
  narrativeSectionBlock({ subjectId: row.subjectId, armName: row.qc.armName, categories: row.qc.categories, events: row.qc.events, text: row.content });

/**
 * Match the landed text to the stored narratives. Each stored narrative whose
 * block is the landed text at the current point is visited; a row it does not
 * hold (an earlier selection's, or refused) is skipped. `complete` is true only
 * when the whole landed text was matched; otherwise the first finding names
 * where it stopped. A matched narrative whose text is not its recorded SHA-256
 * is a finding naming the subject.
 */
export async function walkLandedNarratives(landed: LandedNarratives, source: NarrativePages,
  visit?: (n: WalkedNarrative) => void | Promise<void>, afterPage?: () => Promise<void>): Promise<NarrativeWalk> {
  const walk: NarrativeWalk = { matched: 0, subjects: [], findings: [], complete: false, offset: landed.opening.length };
  let after: NarrativePageCursor | null = null;
  for (;;) {
    const rows = await source.page(after, NARRATIVES_PAGE);
    if (!rows.length || walk.offset >= landed.length) break;
    after = { sequence: rows[rows.length - 1].sequence, subjectId: rows[rows.length - 1].subjectId };
    const candidates = rows.filter((r): r is SavedNarrative & { content: string } => r.status === 'composed' && typeof r.content === 'string')
      .map(row => ({ row, block: blockOf(row) }));
    // The landed text this page can match: never more than its blocks together.
    const window = await landed.slice(walk.offset, candidates.reduce((n, c) => n + c.block.length, 0));
    let local = 0;
    for (const c of candidates) {
      if (!window.startsWith(c.block, local)) continue;
      if (c.row.contentHash !== sha256(c.row.content)) walk.findings.push(`The stored narrative of subject ${c.row.subjectId} does not match its recorded SHA-256.`);
      await visit?.(c);
      local += c.block.length;
      walk.matched++;
      walk.subjects.push(c.row.subjectId);
    }
    walk.offset += local;
    await afterPage?.();
  }
  walk.complete = walk.offset === landed.length;
  if (!walk.complete) {
    walk.findings.unshift(`The landed Section 14.3.3 does not match the stored narratives: no stored narrative has the text of ${await unmatchedAt(landed, walk.offset)} (edited or recomposed after it was landed).`);
  }
  return walk;
}

/** SHA-256 over every stored row as the database read it; the text's own hash is the database's. */
async function storeDigest(q: NarrativeQueryable, job: Job): Promise<string> {
  const { rows } = await q.query(`SELECT subject_id, sequence, status, content_hash, facts_digest,
      CASE WHEN content IS NULL THEN NULL ELSE encode(sha256(convert_to(content, 'UTF8')), 'hex') END AS text_sha256,
      encode(sha256(convert_to(qc::text, 'UTF8')), 'hex') AS qc_sha256
    FROM csr_narrative_outputs WHERE organization_id = $1 AND job_id = $2 ORDER BY sequence, subject_id`, [job.organizationId, job.jobId]);
  const digest = createHash('sha256');
  for (const r of rows) digest.update(`${stableStringify([r.subject_id, Number(r.sequence), r.status, r.content_hash ?? null, r.text_sha256 ?? null, r.facts_digest, r.qc_sha256])}\n`);
  return digest.digest('hex');
}

export type NarrativeReferenceRead =
  | { state: 'not-landed' }
  | { state: 'verified'; reference: CsrNarrativeReference; opening: string }
  | { state: 'mismatch'; findings: string[] };

/** §14.3.3 of a build as a reference to its narrative store, checked narrative by narrative against the landed text. */
export async function readCsrNarrativeReference(q: NarrativeQueryable, job: Job): Promise<NarrativeReferenceRead> {
  const landed = await sqlLandedNarratives(q, job);
  if (!landed) return { state: 'not-landed' };
  const before = await storeDigest(q, job);
  const walk = await walkLandedNarratives(landed, sqlNarrativeStore(q, { ...job, projectId: null }));
  if (walk.findings.length) return { state: 'mismatch', findings: walk.findings };
  // Read twice around the walk: a store written to during it is not the store that was matched.
  if (await storeDigest(q, job) !== before) return { state: 'mismatch', findings: ['The narrative store changed while Section 14.3.3 was being checked against it.'] };
  return { state: 'verified', opening: landed.opening, reference: { schema: CSR_NARRATIVE_REFERENCE_SCHEMA, jobId: job.jobId, sectionNumber: '14.3.3',
    narratives: walk.matched, storeDigest: before, landedSha256: landed.sha256, landedLength: landed.length, openingSha256: sha256(landed.opening) } };
}
