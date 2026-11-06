/**
 * Pre-submission verdict and its recorded correspondence inputs.
 * The verdict remains pure; only readCorrespondenceBlockerReview accesses
 * the database, loaded on demand. The route combines these inputs with
 * readiness + CMC + CRL/RTF + ICH checks.
 */

export type GateVerdict = 'ready' | 'conditional' | 'hold';

/** Server-read correspondence evidence, never a caller's claim that review passed. */
export interface CorrespondenceBlockerReview {
  status: 'assessed' | 'unavailable';
  checkedIssueCount: number | null;
  blockingIssueIds: string[];
  pendingIssueIds: string[];
  /** No confirmed division-level pattern corpus is connected to this gate. */
  subjectiveFit: 'not_assessed';
}

export interface CorrespondenceBlockerRow {
  id: string;
  blocker: boolean;
  human_review_status: string;
  resolution_status: string;
}

/**
 * Extend the existing human-reviewed issue lifecycle, rather than relabelling
 * agency comments as objective requirements or inventing subjective patterns.
 * An unknown review state is unverified; only a recorded human disposition
 * (rejection, resolution or waiver) removes a blocking issue from this check.
 */
export function reviewCorrespondenceBlockers(rows: readonly CorrespondenceBlockerRow[]): CorrespondenceBlockerReview {
  const blockingIssueIds: string[] = [];
  const pendingIssueIds: string[] = [];
  for (const row of rows) {
    if (!row.blocker || row.human_review_status === 'rejected'
      || row.resolution_status === 'resolved' || row.resolution_status === 'waived') continue;
    if (row.human_review_status === 'confirmed' || row.human_review_status === 'edited') {
      blockingIssueIds.push(row.id);
    } else {
      pendingIssueIds.push(row.id);
    }
  }
  return {
    status: 'assessed', checkedIssueCount: rows.length,
    blockingIssueIds, pendingIssueIds, subjectiveFit: 'not_assessed',
  };
}

/**
 * The persisted issue lifecycle is the authority. Request-supplied risk scores,
 * review results and 'passed' flags are never inputs. Both parents are pinned
 * to this tenant/project; a failed read is an unavailable check, not zero issues.
 * This is a correspondence-blocker check, not a learned clean-file review or
 * an approval of a particular package's bytes.
 */
export async function readCorrespondenceBlockerReview(
  organizationId: number, projectId: number, submissionType: string | null,
): Promise<CorrespondenceBlockerReview> {
  try {
    const { getPool } = await import('../../db.js');
    const pool = getPool();
    if (!pool) throw new Error('Correspondence store unavailable');
    const result = await pool.query<CorrespondenceBlockerRow>(
      `SELECT i.id, i.blocker, i.human_review_status, i.resolution_status
         FROM c2c_correspondence_issues i
         JOIN c2c_correspondence c ON c.id = i.correspondence_id
         JOIN c2c_submissions s ON s.id = c.submission_id
        WHERE c.organization_id = $1 AND c.project_id = $2
          AND s.organization_id = $1 AND s.project_id = $2
          AND c.direction = 'inbound'
          AND ($3::text IS NULL OR LOWER(s.submission_type) = LOWER($3))
        ORDER BY i.id`,
      [organizationId, projectId, submissionType],
    );
    return reviewCorrespondenceBlockers(result.rows);
  } catch {
    // No source text or database error enters the report or model context.
    return {
      status: 'unavailable', checkedIssueCount: null,
      blockingIssueIds: [], pendingIssueIds: [], subjectiveFit: 'not_assessed',
    };
  }
}

export interface GateVerdictInput {
  readinessStatus: string;
  readinessScore: number;
  readinessBlockers: Array<{ severity: string }>;
  /** A level, or 'not_assessed' when nothing assessed it. */
  crlRisk: string;
  rtfRisk: string;
  cmcOpenCritical: number;
  /**
   * `'incomplete'` means the ICH check COULD NOT RUN — not that it passed.
   *
   * It was added when the Module 3 stability reads were fixed: those queries
   * targeted columns the provisioned table does not have, failed every time,
   * and were swallowed into `[]`, so the checker reported "no stability
   * studies recorded" with an evidence string it had never obtained. The
   * checker now says `incomplete` instead of inventing a clean result, and
   * this gate has to honour that distinction or the fabrication just moves
   * one level up.
   */
  ichStatus?: 'compliant' | 'warnings' | 'non_compliant' | 'incomplete';
  ichFailCount: number;
  correspondenceReview?: CorrespondenceBlockerReview;
}

export interface GateVerdictResult {
  verdict: GateVerdict;
  rationale: string[];
}

export function deriveVerdict(input: GateVerdictInput): GateVerdictResult {
  const rationale: string[] = [];
  let verdict: GateVerdict = 'ready';

  const hasCriticalReadiness = input.readinessBlockers.some(b => b.severity === 'critical');
  if (hasCriticalReadiness) {
    verdict = 'hold';
    rationale.push('Readiness has critical blockers');
  }

  if (input.cmcOpenCritical > 0) {
    verdict = 'hold';
    rationale.push(`${input.cmcOpenCritical} open critical CMC contradiction(s)`);
  }

  if (input.crlRisk === 'critical' || input.rtfRisk === 'critical') {
    verdict = 'hold';
    if (input.crlRisk === 'critical') rationale.push('CRL risk is critical');
    if (input.rtfRisk === 'critical') rationale.push('RTF risk is critical');
  }

  if (input.ichStatus === 'non_compliant') {
    verdict = 'hold';
    rationale.push(`ICH compliance non-compliant (${input.ichFailCount} failing finding(s))`);
  }

  const correspondence = input.correspondenceReview;
  if (correspondence?.status === 'unavailable') {
    verdict = 'hold';
    rationale.push('Correspondence blockers could not be read — review is unverified');
  } else if (correspondence && correspondence.blockingIssueIds.length > 0) {
    verdict = 'hold';
    rationale.push(`${correspondence.blockingIssueIds.length} unresolved human-confirmed correspondence blocker(s)`);
  }

  if (verdict !== 'hold') {
    // An ICH check that could not evaluate must never read as one that passed.
    // `conditional` is the honest floor: not a hold, because nothing has been
    // shown to be wrong — but not `ready`, because nothing has been shown to
    // be right either.
    const moderateRisk = input.crlRisk === 'high' || input.rtfRisk === 'high'
      || input.readinessScore < 70 || input.readinessStatus === 'needs_attention'
      || input.ichStatus === 'warnings' || input.ichStatus === 'incomplete'
      || (correspondence?.pendingIssueIds.length ?? 0) > 0;
    if (moderateRisk) {
      verdict = 'conditional';
      if (input.crlRisk === 'high') rationale.push('CRL risk is high');
      if (input.rtfRisk === 'high') rationale.push('RTF risk is high');
      if (input.readinessScore < 70) rationale.push(`Readiness score is ${input.readinessScore} (<70)`);
      if (input.ichStatus === 'warnings') rationale.push('ICH compliance has warnings');
      if (input.ichStatus === 'incomplete') {
        rationale.push('ICH compliance could not be evaluated — treat as unverified, not as passing');
      }
      if (correspondence && correspondence.pendingIssueIds.length > 0) {
        rationale.push(`${correspondence.pendingIssueIds.length} potential correspondence blocker(s) await human review`);
      }
    }
  }

  if (verdict === 'ready') rationale.push(readyRationale(input));

  return { verdict, rationale };
}

/**
 * What a 'ready' verdict rests on, and what it does not. It said "CRL/RTF
 * risk acceptable, ICH compliance clean" whatever was assessed — over CRL/RTF
 * nobody assessed and an ICH check that never ran (2026-10-15).
 */
function readyRationale(input: GateVerdictInput): string {
  const crl = input.crlRisk !== 'not_assessed';
  const rtf = input.rtfRisk !== 'not_assessed';
  const risk = crl && rtf ? 'CRL/RTF risk' : crl ? 'CRL risk' : rtf ? 'RTF risk' : null;
  const unassessedRisk = !crl && !rtf ? 'CRL/RTF risk' : !crl ? 'CRL risk' : !rtf ? 'RTF risk' : null;
  const clean = ['Readiness on track', 'no critical blockers'];
  if (risk) clean.push(`${risk} acceptable`);
  if (input.ichStatus === 'compliant') clean.push('ICH compliance clean');
  const unassessed = [unassessedRisk, input.ichStatus === undefined ? 'ICH compliance (no CMC project linked)' : null]
    .filter((x): x is string => x !== null);
  return clean.join(', ') + (unassessed.length > 0 ? `; not assessed: ${unassessed.join(', ')}` : '');
}
