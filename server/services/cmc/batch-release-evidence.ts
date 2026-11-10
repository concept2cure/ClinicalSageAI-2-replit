/**
 * What a batch release is signed over: the batch's RECORDED QC results.
 *
 * The release route evaluated `releaseTesting` from the request body, and the
 * board sent `{}`. Zero tests evaluated is "all tests passed", so a §11
 * release signature landed on a batch with no result recorded against it,
 * behind a client-side rule (deviations = 0 and yield ≥ 90%) that no
 * regulation states. A disposition is now evaluated from qc_testing: the
 * results recorded against this batch number (in this batch's program), each
 * one reviewed by a second person (the QC review), none failing.
 *
 * - released: at least one recorded result, every one reviewed, none failing,
 *   and no open deviation on the batch record (21 CFR 211.192);
 * - conditional release: at least one recorded result and none failing (a
 *   result may still await review — that is what makes it conditional);
 * - rejected: may be signed whatever is recorded.
 *
 * The evaluation runs BEFORE the signer is asked for anything, so the
 * signature's meaning follows it; the signing transaction re-reads the results
 * and refuses if they changed in between (`evidenceFingerprint`).
 *
 * @module server/services/cmc/batch-release-evidence
 */

import { createHash } from 'node:crypto';
/* `stableStringify` only. `shared/canonical-json`'s own `sha256Hex` reaches
   `node:crypto` through a dynamic `require` — deliberately, so that a module
   five client files import does not pull crypto into the browser bundle — and
   `require` does not exist in this server's ESM runtime. Calling it here made
   every batch release answer 500 `ReferenceError: require is not defined`,
   measured against `npm run dev` on 2026-11-09, on the one path that reaches a
   signature. `services/ana/skills/library/index.ts` hashes by hand for the same
   reason and says so. */
import { stableStringify } from '../../../shared/canonical-json';

export type ReleaseDecision = 'approved' | 'rejected' | 'conditional';
export type ReleaseStatus = 'released' | 'conditional-release' | 'rejected';

export interface RecordedReleaseTest {
  qcId: number;
  sampleId: string;
  testMethod: string;
  result: unknown;
  criterion: unknown;
  passFail: string;
  reviewed: boolean;
  passed: boolean;
  sampleType: string;
  analystId: number | null;
  reviewerId: number | null;
  testDate: string | null;
  releaseDate: string | null;
  certificateOfAnalysis: string | null;
  recordRevision: string | null;
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

function recordedDate(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** QC results in the batch's exact scope. Null is an unassigned programme,
 * never a wildcard across all programmes sharing a batch label. */
export async function readRecordedReleaseTests(
  q: Queryable,
  orgId: number,
  batch: { batch_number?: unknown; project_id?: unknown },
  options: { forShare?: boolean } = {},
): Promise<RecordedReleaseTest[]> {
  const batchNumber = String(batch.batch_number ?? '').trim();
  if (!batchNumber) return [];
  const projectId = batch.project_id == null ? null : String(batch.project_id);
  // Both statements are fixed SQL; only the final signing read locks the
  // selected evidence rows. Scope values remain bound in either branch.
  const statement = options.forShare
    ? `SELECT id, sample_id, sample_type, test_method, test_results, specifications, pass_fail_status,
            analyst, reviewed_by, test_date, release_date, certificate_of_analysis, updated_at::text AS record_revision
       FROM qc_testing
      WHERE organization_id = $1 AND batch_number = $2
        AND project_id IS NOT DISTINCT FROM $3::text
      ORDER BY id FOR SHARE`
    : `SELECT id, sample_id, sample_type, test_method, test_results, specifications, pass_fail_status,
            analyst, reviewed_by, test_date, release_date, certificate_of_analysis, updated_at::text AS record_revision
       FROM qc_testing
      WHERE organization_id = $1 AND batch_number = $2
        AND project_id IS NOT DISTINCT FROM $3::text
      ORDER BY id`;
  const { rows } = await q.query(statement, [orgId, batchNumber, projectId]);
  return rows.map((r) => {
    const passFail = String(r.pass_fail_status ?? '').trim().toLowerCase();
    return {
      qcId: Number(r.id),
      sampleId: String(r.sample_id ?? ''),
      testMethod: String(r.test_method ?? ''),
      result: r.test_results ?? null,
      criterion: r.specifications ?? null,
      passFail,
      reviewed: r.reviewed_by != null,
      passed: passFail === 'pass' || passFail === 'passed',
      sampleType: String(r.sample_type ?? ''),
      analystId: r.analyst == null ? null : Number(r.analyst),
      reviewerId: r.reviewed_by == null ? null : Number(r.reviewed_by),
      testDate: recordedDate(r.test_date),
      releaseDate: recordedDate(r.release_date),
      certificateOfAnalysis: r.certificate_of_analysis == null ? null : String(r.certificate_of_analysis),
      recordRevision: r.record_revision == null ? null : String(r.record_revision),
    };
  });
}

/**
 * How many deviations the batch record holds open. The register stores them
 * as `{ open: n }` or as a list of entries with a status; anything else is
 * read as none recorded.
 */
export function openDeviationCount(deviations: unknown): number {
  let d = deviations;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return 0; }
  }
  if (Array.isArray(d)) {
    return d.filter((e) => !/^(closed|resolved|cancell?ed)$/i.test(String((e as { status?: unknown })?.status ?? 'open'))).length;
  }
  const open = Number((d as { open?: unknown } | null)?.open ?? 0);
  return Number.isFinite(open) && open > 0 ? open : 0;
}

/** The disposition the recorded results support, or why they do not support it. */
export function evaluateRecordedRelease(
  decision: ReleaseDecision,
  tests: RecordedReleaseTest[],
  batchNumber: string,
  openDeviations = 0,
): { releaseStatus: ReleaseStatus; allPassed: boolean } | { refusal: string } {
  const allPassed = tests.length > 0 && tests.every((t) => t.passed);
  if (decision === 'rejected') return { releaseStatus: 'rejected', allPassed };
  /* 21 CFR 211.192: a discrepancy is investigated before the batch is
     released. A conditional release states what is outstanding; a full
     release is refused while a deviation is open. */
  if (decision === 'approved' && openDeviations > 0) {
    return {
      refusal:
        `Batch ${batchNumber} has ${openDeviations} open deviation${openDeviations === 1 ? '' : 's'}. ` +
        'Close the investigation before a full release, or sign a conditional release that states it.',
    };
  }
  if (tests.length === 0) {
    return {
      refusal:
        `No QC result is recorded against batch ${batchNumber}. A release is signed over the batch's recorded, ` +
        'reviewed results: record them in QC testing first.',
    };
  }
  const failing = tests.filter((t) => !t.passed);
  if (failing.length > 0) {
    return {
      refusal:
        `${failing.length} recorded result${failing.length === 1 ? '' : 's'} for batch ${batchNumber} ` +
        `${failing.length === 1 ? 'does' : 'do'} not pass (${failing.map((t) => t.sampleId || `QC ${t.qcId}`).join(', ')}). ` +
        'The batch cannot be released; reject it, or investigate the result first.',
    };
  }
  if (decision === 'conditional') return { releaseStatus: 'conditional-release', allPassed };
  const unreviewed = tests.filter((t) => !t.reviewed);
  if (unreviewed.length > 0) {
    return {
      refusal:
        `${unreviewed.length} recorded result${unreviewed.length === 1 ? ' is' : 's are'} not yet reviewed ` +
        `(${unreviewed.map((t) => t.sampleId || `QC ${t.qcId}`).join(', ')}). A full release needs every result ` +
        'reviewed by a second person; a conditional release states what is outstanding.',
    };
  }
  return { releaseStatus: 'released', allPassed };
}

/** What the evaluation read, so the signing transaction can tell if it changed. */
export function evidenceFingerprint(tests: RecordedReleaseTest[]): string {
  // A passing/reviewed flag does not identify the result, its acceptance
  // criterion, attribution or reviewer. This is a transient comparison across
  // reauthentication, not a rewrite of any previously signed digest.
  return createHash('sha256').update(stableStringify(tests), 'utf8').digest('hex');
}
