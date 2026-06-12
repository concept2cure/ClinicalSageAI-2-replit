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
import { closeoutDueDate, evaluateCloseout, evaluateSubawardEligibility } from './grants-logic';
import type { FundingAgency, FundingMechanism, MilestoneType, SubawardInstitutionType, SubawardRiskLevel } from '../../../shared/schema/grants';

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

const MILESTONE_STATUSES = ['pending', 'in_progress', 'met', 'missed', 'submitted'];
/** Complete the milestone lifecycle: transition status and stamp completion when met/submitted. */
export async function setMilestoneStatusTx(client: Queryable, orgId: number, id: number, status: string, completedDate?: string | null): Promise<void> {
  if (!MILESTONE_STATUSES.includes(status)) throw new GrantsError('BAD_INPUT', `Invalid status "${status}".`);
  const stamps = status === 'met' || status === 'submitted';
  const r = await client.query(
    `UPDATE grant_milestones SET status = $3, completed_date = ${stamps ? 'COALESCE($4, completed_date, CURRENT_DATE)' : '$4'}, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, stamps ? (completedDate ?? null) : (completedDate ?? null)],
  );
  if ((r as any).rowCount === 0) throw new GrantsError('NOT_FOUND', 'Milestone not found for this organization.');
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

// ─── Closeout (2 CFR 200.344) ────────────────────────────────────────────────

/** Open the closeout record for an award; derives the 120-day due date from the period end. One per award. */
export async function openCloseoutTx(client: Queryable, orgId: number, userId: number, awardId: number): Promise<{ id: number; closeoutDueDate: string | null }> {
  // Cast date → text so the pure logic receives an ISO 'YYYY-MM-DD' string (pg returns Date objects otherwise).
  const a = await client.query(`SELECT period_end::text AS period_end, status FROM grant_awards WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [awardId, orgId]);
  if (a.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Award not found for this organization.');
  const existing = await client.query(`SELECT id FROM grant_closeout_records WHERE award_id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [awardId, orgId]);
  if (existing.rows.length > 0) throw new GrantsError('INVALID_STATE', 'A closeout record already exists for this award.');
  const due = closeoutDueDate(a.rows[0].period_end);
  const { rows } = await client.query(
    `INSERT INTO grant_closeout_records (organization_id, award_id, closeout_due_date, status, created_by) VALUES ($1,$2,$3,'open',$4) RETURNING id`,
    [orgId, awardId, due, userId],
  );
  return { id: Number(rows[0].id), closeoutDueDate: due };
}

export interface CloseoutItemsInput {
  finalRpprSubmitted?: boolean;
  finalFfrSubmitted?: boolean;
  equipmentInventoryReturned?: boolean;
  finalInvoicesReconciled?: boolean;
  deobligationAmount?: string | number | null;
  notes?: string | null;
}

/** Update closeout checklist items. Stamps the report dates when an item flips to submitted. */
export async function updateCloseoutTx(client: Queryable, orgId: number, userId: number, awardId: number, input: CloseoutItemsInput): Promise<void> {
  const cur = await client.query(`SELECT status FROM grant_closeout_records WHERE award_id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [awardId, orgId]);
  if (cur.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Closeout record not found for this award.');
  if (cur.rows[0].status === 'completed') throw new GrantsError('INVALID_STATE', 'Closeout is already completed.');
  const r = await client.query(
    `UPDATE grant_closeout_records SET
        final_rppr_submitted = COALESCE($3, final_rppr_submitted),
        final_rppr_date = CASE WHEN $3 IS TRUE THEN COALESCE(final_rppr_date, CURRENT_DATE) ELSE final_rppr_date END,
        final_ffr_submitted = COALESCE($4, final_ffr_submitted),
        final_ffr_date = CASE WHEN $4 IS TRUE THEN COALESCE(final_ffr_date, CURRENT_DATE) ELSE final_ffr_date END,
        equipment_inventory_returned = COALESCE($5, equipment_inventory_returned),
        final_invoices_reconciled = COALESCE($6, final_invoices_reconciled),
        deobligation_amount = COALESCE($7, deobligation_amount),
        notes = COALESCE($8, notes),
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
        updated_at = now()
      WHERE award_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [awardId, orgId, input.finalRpprSubmitted ?? null, input.finalFfrSubmitted ?? null,
      input.equipmentInventoryReturned ?? null, input.finalInvoicesReconciled ?? null, input.deobligationAmount ?? null, input.notes ?? null],
  );
  if ((r as any).rowCount === 0) throw new GrantsError('NOT_FOUND', 'Closeout record not found for this award.');
}

/** Finalize closeout — gated: all four 2 CFR 200.344 items must be complete. Closes the award. */
export async function finalizeCloseoutTx(client: Queryable, orgId: number, userId: number, awardId: number): Promise<{ closedAward: boolean }> {
  const rec = await client.query(
    `SELECT c.*, a.period_end::text AS period_end FROM grant_closeout_records c JOIN grant_awards a ON a.id = c.award_id
       WHERE c.award_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL LIMIT 1`,
    [awardId, orgId],
  );
  if (rec.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Closeout record not found for this award.');
  const row = rec.rows[0];
  if (row.status === 'completed') throw new GrantsError('INVALID_STATE', 'Closeout is already completed.');
  const state = evaluateCloseout({
    finalRpprSubmitted: row.final_rppr_submitted, finalFfrSubmitted: row.final_ffr_submitted,
    equipmentInventoryReturned: row.equipment_inventory_returned, finalInvoicesReconciled: row.final_invoices_reconciled,
  }, row.period_end, new Date().toISOString().slice(0, 10));
  if (!state.readyToFinalize) throw new GrantsError('INVALID_STATE', `Cannot finalize closeout — outstanding: ${state.outstanding.join(', ')}`);
  await client.query(`UPDATE grant_closeout_records SET status = 'completed', finalized_by = $3, finalized_at = now(), updated_at = now() WHERE award_id = $1 AND organization_id = $2`, [awardId, orgId, userId]);
  await client.query(`UPDATE grant_awards SET status = 'closed', updated_at = now() WHERE id = $1 AND organization_id = $2 AND status <> 'terminated'`, [awardId, orgId]);
  return { closedAward: true };
}

export async function getCloseoutRecord(orgId: number, awardId: number): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT c.*, a.period_end::text AS period_end FROM grant_closeout_records c JOIN grant_awards a ON a.id = c.award_id
       WHERE c.award_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL LIMIT 1`,
    [awardId, orgId],
  );
  return rows[0] ?? null;
}

// ─── Subawards / subrecipient monitoring (2 CFR 200.331–200.332, 200.214) ────

export interface SubawardInput {
  subrecipientName: string;
  subrecipientUei?: string | null;
  institutionType?: SubawardInstitutionType | null;
  amount?: string | number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  riskLevel?: SubawardRiskLevel | null;
}

export async function createSubawardTx(client: Queryable, orgId: number, userId: number, awardId: number, input: SubawardInput): Promise<{ id: number }> {
  await assertAward(client, orgId, awardId);
  const { rows } = await client.query(
    `INSERT INTO grant_subawards (organization_id, award_id, subrecipient_name, subrecipient_uei, institution_type, amount, period_start, period_end, risk_level, screen_status, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'not_screened','draft',$10) RETURNING id`,
    [orgId, awardId, input.subrecipientName, input.subrecipientUei ?? null, input.institutionType ?? null, input.amount ?? null,
      input.periodStart ?? null, input.periodEnd ?? null, input.riskLevel ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

/** Record a restricted-party screening result against SAM.gov exclusions. */
export async function screenSubawardTx(client: Queryable, orgId: number, id: number, input: { screenStatus: 'cleared' | 'excluded'; screenSource?: string | null; riskLevel?: SubawardRiskLevel | null }): Promise<void> {
  if (!['cleared', 'excluded'].includes(input.screenStatus)) throw new GrantsError('BAD_INPUT', `Invalid screen status "${input.screenStatus}".`);
  const r = await client.query(
    `UPDATE grant_subawards SET screen_status = $3, screen_date = CURRENT_DATE, screen_source = COALESCE($4, screen_source),
        risk_level = COALESCE($5, risk_level), status = CASE WHEN status = 'draft' THEN 'screened' ELSE status END, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, input.screenStatus, input.screenSource ?? 'sam_exclusions', input.riskLevel ?? null],
  );
  if ((r as any).rowCount === 0) throw new GrantsError('NOT_FOUND', 'Subaward not found for this organization.');
}

/** Execute a subaward — gated: cleared screen + recorded risk assessment (2 CFR 200.214/200.332). */
export async function executeSubawardTx(client: Queryable, orgId: number, userId: number, id: number): Promise<{ eligible: true }> {
  const s = await client.query(`SELECT screen_status, risk_level, status FROM grant_subawards WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
  if (s.rows.length === 0) throw new GrantsError('NOT_FOUND', 'Subaward not found for this organization.');
  if (s.rows[0].status === 'executed') throw new GrantsError('INVALID_STATE', 'Subaward is already executed.');
  if (s.rows[0].status === 'terminated') throw new GrantsError('INVALID_STATE', 'Subaward is terminated.');
  const elig = evaluateSubawardEligibility({ screenStatus: s.rows[0].screen_status, riskLevel: s.rows[0].risk_level });
  if (!elig.eligible) throw new GrantsError('INVALID_STATE', `Cannot execute subaward — ${elig.blockers.join(' ')}`);
  await client.query(`UPDATE grant_subawards SET status = 'executed', executed_by = $3, executed_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [id, orgId, userId]);
  return { eligible: true };
}

export async function listSubawards(orgId: number, awardId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, award_id, subrecipient_name, subrecipient_uei, institution_type, amount, risk_level, screen_status, screen_date, status FROM grant_subawards WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (awardId != null) { params.push(awardId); sql += ` AND award_id = $2`; }
  sql += ` ORDER BY created_at DESC`;
  return (await pool.query(sql, params)).rows;
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
