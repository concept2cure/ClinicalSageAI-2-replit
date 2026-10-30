/** Current retained-source admission for the existing CSR job runner. The
 * canonical readers retain authority over access, source disposition and the
 * sealed run; this helper compares their actual section digests, not metadata
 * supplied by a model or a caller. It creates no new source or job store. */
import type { RequestDb, RequestSqlClient } from '../../db/requestDb';
import { resolveCsrScope } from './project-scope';
import { CsrAuthoringContextError, type CsrAuthoringEvidence } from './cortex-authoring-context';

export interface CsrJobEvidenceScope {
  organizationId: number;
  projectId: number | null;
  requestedBy: number | null;
  studyId: string;
}
export interface CsrJobRetainedSource { programId: string; runId: string; studyId: string }

const RECOVERY_MESSAGES = {
  CSR_EVIDENCE_CHANGED: 'The retained evidence changed while this CSR section was drafted. No late section was saved. Existing outputs were retained. Verify the current study sources and start a new CSR build.',
  CSR_EVIDENCE_SAVED_LINEAGE_MISMATCH: 'Saved CSR results do not identify the same readable source evidence. Existing outputs were retained. Verify the current study sources and start a new CSR build.',
  CSR_EVIDENCE_RESULTS_UNAVAILABLE: 'The retained evidence contains no usable result tables for this CSR section. Existing outputs were retained. Verify or supply the needed study results and start a new CSR build.',
} as const;

function evidenceRefusal(code: keyof typeof RECOVERY_MESSAGES): never {
  throw Object.assign(new CsrAuthoringContextError(code, 409), { message: RECOVERY_MESSAGES[code] });
}

/** Pair the saved numeric target with its exact source program, rather than
 * accepting an unrelated program merely because it uses the same protocol. */
export async function verifyCsrJobWriteScope(
  database: Pick<RequestDb, 'select' | 'execute'>,
  job: CsrJobEvidenceScope,
  source?: CsrJobRetainedSource,
): Promise<void> {
  await resolveCsrScope(database, job.organizationId, {
    projectId: job.projectId ?? undefined,
    ...(source ? { programId: source.programId } : {}),
  }, { forWrite: true, actorUserId: job.requestedBy ?? undefined });
}

/** Always load through the current, receipt-verified retained-table reader.
 * §2 admits the bound study even when a job selects only metadata headings;
 * results headings use their own exact evidence packs. */
export async function readCsrJobEvidence(
  job: CsrJobEvidenceScope, source: CsrJobRetainedSource, sectionNumber: string,
): Promise<CsrAuthoringEvidence> {
  const [{ loadCsrAuthoringEvidence }, { pool }] = await Promise.all([
    import('./cortex-authoring-reader'), import('../../db'),
  ]);
  const evidence = await loadCsrAuthoringEvidence(pool as unknown as RequestSqlClient,
    { organizationId: job.organizationId, userId: job.requestedBy ?? 0 }, { ...source, sectionNumber });
  if (evidence.programId !== source.programId || evidence.runId !== source.runId || evidence.studyId !== source.studyId ||
      evidence.sectionNumber !== sectionNumber) {
    throw new CsrAuthoringContextError('CSR_EVIDENCE_SCOPE_MISMATCH', 409);
  }
  if (evidence.source.protocolNumber !== job.studyId) {
    throw new CsrAuthoringContextError('CSR_EVIDENCE_STUDY_MISMATCH', 409);
  }
  return evidence;
}

/** A late reply cannot be relabelled as a draft over replacement evidence. */
export function assertCsrJobEvidenceUnchanged(before: CsrAuthoringEvidence, after: CsrAuthoringEvidence): void {
  if (before.evidenceDigest !== after.evidenceDigest || before.source.sha256 !== after.source.sha256) {
    evidenceRefusal('CSR_EVIDENCE_CHANGED');
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Resume is reuse, not regeneration. A saved results section must still name
 * the exact readable pack it was drafted over; unknown or changed lineage is
 * refused without overwriting the retained text, hash or provenance. */
export function assertSavedCsrJobEvidence(lineage: unknown, evidence: CsrAuthoringEvidence): void {
  // A matching digest over no results does not substantiate a legacy clean
  // finding. Metadata-only headings never call this results-lineage guard.
  if (!evidence.tables.length || evidence.status === 'unavailable') {
    evidenceRefusal('CSR_EVIDENCE_RESULTS_UNAVAILABLE');
  }
  const saved = record(lineage) && record(lineage.evidence) ? lineage.evidence : null;
  if (!saved || saved.runId !== evidence.runId || saved.studyId !== evidence.studyId ||
      saved.sectionNumber !== evidence.sectionNumber || saved.sourceSha256 !== evidence.source.sha256 ||
      saved.evidenceDigest !== evidence.evidenceDigest) {
    evidenceRefusal('CSR_EVIDENCE_SAVED_LINEAGE_MISMATCH');
  }
}
