/**
 * IACUC service (Capability C2C-05)
 *
 * Tenant-scoped transaction functions over iacuc_protocols / iacuc_animal_cohorts
 * / iacuc_reviews / iacuc_amendments / iacuc_facility_inspections. Mutations run
 * inside the caller's transaction with the governed-action ledger. Approving a
 * protocol sets the 3-year de novo expiration and, when the protocol feeds a
 * submission, threads the provenance link iacuc_protocol → submission_module4
 * ('supports') — the origin node of the preclinical provenance chain.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/iacuc/iacuc-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import { addYears } from './iacuc-logic';
import type { UsdaPainCategory, IacucReviewType } from '../../../shared/schema/iacuc';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class IacucError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'IacucError';
  }
}

// ─── Protocols ───────────────────────────────────────────────────────────────

export interface ProtocolInput {
  protocolNumber: string;
  title: string;
  painCategory: UsdaPainCategory;
  submissionId?: number | null;
  threeRsReplacement?: string | null;
  threeRsReduction?: string | null;
  threeRsRefinement?: string | null;
  painJustification?: string | null;
}

export async function createProtocolTx(client: Queryable, orgId: number, userId: number, input: ProtocolInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO iacuc_protocols
       (organization_id, submission_id, protocol_number, title, pain_category, status,
        three_rs_replacement, three_rs_reduction, three_rs_refinement, pain_justification, created_by)
     VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10) RETURNING id`,
    [orgId, input.submissionId ?? null, input.protocolNumber, input.title, input.painCategory,
      input.threeRsReplacement ?? null, input.threeRsReduction ?? null, input.threeRsRefinement ?? null, input.painJustification ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function getProtocol(client: Queryable, orgId: number, id: number): Promise<any> {
  const { rows } = await client.query(
    `SELECT * FROM iacuc_protocols WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, orgId],
  );
  if (rows.length === 0) throw new IacucError('NOT_FOUND', 'Protocol not found for this organization.');
  return rows[0];
}

const STATUSES = ['draft', 'submitted', 'dmr', 'fcr', 'approved', 'conditional', 'tabled', 'withdrawn', 'expired'];

export async function setProtocolStatusTx(client: Queryable, orgId: number, id: number, status: string, reviewType?: IacucReviewType): Promise<void> {
  if (!STATUSES.includes(status)) throw new IacucError('BAD_INPUT', `Invalid status "${status}".`);
  await getProtocol(client, orgId, id);
  const r = await client.query(
    `UPDATE iacuc_protocols SET status = $3, review_type = COALESCE($4, review_type), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, reviewType ?? null],
  );
  if ((r as any).rowCount === 0) throw new IacucError('NOT_FOUND', 'Protocol not found for this organization.');
}

/**
 * Record a committee determination. An `approved` outcome stamps the approval
 * date, computes the 3-year de novo expiration, flips the protocol to approved,
 * and (when it feeds a submission) threads the provenance link to Module 4.
 */
export async function recordReviewTx(
  client: Queryable,
  orgId: number,
  userId: number,
  protocolId: number,
  input: { reviewType: IacucReviewType; reviewerCount?: number; outcome: 'approved' | 'conditional' | 'tabled' | 'withdrawn'; conditions?: string | null; determinationDate?: string | null },
): Promise<{ reviewId: number; expirationDate: string | null; provenanceLinkId: number | null }> {
  const protocol = await getProtocol(client, orgId, protocolId);
  const determinationDate = input.determinationDate ?? new Date().toISOString().slice(0, 10);
  const { rows } = await client.query(
    `INSERT INTO iacuc_reviews (organization_id, protocol_id, review_type, reviewer_count, outcome, conditions, determination_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orgId, protocolId, input.reviewType, input.reviewerCount ?? 1, input.outcome, input.conditions ?? null, determinationDate, userId],
  );
  const reviewId = Number(rows[0].id);

  let expirationDate: string | null = null;
  let provenanceLinkId: number | null = null;
  if (input.outcome === 'approved') {
    expirationDate = addYears(determinationDate, 3);
    await client.query(
      `UPDATE iacuc_protocols SET status = 'approved', review_type = $3, approval_date = $4, expiration_date = $5, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [protocolId, orgId, input.reviewType, determinationDate, expirationDate],
    );
    if (protocol.submission_id != null) {
      const link = await linkProvenanceTx(client, {
        organizationId: orgId, userId, sourceType: 'iacuc_protocol', sourceId: protocolId,
        targetType: 'submission_module4', targetId: Number(protocol.submission_id), linkRole: 'supports',
      });
      provenanceLinkId = link.id;
    }
  } else if (input.outcome === 'conditional') {
    await client.query(
      `UPDATE iacuc_protocols SET status = 'conditional', review_type = $3, updated_at = now() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [protocolId, orgId, input.reviewType],
    );
  }
  return { reviewId, expirationDate, provenanceLinkId };
}

// ─── Cohorts ─────────────────────────────────────────────────────────────────

export interface CohortInput {
  species: string;
  strain?: string | null;
  plannedCount: number;
  painCategory: UsdaPainCategory;
  housingLocation?: string | null;
}

export async function addCohortTx(client: Queryable, orgId: number, userId: number, protocolId: number, input: CohortInput): Promise<{ id: number }> {
  await getProtocol(client, orgId, protocolId);
  const { rows } = await client.query(
    `INSERT INTO iacuc_animal_cohorts (organization_id, protocol_id, species, strain, planned_count, pain_category, housing_location, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'requested',$8) RETURNING id`,
    [orgId, protocolId, input.species, input.strain ?? null, input.plannedCount, input.painCategory, input.housingLocation ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Amendments ──────────────────────────────────────────────────────────────

export async function addAmendmentTx(client: Queryable, orgId: number, userId: number, protocolId: number, input: { description: string; significant: boolean }): Promise<{ id: number }> {
  await getProtocol(client, orgId, protocolId);
  const { rows } = await client.query(
    `INSERT INTO iacuc_amendments (organization_id, protocol_id, description, significant, status, created_by)
     VALUES ($1,$2,$3,$4,'submitted',$5) RETURNING id`,
    [orgId, protocolId, input.description, input.significant, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listProtocols(orgId: number, submissionId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, submission_id, protocol_number, title, pain_category, review_type, status, approval_date, expiration_date
               FROM iacuc_protocols WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND submission_id = $2`; }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getProtocolCompletenessInput(client: Queryable, orgId: number, id: number): Promise<{
  painCategory: UsdaPainCategory;
  threeRsReplacement: string | null;
  threeRsReduction: string | null;
  threeRsRefinement: string | null;
  painJustification: string | null;
  speciesCount: number;
  plannedAnimalTotal: number;
  approvalDate: string | null;
}> {
  const p = await getProtocol(client, orgId, id);
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS species_count, COALESCE(SUM(planned_count),0)::int AS planned_total
       FROM iacuc_animal_cohorts WHERE protocol_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return {
    painCategory: p.pain_category,
    threeRsReplacement: p.three_rs_replacement,
    threeRsReduction: p.three_rs_reduction,
    threeRsRefinement: p.three_rs_refinement,
    painJustification: p.pain_justification,
    speciesCount: Number(rows[0].species_count),
    plannedAnimalTotal: Number(rows[0].planned_total),
    approvalDate: p.approval_date,
  };
}
