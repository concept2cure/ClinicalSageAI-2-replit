/**
 * The patient safety narrative job of a CSR build (CSR slice 7, 2026-10-29;
 * docs/design/CSR_END_TO_END_2026-10-29.md). It follows csr-job-runner.ts's
 * persistence, resume and integrity rules, per subject instead of per section:
 *
 *   - subjects are selected by the E3 §12.3.2 rule (narrative-subject-selection)
 *     and composed one at a time, in treatment-group and subject order; each
 *     narrative is saved with its SHA-256 and the digest of its ADaM facts the
 *     moment it is composed, so only one subject's facts are composed at a time;
 *   - memory does not grow with the narrative count (2026-10-30, the build off
 *     the request path): resume reads each saved row's integrity verdict and
 *     digest, not its text (NarrativeStore.heads), and landing reads the text a
 *     page at a time and streams §14.3.3 into the section store as its opening
 *     and one block per subject (narrative-section.ts), so at most a page of
 *     narrative text is held at once. The landed text is the whole-section
 *     composer's, byte for byte;
 *   - a resumed run skips exactly the subjects whose saved narrative verifies
 *     and still matches its facts, and recomposes the rest;
 *   - a saved narrative whose text no longer matches its hash is never
 *     overwritten: the run fails, naming the subjects, and preserves the row;
 *   - §14.3.3 and the §12.3.2 cross-reference are written only when every
 *     selected subject has a verified composed narrative. A refused subject
 *     leaves the build incomplete and is listed for QC with its reason; no
 *     section is written that would read as complete.
 *
 * Storage is behind NarrativeStore (csr-narrative-store.ts in production), so
 * the job is tested at scale without a database.
 */
import { createHash } from 'node:crypto';
import type { CsrAdamBundle } from '../../../shared/csr-adam-bundle.js';
import { selectNarrativeSubjects, type NarrativeCategory } from './narrative-subject-selection.js';
import { buildNarrativeIndex, factsDigest, subjectNarrativeFacts, type NarrativeDatasets } from './narrative-subject-facts.js';
import { composeSubjectNarrative, type ComposedNarrative, type NarrativeProseWriter } from './narrative-compose.js';
import type { NarrativeIssue } from './narrative-reconciliation.js';
import { narrativeSectionBlock, narrativesCrossReference, narrativesSectionHead, type NarrativeSectionHead } from './narrative-section.js';

export const NARRATIVE_COMPOSER = 'csr-narrative-job';

export interface NarrativeQc {
  armName: string;
  categories: NarrativeCategory[];
  events: string[];
  /** Values the rows do not record, which a reviewer must resolve or accept. */
  missingFields: string[];
  prose: 'template' | 'model' | null;
  model?: string;
  modelProseRefused?: NarrativeIssue[];
  refusal?: { reason: string; issues?: NarrativeIssue[] };
}
export interface SavedNarrative {
  subjectId: string; sequence: number; status: 'composed' | 'refused';
  content: string | null; contentHash: string | null; factsDigest: string; qc: NarrativeQc;
}
export interface NarrativeSectionRow { sectionNumber: '14.3.3' | '12.3.2'; content: string; contentHash: string; lineage: Record<string, unknown> }
/** §14.3.3 as it is landed: its text arrives in chunks (the opening, then a page of blocks at a time). */
export interface StreamedNarrativeSection { sectionNumber: '14.3.3'; chunks: AsyncIterable<string>; lineage: Record<string, unknown> }
/** A saved row without its text: the store's own integrity verdict on the text it holds. */
export interface SavedNarrativeHead {
  subjectId: string; sequence: number; status: 'composed' | 'refused'; factsDigest: string;
  /** A composed row holds nonblank text whose SHA-256 is its content_hash; a refused row holds neither. */
  verified: boolean; prose: 'template' | 'model' | null;
}
export interface NarrativePageCursor { sequence: number; subjectId: string }
export interface NarrativeStore {
  /** Every saved row of the build, without its text. */
  heads(): Promise<SavedNarrativeHead[]>;
  /** Saved rows with their text, ordered by (sequence, subjectId), after `after`, at most `limit`. */
  page(after: NarrativePageCursor | null, limit: number): Promise<SavedNarrative[]>;
  /** Persist one subject; false when the build stopped being runnable (cancelled). */
  save(row: SavedNarrative): Promise<boolean>;
  /**
   * Writes §14.3.3 from its chunks and its SHA-256 over exactly what was written;
   * §12.3.2 only where it is absent or this job wrote it. All or nothing: a
   * chunk source that throws leaves both sections as they were.
   */
  writeSections(sections: { narratives: StreamedNarrativeSection; crossReference: NarrativeSectionRow }): Promise<{ written: string[]; kept: string[] }>;
}
export interface NarrativeJobInput {
  bundle: CsrAdamBundle; datasets: NarrativeDatasets; store: NarrativeStore;
  protocolNumber: string; writer?: NarrativeProseWriter;
  /** Recorded on the section lineage: the manifest digest and the run it came from. */
  provenance?: Record<string, unknown>;
  /** Subjects done (composed, refused or resumed) of those selected; false stops the run. */
  onProgress?: (done: number, total: number) => Promise<boolean | void>;
}
export interface NarrativeJobResult {
  status: 'complete' | 'incomplete' | 'failed' | 'stopped';
  selected: number; composed: number; refused: number; resumed: number;
  counts: Record<NarrativeCategory, number>;
  sections: { written: string[]; kept: string[] };
  reason?: 'saved_narrative_integrity_failed' | 'narratives_refused' | 'build_not_runnable';
  subjects?: string[];
}

/** Narratives read per landing page: the most text the job holds at once. */
export const NARRATIVE_PAGE = 50;

/** A saved row that fails its integrity check while §14.3.3 is being streamed. */
export class NarrativeLandingIntegrityError extends Error {
  constructor(readonly subjects: string[]) { super('A saved narrative failed its integrity check while §14.3.3 was landed.'); this.name = 'NarrativeLandingIntegrityError'; }
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const verifies = (row: SavedNarrative) => row.status === 'composed'
  ? typeof row.content === 'string' && !!row.content.trim() && row.contentHash === sha256(row.content)
  : row.content === null && row.contentHash === null;

function savedRow(c: ComposedNarrative, sequence: number, digest: string, armName: string, events: string[]): SavedNarrative {
  const base = { armName, categories: c.categories, events };
  if (c.status === 'refused') {
    return { subjectId: c.subjectId, sequence, status: 'refused', content: null, contentHash: null, factsDigest: digest,
      qc: { ...base, missingFields: [], prose: null, refusal: { reason: c.reason, ...(c.issues ? { issues: c.issues } : {}) } } };
  }
  return { subjectId: c.subjectId, sequence, status: 'composed', content: c.text, contentHash: sha256(c.text), factsDigest: digest,
    qc: { ...base, missingFields: c.missingFields, prose: c.prose, ...(c.model ? { model: c.model } : {}),
      ...(c.modelProseRefused ? { modelProseRefused: c.modelProseRefused } : {}) } };
}

function lineageOf(input: NarrativeJobInput, subjects: number, prose: Array<string | null>): Record<string, unknown> {
  const used = [...new Set(prose.map(p => p ?? 'template'))].sort();
  const model = used.includes('model') && input.writer ? { model: input.writer.model } : {};
  return { source: 'template', composer: NARRATIVE_COMPOSER, subjects, prose: used, ...model, ...input.provenance };
}

/** The opening, then each selected subject's block in order, read a page at a time and verified as it is read. */
async function* sectionChunks(store: NarrativeStore, head: NarrativeSectionHead, order: string[]): AsyncGenerator<string> {
  yield narrativesSectionHead(head);
  const emitted = new Set<string>();
  let after: NarrativePageCursor | null = null;
  for (;;) {
    const rows = await store.page(after, NARRATIVE_PAGE);
    if (!rows.length) break;
    const last = rows[rows.length - 1];
    after = { sequence: last.sequence, subjectId: last.subjectId };
    let chunk = '';
    for (const row of rows) {
      if (order[row.sequence] !== row.subjectId) continue; // a subject an earlier selection held
      if (row.status !== 'composed' || !verifies(row)) throw new NarrativeLandingIntegrityError([row.subjectId]);
      chunk += narrativeSectionBlock({ subjectId: row.subjectId, armName: row.qc.armName, categories: row.qc.categories, events: row.qc.events, text: row.content! });
      emitted.add(row.subjectId);
    }
    if (chunk) yield chunk;
  }
  const absent = order.filter(id => !emitted.has(id));
  if (absent.length) throw new NarrativeLandingIntegrityError(absent);
}

/** Compose, persist and land the narratives of every selected subject; resumable per subject. */
export async function runNarrativeJob(input: NarrativeJobInput): Promise<NarrativeJobResult> {
  const selection = selectNarrativeSubjects(input.bundle, input.datasets);
  const result: NarrativeJobResult = { status: 'complete', selected: selection.subjects.length, composed: 0, refused: 0, resumed: 0,
    counts: selection.counts, sections: { written: [], kept: [] } };
  const prior = new Map((await input.store.heads()).map(row => [row.subjectId, row]));
  const damaged = [...prior.values()].filter(row => !row.verified).map(row => row.subjectId);
  if (damaged.length) return { ...result, status: 'failed', reason: 'saved_narrative_integrity_failed', subjects: damaged };
  const total = selection.subjects.length;
  if (await input.onProgress?.(0, total) === false) return { ...result, status: 'stopped', reason: 'build_not_runnable' };
  const index = buildNarrativeIndex(input.datasets);
  for (const [sequence, subject] of selection.subjects.entries()) {
    const facts = subjectNarrativeFacts(input.datasets, index, subject);
    const digest = factsDigest(facts);
    const saved = prior.get(subject.subjectId);
    if (saved?.status === 'composed' && saved.factsDigest === digest && saved.sequence === sequence) result.resumed++;
    else {
      const composed = await composeSubjectNarrative(facts, input.writer);
      const row = savedRow(composed, sequence, digest, subject.armName, facts.events.map(e => e.term));
      if (!await input.store.save(row)) return { ...result, status: 'stopped', reason: 'build_not_runnable' };
    }
    if (await input.onProgress?.(sequence + 1, total) === false) return { ...result, status: 'stopped', reason: 'build_not_runnable' };
  }
  return landSections(input, selection.subjects.map(s => s.subjectId), result, selection.aesiDeclared);
}

/** Re-check every selected subject's saved row, and write the sections only when all are verified and composed. */
async function landSections(input: NarrativeJobInput, order: string[], result: NarrativeJobResult, aesiDeclared: boolean): Promise<NarrativeJobResult> {
  const heads = new Map((await input.store.heads()).map(row => [row.subjectId, row]));
  const rows = order.map(id => heads.get(id));
  const damaged = order.filter((_id, i) => !rows[i] || !rows[i]!.verified || rows[i]!.sequence !== i);
  if (damaged.length) return { ...result, status: 'failed', reason: 'saved_narrative_integrity_failed', subjects: damaged };
  const refused = rows.filter(r => r!.status === 'refused').map(r => r!.subjectId);
  result.refused = refused.length;
  result.composed = order.length - refused.length;
  if (refused.length) return { ...result, status: 'incomplete', reason: 'narratives_refused', subjects: refused };
  const head = { protocolNumber: input.protocolNumber, counts: result.counts, aesiDeclared, subjects: order.length };
  const lineage = lineageOf(input, order.length, rows.map(r => r!.prose));
  const crossReference = narrativesCrossReference({ ...head, narratives: order.map(subjectId => ({ subjectId })) });
  try {
    result.sections = await input.store.writeSections({
      narratives: { sectionNumber: '14.3.3', chunks: sectionChunks(input.store, head, order), lineage },
      crossReference: { sectionNumber: '12.3.2', content: crossReference, contentHash: sha256(crossReference), lineage },
    });
  } catch (err) {
    if (err instanceof NarrativeLandingIntegrityError) return { ...result, status: 'failed', reason: 'saved_narrative_integrity_failed', subjects: err.subjects };
    throw err;
  }
  return result;
}
