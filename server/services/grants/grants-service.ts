/**
 * eGrants service (Capability C2C-14)
 *
 * Tenant-scoped transaction functions across the grant lifecycle: opportunities,
 * proposals, awards, milestones, invoices. Mutations run inside the caller's
 * transaction with the governed-action ledger. Recording an award from a proposal
 * threads the provenance link grant_proposal → grant_award ('results_in') —
 * preserving the pre-award → post-award thread (the ISU continuity need).
 *
 * NOTE (tasking): milestone/reporting deadlines are the natural feed for the
 * central unified_tasks system; wiring that requires registering a 'Grants'
 * moduleType in unifiedTaskService's MODULE_CONFIG (documented in the handoff).
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/grants/grants-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import type { FundingAgency, FundingMechanism, MilestoneType } from '../../../shared/schema/grants';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class GrantsError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'GrantsError';
  }
}

// ─── Opportunities ───────────────────────────────────────────────────────────

export interface OpportunityInput {
  opportunityNumber: string;
  title: string;
  fundingAgency: FundingAgency;
  mechanism?: FundingMechanism | null;
  externalId?: string | null;
  dueDate?: string | null;
  ceilingAmount?: string | number | null;
}

export async function createOpportunityTx(client: Queryable, orgId: number, userId: number, input: OpportunityInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO grant_opportunities (organization_id, opportunity_number, title, funding_agency, mechanism, external_id, due_date, ceiling_amount, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9) RETURNING id`,
    [orgId, input.opportunityNumber, input.title, input.fundingAgency, input.mechanism ?? null, input.externalId ?? null, input.dueDate ?? null, input.ceilingAmount ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Proposals ───────────────────────────────────────────────────────────────

export interface ProposalInput {
  title: string;
  opportunityId?: number | null;
  projectId?: number | null;
  principalInvestigator?: string | null;
  requestedAmount?: string | number | null;
}

export async function createProposalTx(client: Queryable, orgId: number, userId: number, input: ProposalInput): Promise<{ id: number }> {
  if (input.opportunityId != null) {
    const o = await client.query(`SELECT id FROM grant_opportunities WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.opportunityId, orgId]);
    if (o.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Opportunity not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO grant_proposals (organization_id, opportunity_id, project_id, title, principal_investigator, requested_amount, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [orgId, input.opportunityId ?? null, input.projectId ?? null, input.title, input.principalInvestigator ?? null, input.requestedAmount ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

const PROPOSAL_STATUSES = ['draft', 'internal_review', 'submitted', 'awarded', 'declined', 'withdrawn'];
export async function setProposalStatusTx(client: Queryable, orgId: number, id: number, status: string, submittedDate?: string | null): Promise<void> {
  if (!PROPOSAL_STATUSES.includes(status)) throw new GrantsError('BAD_INPUT', `Invalid status "${status}".`);
  const r = await client.query(
    `UPDATE grant_proposals SET status = $3, submitted_date = COALESCE($4, submitted_date), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, status === 'submitted' ? (submittedDate ?? new Date().toISOString().slice(0, 10)) : submittedDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new GrantsError('NOT_FOUND', 'Proposal not found for this organization.');
}

// ─── Awards ──────────────────────────────────────────────────────────────────

export interface AwardInput {
  awardNumber: string;
  fundingAgency: FundingAgency;
  proposalId?: number | null;
  projectId?: number | null;
  totalAmount?: string | number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

/** Record an award. When it derives from a proposal, marks the proposal awarded and threads provenance. */
export async function createAwardTx(client: Queryable, orgId: number, userId: number, input: AwardInput): Promise<{ id: number; provenanceLinkId: number | null }> {
  let projectId = input.projectId ?? null;
  if (input.proposalId != null) {
    const p = await client.query(`SELECT id, project_id FROM grant_proposals WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.proposalId, orgId]);
    if (p.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Proposal not found for this organization.');
    if (projectId == null) projectId = p.rows[0].project_id ?? null;
  }
  const { rows } = await client.query(
    `INSERT INTO grant_awards (organization_id, proposal_id, project_id, award_number, funding_agency, total_amount, period_start, period_end, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9) RETURNING id`,
    [orgId, input.proposalId ?? null, projectId, input.awardNumber, input.fundingAgency, input.totalAmount ?? null, input.periodStart ?? null, input.periodEnd ?? null, userId],
  );
  const id = Number(rows[0].id);

  let provenanceLinkId: number | null = null;
  if (input.proposalId != null) {
    await client.query(`UPDATE grant_proposals SET status = 'awarded', updated_at = now() WHERE id = $1 AND organization_id = $2`, [input.proposalId, orgId]);
    const link = await linkProvenanceTx(client, { organizationId: orgId, userId, sourceType: 'grant_proposal', sourceId: input.proposalId, targetType: 'grant_award', targetId: id, linkRole: 'results_in' });
    provenanceLinkId = link.id;
  }
  return { id, provenanceLinkId };
}

// ─── Milestones & invoices ───────────────────────────────────────────────────

async function assertAward(client: Queryable, orgId: number, awardId: number): Promise<void> {
  const a = await client.query(`SELECT id FROM grant_awards WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [awardId, orgId]);
  if (a.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Award not found for this organization.');
}

export async function addMilestoneTx(client: Queryable, orgId: number, userId: number, awardId: number, input: { title: string; milestoneType: MilestoneType; dueDate?: string | null }): Promise<{ id: number }> {
  await assertAward(client, orgId, awardId);
  const { rows } = await client.query(
    `INSERT INTO grant_milestones (organization_id, award_id, title, milestone_type, due_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
    [orgId, awardId, input.title, input.milestoneType, input.dueDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function createInvoiceTx(client: Queryable, orgId: number, userId: number, awardId: number, input: { invoiceNumber: string; amount: string | number; periodStart?: string | null; periodEnd?: string | null }): Promise<{ id: number }> {
  await assertAward(client, orgId, awardId);
  const { rows } = await client.query(
    `INSERT INTO grant_invoices (organization_id, award_id, invoice_number, period_start, period_end, amount, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [orgId, awardId, input.invoiceNumber, input.periodStart ?? null, input.periodEnd ?? null, input.amount, userId],
  );
  return { id: Number(rows[0].id) };
}

const INVOICE_STATUSES = ['draft', 'submitted', 'paid', 'disputed', 'void'];
export async function setInvoiceStatusTx(client: Queryable, orgId: number, id: number, status: string): Promise<void> {
  if (!INVOICE_STATUSES.includes(status)) throw new GrantsError('BAD_INPUT', `Invalid status "${status}".`);
  const dateCol = status === 'submitted' ? 'submitted_date' : status === 'paid' ? 'paid_date' : null;
  const r = await client.query(
    `UPDATE grant_invoices SET status = $3${dateCol ? `, ${dateCol} = COALESCE(${dateCol}, CURRENT_DATE)` : ''}, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status],
  );
  if ((r as any).rowCount === 0) throw new GrantsError('NOT_FOUND', 'Invoice not found for this organization.');
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listAwards(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, proposal_id, project_id, award_number, funding_agency, total_amount, period_start, period_end, status
       FROM grant_awards WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [orgId],
  );
  return rows;
}

export async function listMilestones(orgId: number, awardId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, award_id, title, milestone_type, due_date, status, completed_date FROM grant_milestones WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (awardId != null) { params.push(awardId); sql += ` AND award_id = $2`; }
  sql += ` ORDER BY due_date ASC NULLS LAST, id`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function listProposals(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, opportunity_id, project_id, title, principal_investigator, requested_amount, status, submitted_date
       FROM grant_proposals WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [orgId],
  );
  return rows;
}

export async function listInvoices(orgId: number, awardId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, award_id, invoice_number, period_start, period_end, amount, status, submitted_date, paid_date FROM grant_invoices WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (awardId != null) { params.push(awardId); sql += ` AND award_id = $2`; }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getAwardPeriod(orgId: number, awardId: number): Promise<{ periodStart: string | null; periodEnd: string | null }> {
  const { rows } = await pool.query(`SELECT period_start, period_end FROM grant_awards WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [awardId, orgId]);
  if (rows.length === 0) throw new GrantsError('NOT_FOUND', 'Award not found for this organization.');
  return { periodStart: rows[0].period_start, periodEnd: rows[0].period_end };
}
