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
}

export async function createSubmissionTx(client: Queryable, orgId: number, userId: number, input: IrbSubmissionInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO irb_submissions
       (organization_id, study_id, submission_id, protocol_number, title, risk_level,
        involves_vulnerable_populations, vulnerable_population_protections, is_single_irb, consent_waiver_requested, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11) RETURNING id`,
    [orgId, input.studyId ?? null, input.submissionId ?? null, input.protocolNumber, input.title, input.riskLevel,
      input.involvesVulnerablePopulations === true, input.vulnerablePopulationProtections ?? null,
      input.isSingleIrb === true, input.consentWaiverRequested === true, userId],
  );
  return { id: Number(rows[0].id) };
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
