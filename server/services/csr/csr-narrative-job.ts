/**
 * The patient safety narrative job of a CSR build (CSR slice 7, 2026-10-29;
 * docs/design/CSR_END_TO_END_2026-10-29.md). It follows csr-job-runner.ts's
 * persistence, resume and integrity rules, per subject instead of per section:
 *
 *   - subjects are selected by the E3 §12.3.2 rule (narrative-subject-selection)
 *     and composed one at a time, in treatment-group and subject order; each
 *     narrative is saved with its SHA-256 and the digest of its ADaM facts the
 *     moment it is composed, so only one subject's facts are composed at a time
 *     (the saved rows, text included, are read whole to verify and resume, and
 *     §14.3.3 is one text of every narrative, so landing holds all of them);
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
import { narrativesCrossReference, narrativesSection, type SectionNarrative } from './narrative-section.js';

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
export interface NarrativeStore {
  saved(): Promise<SavedNarrative[]>;
  /** Persist one subject; false when the build stopped being runnable (cancelled). */
  save(row: SavedNarrative): Promise<boolean>;
  /** Writes §14.3.3; §12.3.2 only where it is absent or this job wrote it. */
  writeSections(rows: NarrativeSectionRow[]): Promise<{ written: string[]; kept: string[] }>;
}
export interface NarrativeJobInput {
  bundle: CsrAdamBundle; datasets: NarrativeDatasets; store: NarrativeStore;
  protocolNumber: string; writer?: NarrativeProseWriter;
  /** Recorded on the section lineage: the manifest digest and the run it came from. */
  provenance?: Record<string, unknown>;
}
export interface NarrativeJobResult {
  status: 'complete' | 'incomplete' | 'failed' | 'stopped';
  selected: number; composed: number; refused: number; resumed: number;
  counts: Record<NarrativeCategory, number>;
  sections: { written: string[]; kept: string[] };
  reason?: 'saved_narrative_integrity_failed' | 'narratives_refused' | 'build_not_runnable';
  subjects?: string[];
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

function sectionRows(input: NarrativeJobInput, narratives: SectionNarrative[], counts: NarrativeJobResult['counts'], aesiDeclared: boolean, prose: string[]): NarrativeSectionRow[] {
  const data = { protocolNumber: input.protocolNumber, counts, aesiDeclared, narratives };
  const model = prose.includes('model') && input.writer ? { model: input.writer.model } : {};
  const lineage = { source: 'template', composer: NARRATIVE_COMPOSER, subjects: narratives.length, prose: [...new Set(prose)].sort(), ...model, ...input.provenance };
  return ([['14.3.3', narrativesSection(data)], ['12.3.2', narrativesCrossReference(data)]] as const)
    .map(([sectionNumber, content]) => ({ sectionNumber, content, contentHash: sha256(content), lineage }));
}

/** Compose, persist and land the narratives of every selected subject; resumable per subject. */
export async function runNarrativeJob(input: NarrativeJobInput): Promise<NarrativeJobResult> {
  const selection = selectNarrativeSubjects(input.bundle, input.datasets);
  const result: NarrativeJobResult = { status: 'complete', selected: selection.subjects.length, composed: 0, refused: 0, resumed: 0,
    counts: selection.counts, sections: { written: [], kept: [] } };
  const prior = new Map((await input.store.saved()).map(row => [row.subjectId, row]));
  const damaged = [...prior.values()].filter(row => !verifies(row)).map(row => row.subjectId);
  if (damaged.length) return { ...result, status: 'failed', reason: 'saved_narrative_integrity_failed', subjects: damaged };
  const index = buildNarrativeIndex(input.datasets);
  for (const [sequence, subject] of selection.subjects.entries()) {
    const facts = subjectNarrativeFacts(input.datasets, index, subject);
    const digest = factsDigest(facts);
    const saved = prior.get(subject.subjectId);
    if (saved?.status === 'composed' && saved.factsDigest === digest && saved.sequence === sequence) { result.resumed++; continue; }
    const composed = await composeSubjectNarrative(facts, input.writer);
    const row = savedRow(composed, sequence, digest, subject.armName, facts.events.map(e => e.term));
    if (!await input.store.save(row)) return { ...result, status: 'stopped', reason: 'build_not_runnable' };
  }
  return landSections(input, selection.subjects.map(s => s.subjectId), result, selection.aesiDeclared);
}

/** Re-read every selected subject's saved row, verify it, and write the sections only when all are composed. */
async function landSections(input: NarrativeJobInput, order: string[], result: NarrativeJobResult, aesiDeclared: boolean): Promise<NarrativeJobResult> {
  const saved = new Map((await input.store.saved()).map(row => [row.subjectId, row]));
  const rows = order.map(id => saved.get(id));
  const damaged = order.filter((id, i) => !rows[i] || !verifies(rows[i]!));
  if (damaged.length) return { ...result, status: 'failed', reason: 'saved_narrative_integrity_failed', subjects: damaged };
  const refused = rows.filter(r => r!.status === 'refused').map(r => r!.subjectId);
  result.refused = refused.length;
  result.composed = order.length - refused.length;
  if (refused.length) return { ...result, status: 'incomplete', reason: 'narratives_refused', subjects: refused };
  const narratives: SectionNarrative[] = rows.map(r => ({ subjectId: r!.subjectId, armName: r!.qc.armName, categories: r!.qc.categories,
    events: r!.qc.events, text: r!.content! }));
  result.sections = await input.store.writeSections(sectionRows(input, narratives, result.counts, aesiDeclared, rows.map(r => r!.qc.prose ?? 'template')));
  return result;
}
