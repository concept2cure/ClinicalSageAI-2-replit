/**
 * NIH Data Management & Sharing Plan service (Capability C2C-23)
 *
 * Tenant-scoped transaction functions for authoring an NIH DMS plan: create a plan
 * (auto-seeded with the six required DMS plan elements as not-addressed rows), edit
 * an element's content + addressed flag, read the plan with its elements, score
 * completeness, and finalize behind a deterministic completeness gate. Mutations run
 * inside the caller's transaction with the governed-action ledger.
 *
 * @module server/services/dmsp/dmsp-service
 */

import { pool } from '../../db';
import {
  enforceAuthorLineage,
  enforceSourceAndAuthorLineage,
  type SourceAndAuthorLineageResult,
} from '../clinical-regulatory-evidence/lineage-gate';
import type { RetrievedSource } from '../clinical-regulatory-evidence/source-attribution';
import {
  dmspElementTemplates,
  evaluateDmspCompleteness,
  type DmspCompletenessResult,
} from './dmsp-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class DmspError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'DmspError';
  }
}

// ─── Plans ─────────────────────────────────────────────────────────────────────

export interface DmsPlanInput {
  title: string;
  grantProposalId?: number | null;
  protocolDocumentId?: number | null;
}

/** Create a DMS plan and seed it with the six required DMS plan elements. */
export async function createPlanTx(client: Queryable, orgId: number, userId: number, input: DmsPlanInput): Promise<{ id: number; elementsSeeded: number }> {
  if (!input.title || !input.title.trim()) throw new DmspError('BAD_INPUT', 'A DMS plan title is required.');
  const { rows } = await client.query(
    `INSERT INTO dms_plans (organization_id, grant_proposal_id, protocol_document_id, title, status, created_by)
     VALUES ($1,$2,$3,$4,'draft',$5) RETURNING id`,
    [orgId, input.grantProposalId ?? null, input.protocolDocumentId ?? null, input.title.trim(), userId],
  );
  const id = Number(rows[0].id);
  const templates = dmspElementTemplates();
  let order = 0;
  for (const e of templates) {
    await client.query(
      `INSERT INTO dms_plan_elements (organization_id, plan_id, element_key, title, content, addressed, order_index, created_by)
       VALUES ($1,$2,$3,$4,NULL,false,$5,$6)`,
      [orgId, id, e.elementKey, e.title, order++, userId],
    );
  }
  return { id, elementsSeeded: templates.length };
}

async function loadPlan(client: Queryable, orgId: number, planId: number): Promise<{ status: string }> {
  const p = await client.query(`SELECT status FROM dms_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [planId, orgId]);
  if (p.rows.length === 0) throw new DmspError('NOT_FOUND', 'DMS plan not found for this organization.');
  return { status: p.rows[0].status };
}

function assertEditable(status: string): void {
  if (status === 'final') throw new DmspError('INVALID_STATE', 'DMS plan is final; create a new plan to edit.');
}

// ─── Elements ──────────────────────────────────────────────────────────────

export async function updateElementTx(client: Queryable, orgId: number, elementId: number, input: { content?: string | null; addressed?: boolean ; sources?: RetrievedSource[] }, actorUserId: number): Promise<SourceAndAuthorLineageResult | null> {
  const el = await client.query(
    `SELECT e.id, p.status AS plan_status, p.id AS plan_id FROM dms_plan_elements e JOIN dms_plans p ON p.id = e.plan_id
      WHERE e.id = $1 AND e.organization_id = $2 LIMIT 1`,
    [elementId, orgId],
  );
  if (el.rows.length === 0) throw new DmspError('NOT_FOUND', 'DMS plan element not found for this organization.');
  assertEditable(el.rows[0].plan_status);
  await client.query(
    `UPDATE dms_plan_elements SET content = COALESCE($3, content), addressed = COALESCE($4, addressed), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [elementId, orgId, input.content ?? null, input.addressed ?? null],
  );
  // Prose gate (ledger L158): the element's text and its lineage commit in the
  // caller's transaction, exactly as protocol and biosketch sections do. With
  // `sources` (an AnA draft naming the Data Room passages it quoted) the
  // verbatim clauses are recorded against those sources and the rest against
  // the author; without, every clause is the author's assertion. A status-only
  // edit (content absent) no-ops the gate inside the helper.
  let lineage: SourceAndAuthorLineageResult | null = null;
  if (input.sources && input.sources.length > 0 && typeof input.content === 'string') {
    lineage = await enforceSourceAndAuthorLineage(client, orgId, { documentTable: 'dms_plan_elements', documentId: String(elementId) }, input.content, String(actorUserId), input.sources);
  } else {
    await enforceAuthorLineage(client, orgId, { documentTable: 'dms_plan_elements', documentId: String(elementId) }, input.content ?? null, String(actorUserId));
  }
  await client.query(`UPDATE dms_plans SET status = CASE WHEN status = 'draft' THEN 'in_development' ELSE status END, updated_at = now() WHERE id = $1 AND organization_id = $2`, [el.rows[0].plan_id, orgId]);
  return lineage;
}

// ─── Completeness + finalize ─────────────────────────────────────────────────

async function completenessInputFor(orgId: number, planId: number) {
  const { rows } = await pool.query(
    `SELECT element_key, content, addressed FROM dms_plan_elements WHERE plan_id = $1 AND organization_id = $2`,
    [planId, orgId],
  );
  return rows.map((r) => ({ elementKey: r.element_key, required: true, addressed: r.addressed, content: r.content }));
}

/** Read-only completeness assessment (uses the pure evaluateDmspCompleteness). */
export async function getCompleteness(orgId: number, planId: number): Promise<DmspCompletenessResult> {
  await loadPlan(pool, orgId, planId);
  return evaluateDmspCompleteness(await completenessInputFor(orgId, planId));
}

/** Finalize — gated on the deterministic completeness check. */
export async function finalizePlanTx(client: Queryable, orgId: number, userId: number, planId: number): Promise<{ finalized: true; completeness: DmspCompletenessResult }> {
  const plan = await loadPlan(client, orgId, planId);
  if (plan.status === 'final') throw new DmspError('INVALID_STATE', 'DMS plan is already final.');
  const elements = await client.query(`SELECT element_key, content, addressed FROM dms_plan_elements WHERE plan_id = $1 AND organization_id = $2`, [planId, orgId]);
  const completeness = evaluateDmspCompleteness(elements.rows.map((r) => ({ elementKey: r.element_key, required: true, addressed: r.addressed, content: r.content })));
  if (!completeness.readyToFinalize) {
    throw new DmspError('INVALID_STATE', `Cannot finalize — ${completeness.findings.filter((f) => f.severity === 'critical').map((f) => f.message).join(' ')}`);
  }
  await client.query(`UPDATE dms_plans SET status = 'final', finalized_by = $3, finalized_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [planId, orgId, userId]);
  return { finalized: true, completeness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listPlans(orgId: number, opts?: { grantProposalId?: number; protocolDocumentId?: number }): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, grant_proposal_id, protocol_document_id, title, status, finalized_at, created_at, updated_at
               FROM dms_plans WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (opts?.grantProposalId != null) { params.push(opts.grantProposalId); sql += ` AND grant_proposal_id = $${params.length}`; }
  if (opts?.protocolDocumentId != null) { params.push(opts.protocolDocumentId); sql += ` AND protocol_document_id = $${params.length}`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getPlan(orgId: number, planId: number): Promise<any | null> {
  const p = await pool.query(`SELECT * FROM dms_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [planId, orgId]);
  if (p.rows.length === 0) return null;
  const elements = await pool.query(
    `SELECT id, element_key, title, content, addressed, order_index FROM dms_plan_elements WHERE plan_id = $1 AND organization_id = $2 ORDER BY order_index, id`,
    [planId, orgId],
  );
  return { ...p.rows[0], elements: elements.rows };
}
