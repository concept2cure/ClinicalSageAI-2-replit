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
 * - released: at least one recorded result, every one reviewed, none failing;
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
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** The QC results recorded against this batch, in its program when it has one. */
export async function readRecordedReleaseTests(
  q: Queryable,
  orgId: number,
  batch: { batch_number?: unknown; project_id?: unknown },
): Promise<RecordedReleaseTest[]> {
  const batchNumber = String(batch.batch_number ?? '').trim();
  if (!batchNumber) return [];
  const projectId = batch.project_id ? String(batch.project_id) : null;
  const { rows } = await q.query(
    `SELECT id, sample_id, test_method, test_results, specifications, pass_fail_status, reviewed_by
       FROM qc_testing
      WHERE organization_id = $1 AND batch_number = $2
        AND ($3::text IS NULL OR project_id = $3::text)
      ORDER BY id`,
    [orgId, batchNumber, projectId],
  );
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
    };
  });
}

/** The disposition the recorded results support, or why they do not support it. */
export function evaluateRecordedRelease(
  decision: ReleaseDecision,
  tests: RecordedReleaseTest[],
  batchNumber: string,
): { releaseStatus: ReleaseStatus; allPassed: boolean } | { refusal: string } {
  const allPassed = tests.length > 0 && tests.every((t) => t.passed);
  if (decision === 'rejected') return { releaseStatus: 'rejected', allPassed };
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
  return tests.map((t) => `${t.qcId}:${t.passFail}:${t.reviewed ? 'r' : '-'}`).join('|');
}
