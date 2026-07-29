/**
 * Invention Disclosure / Technology Transfer service (Capability C2C-25)
 *
 * Tenant-scoped transaction functions for the tech-transfer lifecycle: create a
 * disclosure, edit/transition its status and TTO decision, read the Bayh-Dole
 * compliance picture, and submit behind a deterministic readiness gate. Mutations
 * run inside the caller's transaction with the governed-action ledger.
 *
 * @module server/services/invention-disclosure/invention-disclosure-service
 */

import { pool } from '../../db';
import {
  evaluateBayhDoleCompliance,
  evaluateDisclosureReadiness,
  type BayhDoleComplianceResult,
  type DisclosureReadinessResult,
} from './invention-disclosure-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class InventionDisclosureError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'InventionDisclosureError';
  }
}

const STATUSES = ['submitted', 'under_review', 'elected', 'patent_filed', 'licensed', 'released', 'abandoned'];

export interface DisclosureInput {
  title: string;
  inventors?: string | null;
  fundingSource?: string | null;
  federalFunding?: boolean;
  federalAward?: string | null;
  disclosureDate?: string | null;
  grantProposalId?: number | null;
}

export async function createDisclosureTx(client: Queryable, orgId: number, userId: number, input: DisclosureInput): Promise<{ id: number }> {
  if (!input.title || !input.title.trim()) throw new InventionDisclosureError('BAD_INPUT', 'An invention title is required.');
  const { rows } = await client.query(
    `INSERT INTO invention_disclosures (organization_id, grant_proposal_id, title, inventors, funding_source, federal_funding, federal_award, disclosure_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9) RETURNING id`,
    [orgId, input.grantProposalId ?? null, input.title.trim(), input.inventors ?? null, input.fundingSource ?? null, input.federalFunding === true, input.federalAward ?? null, input.disclosureDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function loadDisclosure(client: Queryable, orgId: number, id: number): Promise<any> {
  const d = await client.query(`SELECT * FROM invention_disclosures WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  if (d.rows.length === 0) throw new InventionDisclosureError('NOT_FOUND', 'Invention disclosure not found for this organization.');
  return d.rows[0];
}

export interface DisclosureUpdateInput {
  status?: string;
  inventors?: string | null;
  fundingSource?: string | null;
  federalFunding?: boolean;
  federalAward?: string | null;
  disclosureDate?: string | null;
  electionDate?: string | null;
  decisionRationale?: string | null;
}

export async function updateDisclosureTx(client: Queryable, orgId: number, userId: number, id: number, input: DisclosureUpdateInput): Promise<void> {
  await loadDisclosure(client, orgId, id);
  if (input.status && !STATUSES.includes(input.status)) throw new InventionDisclosureError('BAD_INPUT', `Invalid status "${input.status}".`);
  const markReviewed = input.status && input.status !== 'submitted';
  await client.query(
    `UPDATE invention_disclosures SET
        status = COALESCE($3, status),
        inventors = COALESCE($4, inventors),
        funding_source = COALESCE($5, funding_source),
        federal_funding = COALESCE($6, federal_funding),
        federal_award = COALESCE($7, federal_award),
        disclosure_date = COALESCE($8, disclosure_date),
        election_date = COALESCE($9, election_date),
        decision_rationale = COALESCE($10, decision_rationale),
        reviewed_by = CASE WHEN $11 THEN $12 ELSE reviewed_by END,
        reviewed_at = CASE WHEN $11 THEN now() ELSE reviewed_at END,
        updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      id, orgId,
      input.status ?? null, input.inventors ?? null, input.fundingSource ?? null,
      typeof input.federalFunding === 'boolean' ? input.federalFunding : null, input.federalAward ?? null,
      input.disclosureDate ?? null, input.electionDate ?? null, input.decisionRationale ?? null,
      Boolean(markReviewed), userId,
    ],
  );
}

/** Read-only Bayh-Dole compliance picture. `asOf` defaults to today (yyyy-mm-dd). */
export async function getCompliance(orgId: number, id: number, asOf?: string): Promise<BayhDoleComplianceResult> {
  const d = await loadDisclosure(pool, orgId, id);
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  return evaluateBayhDoleCompliance({
    federalFunding: d.federal_funding === true,
    disclosureDate: d.disclosure_date ? String(d.disclosure_date).slice(0, 10) : null,
    electionDate: d.election_date ? String(d.election_date).slice(0, 10) : null,
    patentFiled: d.status === 'patent_filed' || d.status === 'licensed',
    asOf: today,
  });
}

/** Read-only submission readiness. */
export async function getReadiness(orgId: number, id: number): Promise<DisclosureReadinessResult> {
  const d = await loadDisclosure(pool, orgId, id);
  return evaluateDisclosureReadiness({
    title: d.title, inventors: d.inventors, fundingSource: d.funding_source,
    federalFunding: d.federal_funding === true, federalAward: d.federal_award,
    disclosureDate: d.disclosure_date ? String(d.disclosure_date).slice(0, 10) : null,
  });
}

/** Submit for TTO review — gated on the deterministic readiness check. */
export async function submitDisclosureTx(client: Queryable, orgId: number, userId: number, id: number): Promise<{ submitted: true; readiness: DisclosureReadinessResult }> {
  const d = await loadDisclosure(client, orgId, id);
  const readiness = evaluateDisclosureReadiness({
    title: d.title, inventors: d.inventors, fundingSource: d.funding_source,
    federalFunding: d.federal_funding === true, federalAward: d.federal_award,
    disclosureDate: d.disclosure_date ? String(d.disclosure_date).slice(0, 10) : null,
  });
  if (!readiness.readyToSubmit) throw new InventionDisclosureError('INVALID_STATE', `Cannot submit — ${readiness.blockers.join(' ')}`);
  await client.query(`UPDATE invention_disclosures SET status = 'under_review', reviewed_by = $3, reviewed_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [id, orgId, userId]);
  return { submitted: true, readiness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDisclosures(orgId: number, opts?: { status?: string; grantProposalId?: number }): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, grant_proposal_id, title, inventors, funding_source, federal_funding, federal_award, disclosure_date, election_date, status, created_at, updated_at
               FROM invention_disclosures WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (opts?.status) { params.push(opts.status); sql += ` AND status = $${params.length}`; }
  if (opts?.grantProposalId != null) { params.push(opts.grantProposalId); sql += ` AND grant_proposal_id = $${params.length}`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getDisclosure(orgId: number, id: number): Promise<any | null> {
  const d = await pool.query(`SELECT * FROM invention_disclosures WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  return d.rows[0] ?? null;
}
