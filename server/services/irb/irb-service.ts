/**
 * IRB service (Capability C2C-06)
 *
 * Tenant-scoped transaction functions over irb_submissions / irb_sites /
 * irb_consent_documents / irb_reviews / irb_amendments / irb_reportable_events.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 * An `approved` determination sets the continuing-review expiration (full board)
 * and threads the provenance link irb_submission → submission_module5
 * ('supports') — ethics approval woven into the clinical conduct record.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/irb/irb-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import { continuingReviewStatus } from './irb-logic';
import type { IrbReviewType, IrbRiskLevel, ReportableEventType } from '../../../shared/schema/irb';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class IrbError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'IrbError';
  }
}

// ─── Submissions ─────────────────────────────────────────────────────────────

export interface IrbSubmissionInput {
  protocolNumber: string;
  title: string;
  riskLevel: IrbRiskLevel;
  studyId?: number | null;
  submissionId?: number | null;
  involvesVulnerablePopulations?: boolean;
  vulnerablePopulationProtections?: string | null;
  isSingleIrb?: boolean;
  consentWaiverRequested?: boolean;
  /*
   * The four package-manifest facts. TRI-STATE, and typed as such: `true`,
   * `false` and absent/null are three different answers, and absent must not
   * be written as `false`. See `package-manifest.ts` and the column comments
   * in `migrations/20260922d_irb_submission_context.sql`.
   */
  /** Subpart D. Absent/null means NOT RECORDED, not "no children". */
  involvesChildren?: boolean | null;
  /** 21 CFR 312. Absent/null means NOT RECORDED. Gates the 1572 and the disclosure. */
  isIndStudy?: boolean | null;
  /** HIPAA. Absent/null means NOT RECORDED, not "no PHI". */
  usesPhi?: boolean | null;
  /** 21 CFR 56.111(a)(3). Absent/null means NOT RECORDED. */
  usesRecruitmentMaterial?: boolean | null;
}

/**
 * Normalize a tri-state fact for the INSERT.
 *
 * `?? null` and nothing else. The `x === true` coercion used by the siblings
 * on this row is WRONG for these four: it maps both `false` and absent onto
 * `false`, which writes "the sponsor said no" into a column nobody filled in
 * and takes Form FDA 1572 out of a board's package. Absent stays NULL, and
 * NULL reads back as `undetermined`.
 */
function recordedFact(v: boolean | null | undefined): boolean | null {
  return v ?? null;
}

export async function createSubmissionTx(client: Queryable, orgId: number, userId: number, input: IrbSubmissionInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO irb_submissions
       (organization_id, study_id, submission_id, protocol_number, title, risk_level,
        involves_vulnerable_populations, vulnerable_population_protections, is_single_irb, consent_waiver_requested,
        involves_children, is_ind_study, uses_phi, uses_recruitment_material, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15) RETURNING id`,
    [orgId, input.studyId ?? null, input.submissionId ?? null, input.protocolNumber, input.title, input.riskLevel,
      input.involvesVulnerablePopulations === true, input.vulnerablePopulationProtections ?? null,
      input.isSingleIrb === true, input.consentWaiverRequested === true,
      recordedFact(input.involvesChildren), recordedFact(input.isIndStudy),
      recordedFact(input.usesPhi), recordedFact(input.usesRecruitmentMaterial), userId],
  );
  return { id: Number(rows[0].id) };
}

/**
 * The four package-manifest facts, by DB column, in one place.
 *
 * `createSubmissionTx` and `setSubmissionContextTx` both write them and the
 * route validates them; a fifth fact added in one place and forgotten in
 * another is the bug this list exists to make impossible.
 */
export const IRB_CONTEXT_FIELDS = [
  ['involvesChildren', 'involves_children'],
  ['isIndStudy', 'is_ind_study'],
  ['usesPhi', 'uses_phi'],
  ['usesRecruitmentMaterial', 'uses_recruitment_material'],
] as const;

export type IrbContextField = (typeof IRB_CONTEXT_FIELDS)[number][0];

/**
 * Record (or un-record) the facts the package manifest gates on.
 *
 * A field ABSENT from `input` is left exactly as it was — this is a patch, not
 * a replace, and an unmentioned fact must not be reset. A field present as
 * `null` is an explicit retraction back to NOT RECORDED, which is a legitimate
 * thing for a sponsor to do when an answer turns out to have been wrong; the
 * manifest then goes back to `undetermined` rather than keeping a stale claim.
 *
 * Returns the fields actually written, so the governed-action payload records
 * what changed rather than what was offered.
 */
export async function setSubmissionContextTx(
  client: Queryable,
  orgId: number,
  id: number,
  input: Partial<Record<IrbContextField, boolean | null>>,
): Promise<{ id: number; recorded: Partial<Record<IrbContextField, boolean | null>> }> {
  await getSubmission(client, orgId, id);

  const sets: string[] = [];
  const params: unknown[] = [id, orgId];
  const recorded: Partial<Record<IrbContextField, boolean | null>> = {};
  for (const [key, column] of IRB_CONTEXT_FIELDS) {
    if (!(key in input)) continue;
    const value = input[key] ?? null;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
    recorded[key] = value;
  }
  if (sets.length === 0) throw new IrbError('BAD_INPUT', 'Record at least one of involvesChildren, isIndStudy, usesPhi or usesRecruitmentMaterial.');

  await client.query(
    `UPDATE irb_submissions SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    params,
  );
  return { id, recorded };
}

async function getSubmission(client: Queryable, orgId: number, id: number): Promise<any> {
  const { rows } = await client.query(
    `SELECT * FROM irb_submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, orgId],
  );
  if (rows.length === 0) throw new IrbError('NOT_FOUND', 'IRB submission not found for this organization.');
  return rows[0];
}

const STATUSES = ['draft', 'submitted', 'under_review', 'modifications_required', 'approved', 'deferred', 'disapproved', 'suspended', 'closed', 'expired'];

export async function setSubmissionStatusTx(client: Queryable, orgId: number, id: number, status: string): Promise<void> {
  if (!STATUSES.includes(status)) throw new IrbError('BAD_INPUT', `Invalid status "${status}".`);
  await getSubmission(client, orgId, id);
  await client.query(
    `UPDATE irb_submissions SET status = $3, updated_at = now() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status],
  );
}

/**
 * Record a determination. `approved` flips the submission to approved, stamps the
 * approval date + continuing-review expiration (full board only), and threads the
 * provenance link to Module 5 when the submission feeds a regulatory filing.
 */
export async function recordReviewTx(
  client: Queryable,
  orgId: number,
  userId: number,
  submissionId: number,
  input: { reviewType: IrbReviewType; outcome: 'approved' | 'modifications_required' | 'deferred' | 'disapproved'; conditions?: string | null; determinationDate?: string | null },
): Promise<{ reviewId: number; expirationDate: string | null; provenanceLinkId: number | null }> {
  const submission = await getSubmission(client, orgId, submissionId);
  const determinationDate = input.determinationDate ?? new Date().toISOString().slice(0, 10);
  const { rows } = await client.query(
    `INSERT INTO irb_reviews (organization_id, irb_submission_id, review_type, outcome, conditions, determination_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, submissionId, input.reviewType, input.outcome, input.conditions ?? null, determinationDate, userId],
  );
  const reviewId = Number(rows[0].id);

  let expirationDate: string | null = null;
  let provenanceLinkId: number | null = null;
  if (input.outcome === 'approved') {
    const cr = continuingReviewStatus(input.reviewType, determinationDate, determinationDate);
    expirationDate = cr.expirationDate;
    await client.query(
      `UPDATE irb_submissions SET status = 'approved', review_type = $3, approval_date = $4, expiration_date = $5, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [submissionId, orgId, input.reviewType, determinationDate, expirationDate],
    );
    if (submission.submission_id != null) {
      const link = await linkProvenanceTx(client, {
        organizationId: orgId, userId, sourceType: 'irb_submission', sourceId: submissionId,
        targetType: 'submission_module5', targetId: Number(submission.submission_id), linkRole: 'supports',
      });
      provenanceLinkId = link.id;
    }
  } else if (input.outcome === 'modifications_required') {
    await client.query(
      `UPDATE irb_submissions SET status = 'modifications_required', review_type = $3, updated_at = now() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [submissionId, orgId, input.reviewType],
    );
  }
  return { reviewId, expirationDate, provenanceLinkId };
}

// ─── Sites / consent / amendments / events ───────────────────────────────────

export async function addSiteTx(client: Queryable, orgId: number, userId: number, submissionId: number, input: { siteName: string; principalInvestigator?: string | null; localContext?: string | null }): Promise<{ id: number }> {
  await getSubmission(client, orgId, submissionId);
  const { rows } = await client.query(
    `INSERT INTO irb_sites (organization_id, irb_submission_id, site_name, principal_investigator, local_context, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
    [orgId, submissionId, input.siteName, input.principalInvestigator ?? null, input.localContext ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function addConsentDocumentTx(client: Queryable, orgId: number, userId: number, submissionId: number, input: { documentName: string; version?: string }): Promise<{ id: number }> {
  await getSubmission(client, orgId, submissionId);
  const { rows } = await client.query(
    `INSERT INTO irb_consent_documents (organization_id, irb_submission_id, document_name, version, status, created_by)
     VALUES ($1,$2,$3,$4,'draft',$5) RETURNING id`,
    [orgId, submissionId, input.documentName, input.version ?? '1.0', userId],
  );
  return { id: Number(rows[0].id) };
}

export async function addAmendmentTx(client: Queryable, orgId: number, userId: number, submissionId: number, input: { description: string; substantive: boolean }): Promise<{ id: number }> {
  await getSubmission(client, orgId, submissionId);
  const { rows } = await client.query(
    `INSERT INTO irb_amendments (organization_id, irb_submission_id, description, substantive, status, created_by)
     VALUES ($1,$2,$3,$4,'submitted',$5) RETURNING id`,
    [orgId, submissionId, input.description, input.substantive, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function addReportableEventTx(client: Queryable, orgId: number, userId: number, submissionId: number, input: { eventType: ReportableEventType; description: string; reportedDate?: string | null }): Promise<{ id: number }> {
  await getSubmission(client, orgId, submissionId);
  const { rows } = await client.query(
    `INSERT INTO irb_reportable_events (organization_id, irb_submission_id, event_type, description, reported_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'reported',$6) RETURNING id`,
    [orgId, submissionId, input.eventType, input.description, input.reportedDate ?? new Date().toISOString().slice(0, 10), userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listSubmissions(orgId: number, submissionId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, study_id, submission_id, protocol_number, title, review_type, risk_level, is_single_irb, status, approval_date, expiration_date
               FROM irb_submissions WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND submission_id = $2`; }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getCompletenessInput(client: Queryable, orgId: number, id: number): Promise<{
  riskLevel: IrbRiskLevel;
  reviewType: IrbReviewType | null;
  involvesVulnerablePopulations: boolean;
  vulnerablePopulationProtections: string | null;
  isSingleIrb: boolean;
  consentWaiverRequested: boolean;
  approvedConsentCount: number;
  siteCount: number;
  approvalDate: string | null;
}> {
  const s = await getSubmission(client, orgId, id);
  const { rows: cc } = await client.query(
    `SELECT COUNT(*)::int AS n FROM irb_consent_documents WHERE irb_submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status IN ('draft','approved')`,
    [id, orgId],
  );
  const { rows: sc } = await client.query(
    `SELECT COUNT(*)::int AS n FROM irb_sites WHERE irb_submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return {
    riskLevel: s.risk_level,
    reviewType: s.review_type,
    involvesVulnerablePopulations: s.involves_vulnerable_populations,
    vulnerablePopulationProtections: s.vulnerable_population_protections,
    isSingleIrb: s.is_single_irb,
    consentWaiverRequested: s.consent_waiver_requested,
    approvedConsentCount: Number(cc[0].n),
    siteCount: Number(sc[0].n),
    approvalDate: s.approval_date,
  };
}

// ─── Package manifest (IRB_SUBMISSION.md step 3) ─────────────────────────────

/**
 * What this IRB submission's package would contain, and what it is missing.
 *
 * Reads the leaves placed at IRB slots on the sequences of the Submission
 * Center submission this IRB submission is linked to (D1: an IRB submission is
 * a submission, not a parallel stack). The `submission_id` foreign key that has
 * been on `irb_submissions` since it was written is what makes that reachable.
 *
 * Read-only and tenant-scoped on both sides. Computes nothing itself: the
 * requirements and the readiness verdict come from `buildPackageManifest`.
 *
 * `linkedSubmissionId: null` is reported as its own fact. An IRB submission
 * that has not been linked to the Submission Center has no package to inspect,
 * which is a different thing from a package with nothing in it, and a surface
 * must not render the two the same way.
 */
export async function getPackageManifest(
  orgId: number,
  irbSubmissionId: number,
): Promise<{
  irbSubmissionId: number;
  linkedSubmissionId: number | null;
  manifest: import('./package-manifest').PackageManifest;
}> {
  const { rows } = await pool.query(
    `SELECT id, submission_id, risk_level, review_type, involves_vulnerable_populations, consent_waiver_requested,
            involves_children, is_ind_study, uses_phi, uses_recruitment_material
       FROM irb_submissions
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [irbSubmissionId, orgId],
  );
  if (rows.length === 0) throw new IrbError('NOT_FOUND', 'IRB submission not found for this organization.');
  const s = rows[0];
  const linkedSubmissionId = s.submission_id == null ? null : Number(s.submission_id);

  const { buildPackageManifest } = await import('./package-manifest');
  const placed = linkedSubmissionId === null ? [] : await loadIrbPlacements(orgId, linkedSubmissionId);

  return {
    irbSubmissionId,
    linkedSubmissionId,
    manifest: buildPackageManifest(
      {
        riskLevel: s.risk_level ?? null,
        reviewType: s.review_type ?? null,
        involvesVulnerablePopulations: s.involves_vulnerable_populations ?? null,
        consentWaiverRequested: s.consent_waiver_requested ?? null,
        /* The four tri-state facts, passed through UNCOERCED.
           `migrations/20260922d_irb_submission_context.sql` made them
           recordable; the reader's only job is not to flatten them. `?? null`
           is the whole contract: true and false are recorded answers the
           manifest acts on, and NULL — a row nobody has answered, including
           every row that predates that migration — stays NULL so the
           requirement reports `undetermined` and names the field that would
           settle it. A `Boolean(...)` or `=== true` here would read an
           unanswered column as "this study does not run under an IND", a claim
           nobody made and the one a board would be misled by. */
        involvesChildren: s.involves_children ?? null,
        isIndStudy: s.is_ind_study ?? null,
        usesPhi: s.uses_phi ?? null,
        usesRecruitmentMaterial: s.uses_recruitment_material ?? null,
      },
      placed,
    ),
  };
}

/**
 * The leaves placed at IRB slots across this submission's sequences.
 *
 * `resolvable` mirrors what the leaf-document resolver needs: a document table
 * plus a key in the right space. A leaf naming neither is a placeholder, and
 * the manifest refuses to count it as satisfying a slot.
 */
async function loadIrbPlacements(
  orgId: number,
  submissionId: number,
): Promise<import('./package-manifest').PlacedArtifact[]> {
  const { rows } = await pool.query(
    `SELECT l.id, l.section_code, l.title, l.document_table, l.document_id, l.document_uuid
       FROM submission_leaves l
       JOIN ectd_sequences q ON q.id = l.sequence_id
      WHERE q.submission_id = $1
        AND q.organization_id = $2
        AND q.deleted_at IS NULL
        AND l.deleted_at IS NULL
        AND l.section_code LIKE 'irb.%'
      ORDER BY l.id`,
    [submissionId, orgId],
  );
  return rows.map((r: Record<string, unknown>) => ({
    slot: String(r.section_code),
    leafId: Number(r.id),
    title: String(r.title ?? ''),
    resolvable: Boolean(r.document_table) && (r.document_id != null || r.document_uuid != null),
  }));
}

// ─── Approval lifecycle (IRB_SUBMISSION.md step 5) ───────────────────────────

/**
 * The submission's approval lifecycle, from the record.
 *
 * Reads the submission, its amendments and its reportable events, and hands
 * them to `lifecycleStatus`. Computes nothing itself.
 *
 * `today` is passed IN. The engine has no clock by design — a date at the edge
 * of the system is testable and a date buried in an engine is not — so the
 * caller supplies it and a caller may supply a different one to ask what will
 * be true on a given date.
 *
 * The amendment and event lists are passed as real arrays, never omitted:
 * `lifecycleStatus` treats an ABSENT list as "not assessed" rather than as
 * "none", and here they genuinely were read.
 */
export async function getLifecycleStatus(
  orgId: number,
  id: number,
  today: string,
): Promise<{ irbSubmissionId: number; status: import('./lifecycle').LifecycleStatus }> {
  const { rows } = await pool.query(
    `SELECT id, status, review_type, approval_date, expiration_date
       FROM irb_submissions
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [id, orgId],
  );
  if (rows.length === 0) throw new IrbError('NOT_FOUND', 'IRB submission not found for this organization.');
  const s = rows[0];

  const [amendments, events] = await Promise.all([
    pool.query(
      `SELECT id, substantive, status FROM irb_amendments
        WHERE irb_submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
      [id, orgId],
    ),
    pool.query(
      `SELECT id, event_type, status, reported_date FROM irb_reportable_events
        WHERE irb_submission_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
      [id, orgId],
    ),
  ]);

  const { lifecycleStatus } = await import('./lifecycle');
  return {
    irbSubmissionId: id,
    status: lifecycleStatus({
      status: String(s.status ?? ''),
      reviewType: s.review_type ?? null,
      approvalDate: isoDate(s.approval_date),
      expirationDate: isoDate(s.expiration_date),
      today,
      amendments: amendments.rows.map((a: Record<string, unknown>) => ({
        id: Number(a.id),
        substantive: a.substantive === true,
        status: String(a.status ?? ''),
        /* irb_amendments has no protocol_amendment_id column, so the trace
           from an IRB amendment back to the protocol amendment it came from
           does not exist yet. Passing null reports that honestly (IRB-LC-012)
           rather than passing an id we do not have. */
        protocolAmendmentId: null,
      })),
      reportableEvents: events.rows.map((e: Record<string, unknown>) => ({
        id: Number(e.id),
        eventType: String(e.event_type ?? ''),
        status: String(e.status ?? ''),
        reportedDate: isoDate(e.reported_date),
      })),
    }),
  };
}

/** A date column as an ISO day string, or null. Never a fabricated date. */
function isoDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10) || null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}
