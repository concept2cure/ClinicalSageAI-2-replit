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
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { CSR_NARRATIVE_REFERENCE_SCHEMA, type CsrNarrativeReference } from '../../../shared/csr-narrative-reference';
import type { NarrativePageCursor, SavedNarrative } from './csr-narrative-job.js';
import { CsrNarrativeBuildError, sqlNarrativeStore, type NarrativeQueryable } from './csr-narrative-store.js';
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
export async function sqlLandedNarratives(q: NarrativeQueryable, job: Job,
  options: { verifyEachSlice?: boolean } = {}): Promise<LandedNarratives | null> {
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
      // A replacement section must not supply pages to an earlier section's
      // receipt. Returning no text makes the existing walker report a mismatch
      // (and lets the renderer close/remove its incomplete leaf normally).
      const part = await q.query(`SELECT substr(content, $3::int, $4::int) AS text FROM csr_section_outputs
        WHERE organization_id = $1 AND job_id = $2 AND section_number = '14.3.3'
          AND content_hash = $5
          AND CASE WHEN $6::boolean THEN encode(sha256(convert_to(content, 'UTF8')), 'hex') = $5 ELSE TRUE END`,
      [job.organizationId, job.jobId, start + 1, count, row.content_hash, options.verifyEachSlice === true]);
      // A partial page has no full-text final digest. Verify the actual bytes
      // in the SAME statement as the slice, including an unrecorded ABA edit.
      // Full walkers keep their final streamed digest and avoid this rehash.
      if (options.verifyEachSlice && part.rows.length !== 1) {
        throw new LandedNarrativesError('CSR_NARRATIVES_HASH_MISMATCH', 'The landed narrative bytes no longer match this read.');
      }
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

/** Match at the current landed boundary, never at a quoted Subject marker. */
async function matchedNarrativeChunk(landed: LandedNarratives, rows: SavedNarrative[], offset: number) {
  const candidates = rows.filter((r): r is SavedNarrative & { content: string } => r.status === 'composed' && typeof r.content === 'string')
    .map(row => ({ row, block: blockOf(row) }));
  const window = await landed.slice(offset, candidates.reduce((n, c) => n + c.block.length, 0));
  const matched: WalkedNarrative[] = [];
  let advanced = 0;
  for (const candidate of candidates) {
    if (!window.startsWith(candidate.block, advanced)) continue;
    matched.push(candidate); advanced += candidate.block.length;
  }
  return { matched, advanced };
}

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
  // The matched blocks themselves must reproduce the admitted section hash.
  // Matching current rows to current slices alone can mix revisions when a
  // concurrent writer changes both after the initial metadata read. Hash one
  // block at a time: no whole-section text or per-page SQL hashing is needed.
  const matchedDigest = createHash('sha256').update(landed.opening, 'utf8');
  let after: NarrativePageCursor | null = null;
  for (;;) {
    const rows = await source.page(after, NARRATIVES_PAGE);
    if (!rows.length || walk.offset >= landed.length) break;
    after = { sequence: rows[rows.length - 1].sequence, subjectId: rows[rows.length - 1].subjectId };
    const chunk = await matchedNarrativeChunk(landed, rows, walk.offset);
    for (const c of chunk.matched) {
      if (c.row.contentHash !== sha256(c.row.content)) walk.findings.push(`The stored narrative of subject ${c.row.subjectId} does not match its recorded SHA-256.`);
      matchedDigest.update(c.block, 'utf8');
      await visit?.(c);
      walk.matched++;
      walk.subjects.push(c.row.subjectId);
    }
    walk.offset += chunk.advanced;
    await afterPage?.();
  }
  walk.complete = walk.offset === landed.length;
  if (walk.complete && matchedDigest.digest('hex') !== landed.sha256) {
    walk.findings.push('The streamed Section 14.3.3 does not match its recorded SHA-256. Its saved text changed or is inconsistent; no verified reference may be issued.');
  }
  if (!walk.complete) {
    walk.findings.unshift(`The landed Section 14.3.3 does not match the stored narratives: no stored narrative has the text of ${await unmatchedAt(landed, walk.offset)} (edited or recomposed after it was landed).`);
  }
  return walk;
}

export interface ImportedNarrativePins { storeDigest: string; landedSha256: string }
export type NarrativeSnapshotFingerprints = ReadonlyMap<string, string>;
export interface ImportedNarrativeSnapshot extends ImportedNarrativePins { fingerprints: NarrativeSnapshotFingerprints }
export interface LandedNarrativePageCursor extends NarrativePageCursor { landedOffset: number; proof: string }
const HASH = /^[a-f0-9]{64}$/;
const changedReference = () => new CsrNarrativeBuildError('CSR_NARRATIVE_REFERENCE_CHANGED', 409,
  'The saved narratives changed after this section was imported. Reimport the section before reading the narratives.');
const invalidPage = () => new CsrNarrativeBuildError('CSR_NARRATIVE_PAGE_INVALID', 400,
  'This narrative page could not be verified for the imported section. Return to its first page.');

async function importedLanded(q: NarrativeQueryable, job: Job, pins: ImportedNarrativePins) {
  let landed: LandedNarratives | null;
  try { landed = await sqlLandedNarratives(q, job, { verifyEachSlice: true }); }
  catch (error) { if (error instanceof LandedNarrativesError) throw changedReference(); throw error; }
  if (!landed || landed.sha256 !== pins.landedSha256) throw changedReference();
  return landed;
}

/** Derived from the existing validated auth secret, with a separate purpose. */
async function cursorProof(job: Job, pins: ImportedNarrativePins, cursor: NarrativePageCursor & { landedOffset: number }) {
  const { config } = await import('../../config/environment.js');
  const key = createHmac('sha256', config.jwt.secret).update('concept2cure/csr-landed-page/v1').digest();
  return createHmac('sha256', key).update(stableStringify([1, job.organizationId, job.jobId,
    pins.storeDigest, pins.landedSha256, cursor.sequence, cursor.subjectId, cursor.landedOffset])).digest('hex');
}

async function verifyLandedCursor(job: Job, pins: ImportedNarrativePins, landed: LandedNarratives, cursor: LandedNarrativePageCursor) {
  if (!Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0 || typeof cursor.subjectId !== 'string'
    || !cursor.subjectId || cursor.subjectId.length > 200 || !Number.isSafeInteger(cursor.landedOffset)
    || cursor.landedOffset <= landed.opening.length || cursor.landedOffset >= landed.length
    || typeof cursor.proof !== 'string' || !HASH.test(cursor.proof)) throw invalidPage();
  const expected = Buffer.from(await cursorProof(job, pins, cursor), 'hex');
  const supplied = Buffer.from(cursor.proof, 'hex');
  if (!timingSafeEqual(expected, supplied)) throw invalidPage();
}

/**
 * Continue the existing exact matcher from a sealed landed boundary. Candidate
 * text arrives in batches of 50; only this page plus one lookahead is retained.
 * Remnants may require a linear scan, but earlier landed pages are not replayed.
 * The route also verifies the imported store digest around this read.
 */
export async function readLandedNarrativePage(q: NarrativeQueryable, job: Job, pins: ImportedNarrativeSnapshot,
  after: LandedNarrativePageCursor | null, limit: number) {
  const size = Math.max(1, Math.min(50, Math.trunc(limit) || 20));
  const landed = await importedLanded(q, job, pins);
  if (after) await verifyLandedCursor(job, pins, landed, after);
  const source = sqlNarrativeStore(q, { ...job, projectId: null });
  let cursor: NarrativePageCursor | null = after;
  let offset = after?.landedOffset ?? landed.opening.length;
  const found: Array<{ row: SavedNarrative & { content: string }; landedOffset: number }> = [];
  while (offset < landed.length && found.length <= size) {
    const rows = await source.page(cursor, NARRATIVES_PAGE);
    if (!rows.length) throw changedReference();
    let chunk: Awaited<ReturnType<typeof matchedNarrativeChunk>>;
    try { chunk = await matchedNarrativeChunk(landed, rows, offset); }
    catch (error) { if (error instanceof LandedNarrativesError) throw changedReference(); throw error; }
    const selected = chunk.matched.slice(0, size + 1 - found.length);
    await requireNarrativeSnapshot(q, selected.map(match => match.row), pins.fingerprints);
    for (const match of selected) {
      if (match.row.contentHash !== sha256(match.row.content)) throw changedReference();
      offset += match.block.length;
      found.push({ row: match.row, landedOffset: offset });
      if (found.length > size) break;
    }
    const last = rows[rows.length - 1];
    cursor = { sequence: last.sequence, subjectId: last.subjectId };
  }
  await importedLanded(q, job, pins);
  const page = found.slice(0, size);
  const last = page[page.length - 1];
  let next: LandedNarrativePageCursor | null = null;
  if (found.length > size && last) {
    const position = { sequence: last.row.sequence, subjectId: last.row.subjectId, landedOffset: last.landedOffset };
    next = { ...position, proof: await cursorProof(job, pins, position) };
  }
  return { rows: page.map(item => item.row), next, landedSha256: landed.sha256 };
}

const snapshotKey = (row: Record<string, unknown>) => stableStringify([Number(row.sequence), row.subject_id]);
const snapshotHeader = (row: Record<string, unknown>) => stableStringify([row.subject_id, Number(row.sequence), row.status,
  row.content_hash ?? null, row.text_sha256 ?? null, row.facts_digest, row.qc_sha256]);

/**
 * SHA-256 over every stored row as the database read it; the text's own hash is
 * the database's. The optional map retains only fingerprints from THIS admitted
 * query, without changing the established store digest or retaining its text.
 */
export async function readCsrNarrativeStoreDigest(q: NarrativeQueryable, job: Job, fingerprints?: Map<string, string>): Promise<string> {
  fingerprints?.clear();
  const { rows } = await q.query(`SELECT subject_id, sequence, status, content_hash, facts_digest,
      CASE WHEN content IS NULL THEN NULL ELSE encode(sha256(convert_to(content, 'UTF8')), 'hex') END AS text_sha256,
      encode(sha256(convert_to(qc::text, 'UTF8')), 'hex') AS qc_sha256
    FROM csr_narrative_outputs WHERE organization_id = $1 AND job_id = $2 ORDER BY sequence, subject_id`, [job.organizationId, job.jobId]);
  const digest = createHash('sha256');
  for (const row of rows) {
    const header = snapshotHeader(row);
    digest.update(`${header}\n`);
    fingerprints?.set(snapshotKey(row), sha256(header));
  }
  return digest.digest('hex');
}

/**
 * Compare CAPTURED rows to the initially admitted metadata, not another current
 * read that can also observe a temporary replacement. PostgreSQL canonicalizes
 * the captured QC just as the store digest does; only metadata is sent back,
 * never narrative or landed text. Exact reference pages bound these rows;
 * legacy digest-only QC still returns and checks its full metadata list.
 */
export async function requireNarrativeSnapshot(q: NarrativeQueryable, rows: SavedNarrative[], fingerprints: NarrativeSnapshotFingerprints) {
  if (!rows.length) return;
  const captured = rows.map(row => ({ subject_id: row.subjectId, sequence: row.sequence, status: row.status,
    content_hash: row.contentHash, text_sha256: row.content === null ? null : sha256(row.content), facts_digest: row.factsDigest, qc: row.qc }));
  const result = await q.query(`SELECT item->>'subject_id' AS subject_id,(item->>'sequence')::int AS sequence,
      item->>'status' AS status,item->>'content_hash' AS content_hash,item->>'text_sha256' AS text_sha256,
      item->>'facts_digest' AS facts_digest,encode(sha256(convert_to((item->'qc')::text,'UTF8')),'hex') AS qc_sha256
    FROM jsonb_array_elements($1::jsonb) AS captured(item)`, [JSON.stringify(captured)]);
  if (result.rows.length !== captured.length) throw changedReference();
  for (const row of result.rows) {
    if (fingerprints.get(snapshotKey(row)) !== sha256(snapshotHeader(row))) throw changedReference();
  }
}

export type NarrativeReferenceRead =
  | { state: 'not-landed' }
  | { state: 'verified'; reference: CsrNarrativeReference; opening: string }
  | { state: 'mismatch'; findings: string[] };

/** §14.3.3 of a build as a reference to its narrative store, checked narrative by narrative against the landed text. */
export async function readCsrNarrativeReference(q: NarrativeQueryable, job: Job): Promise<NarrativeReferenceRead> {
  const landed = await sqlLandedNarratives(q, job);
  if (!landed) return { state: 'not-landed' };
  const before = await readCsrNarrativeStoreDigest(q, job);
  const walk = await walkLandedNarratives(landed, sqlNarrativeStore(q, { ...job, projectId: null }));
  if (walk.findings.length) return { state: 'mismatch', findings: walk.findings };
  // Read twice around the walk: a store written to during it is not the store that was matched.
  if (await readCsrNarrativeStoreDigest(q, job) !== before) return { state: 'mismatch', findings: ['The narrative store changed while Section 14.3.3 was being checked against it.'] };
  // The per-subject store can be unchanged while the landed opening, body or
  // whole row is edited/deleted. Revalidate its database-checked digest at
  // the final read boundary, including the zero-narrative case with no pages.
  // This remains on the caller's connection/snapshot; it is not a new lock or
  // permission to reuse a reference after a later source change.
  const current = await sqlLandedNarratives(q, job);
  if (!current || current.sha256 !== landed.sha256 || current.length !== landed.length || current.opening !== landed.opening) {
    return { state: 'mismatch', findings: ['The saved Section 14.3.3 changed while its narrative reference was being verified. Re-read the source before importing or assembling it.'] };
  }
  return { state: 'verified', opening: landed.opening, reference: { schema: CSR_NARRATIVE_REFERENCE_SCHEMA, jobId: job.jobId, sectionNumber: '14.3.3',
    narratives: walk.matched, storeDigest: before, landedSha256: landed.sha256, landedLength: landed.length, openingSha256: sha256(landed.opening) } };
}
