/**
 * Design controls (DHF) + Risk Management File (ISO 14971) persistence service.
 *
 * Org-scoped raw-SQL service (mirrors server/routes/mdx-ivdr.ts conventions).
 * CRUD-create + list for the design-control and risk entities, plus two
 * assessment endpoints that load the persisted records and run the pure
 * engines:
 *   - assessDhf      → server/services/regulatory/design-controls.ts
 *   - summarizeRmf   → server/services/regulatory/iso-14971-risk.ts
 */

import { pool } from '../../db';
import {
  assessDhfCompleteness,
  type DhfInput,
  type DesignInput,
  type DesignOutput,
  type VerificationActivity,
  type ValidationActivity,
  type DesignReview,
  type DesignChange,
} from '../regulatory/design-controls';
import {
  summarizeRiskFile,
  determineBenefitRisk,
  type RiskItem,
} from '../regulatory/iso-14971-risk';

// ─── helpers ──────────────────────────────────────────────────────────────

function programFilter(orgId: number, programId?: string): { where: string; args: unknown[] } {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (programId) {
    args.push(programId);
    where += ` AND program_id = $${args.length}`;
  }
  return { where, args };
}

// ─── Design-control entity create + list ────────────────────────────────────

export async function createDesignInput(orgId: number, p: {
  programId?: string; requirement: string; category: string; riskItemRef?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_inputs (organization_id, program_id, requirement, category, risk_item_ref)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, p.programId ?? null, p.requirement, p.category, p.riskItemRef ?? null]
  );
  return rows[0];
}

export async function createDesignOutput(orgId: number, p: {
  programId?: string; description: string; satisfiesInputIds: string[]; hasAcceptanceCriteria: boolean;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_outputs (organization_id, program_id, description, satisfies_input_ids, has_acceptance_criteria)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, p.programId ?? null, p.description, p.satisfiesInputIds, p.hasAcceptanceCriteria]
  );
  return rows[0];
}

export async function createDesignVerification(orgId: number, p: {
  programId?: string; description: string; verifiesOutputIds: string[]; result?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_verifications (organization_id, program_id, description, verifies_output_ids, result)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, p.programId ?? null, p.description, p.verifiesOutputIds, p.result ?? null]
  );
  return rows[0];
}

export async function createDesignValidation(orgId: number, p: {
  programId?: string; description: string; validatesInputIds: string[]; productionEquivalent: boolean; result?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_validations (organization_id, program_id, description, validates_input_ids, production_equivalent, result)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [orgId, p.programId ?? null, p.description, p.validatesInputIds, p.productionEquivalent, p.result ?? null]
  );
  return rows[0];
}

export async function createDesignReview(orgId: number, p: {
  programId?: string; phase: string; independentReviewerPresent: boolean; actionItemsOpen?: number;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_reviews (organization_id, program_id, phase, independent_reviewer_present, action_items_open)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, p.programId ?? null, p.phase, p.independentReviewerPresent, p.actionItemsOpen ?? 0]
  );
  return rows[0];
}

export async function createDesignChange(orgId: number, p: {
  programId?: string; description: string; reviewed: boolean; verifiedOrValidated: boolean;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_changes (organization_id, program_id, description, reviewed, verified_or_validated)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, p.programId ?? null, p.description, p.reviewed, p.verifiedOrValidated]
  );
  return rows[0];
}

export async function upsertDesignPlan(orgId: number, p: {
  programId?: string; title: string; designTransferDocumented: boolean;
}) {
  const { rows } = await pool.query(
    `INSERT INTO design_plans (organization_id, program_id, title, design_transfer_documented)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [orgId, p.programId ?? null, p.title, p.designTransferDocumented]
  );
  return rows[0];
}

async function listTable(table: string, orgId: number, programId?: string) {
  const { where, args } = programFilter(orgId, programId);
  const { rows } = await pool.query(
    `SELECT * FROM ${table} WHERE ${where} ORDER BY created_at ASC`,
    args
  );
  return rows;
}

export const listDesignInputs = (o: number, p?: string) => listTable('design_inputs', o, p);
export const listDesignOutputs = (o: number, p?: string) => listTable('design_outputs', o, p);
export const listDesignVerifications = (o: number, p?: string) => listTable('design_verifications', o, p);
export const listDesignValidations = (o: number, p?: string) => listTable('design_validations', o, p);
export const listDesignReviews = (o: number, p?: string) => listTable('design_reviews', o, p);
export const listDesignChanges = (o: number, p?: string) => listTable('design_changes', o, p);

// ─── DHF assessment ─────────────────────────────────────────────────────────

export async function assessDhf(orgId: number, programId?: string) {
  const [inputs, outputs, verifications, validations, reviews, changes, plans] =
    await Promise.all([
      listDesignInputs(orgId, programId),
      listDesignOutputs(orgId, programId),
      listDesignVerifications(orgId, programId),
      listDesignValidations(orgId, programId),
      listDesignReviews(orgId, programId),
      listDesignChanges(orgId, programId),
      listTable('design_plans', orgId, programId),
    ]);

  const dhf: DhfInput = {
    hasDesignPlan: plans.length > 0,
    inputs: inputs.map((r): DesignInput => ({
      id: r.id, requirement: r.requirement, category: r.category, riskItemRef: r.risk_item_ref,
    })),
    outputs: outputs.map((r): DesignOutput => ({
      id: r.id, description: r.description,
      satisfiesInputIds: r.satisfies_input_ids ?? [],
      hasAcceptanceCriteria: r.has_acceptance_criteria,
    })),
    verifications: verifications.map((r): VerificationActivity => ({
      id: r.id, description: r.description,
      verifiesOutputIds: r.verifies_output_ids ?? [], result: r.result ?? undefined,
    })),
    validations: validations.map((r): ValidationActivity => ({
      id: r.id, description: r.description,
      validatesInputIds: r.validates_input_ids ?? [],
      productionEquivalent: r.production_equivalent, result: r.result ?? undefined,
    })),
    reviews: reviews.map((r): DesignReview => ({
      id: r.id, phase: r.phase,
      independentReviewerPresent: r.independent_reviewer_present,
      actionItemsOpen: r.action_items_open,
    })),
    changes: changes.map((r): DesignChange => ({
      id: r.id, description: r.description,
      reviewed: r.reviewed, verifiedOrValidated: r.verified_or_validated,
    })),
    designTransferDocumented: plans.some((p: any) => p.design_transfer_documented),
  };

  return assessDhfCompleteness(dhf);
}

// ─── Risk Management File ───────────────────────────────────────────────────

export async function createRmf(orgId: number, p: {
  programId?: string; deviceName: string; benefitDocumented?: boolean; benefitMagnitude?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO risk_management_files (organization_id, program_id, device_name, benefit_documented, benefit_magnitude)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [orgId, p.programId ?? null, p.deviceName, p.benefitDocumented ?? false, p.benefitMagnitude ?? null]
  );
  return rows[0];
}

export async function getRmf(orgId: number, rmfId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM risk_management_files WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [rmfId, orgId]
  );
  return rows[0] ?? null;
}

export async function listRmfs(orgId: number, programId?: string) {
  return listTable('risk_management_files', orgId, programId);
}

export async function createRiskItem(orgId: number, p: {
  rmfId: string; hazard: string; hazardousSituation: string; harm: string;
  initialSeverity: string; initialP1: string; initialP2: string;
  residualSeverity?: string | null; residualP1?: string | null; residualP2?: string | null;
  designInputRef?: string | null;
}) {
  // Tenant guard: the RMF must belong to the caller's org.
  const rmf = await getRmf(orgId, p.rmfId);
  if (!rmf) throw new Error('RMF not found in tenant');
  const { rows } = await pool.query(
    `INSERT INTO risk_items
       (organization_id, rmf_id, hazard, hazardous_situation, harm,
        initial_severity, initial_p1, initial_p2,
        residual_severity, residual_p1, residual_p2, design_input_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [orgId, p.rmfId, p.hazard, p.hazardousSituation, p.harm,
     p.initialSeverity, p.initialP1, p.initialP2,
     p.residualSeverity ?? null, p.residualP1 ?? null, p.residualP2 ?? null,
     p.designInputRef ?? null]
  );
  return rows[0];
}

export async function addRiskControl(orgId: number, p: {
  riskItemId: string; option: string; description: string; verified?: boolean; verificationRef?: string | null;
}) {
  // Tenant guard via the parent item.
  const { rows: itemRows } = await pool.query(
    `SELECT id FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [p.riskItemId, orgId]
  );
  if (itemRows.length === 0) throw new Error('Risk item not found in tenant');
  const { rows } = await pool.query(
    `INSERT INTO risk_controls (organization_id, risk_item_id, option, description, verified, verification_ref)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [orgId, p.riskItemId, p.option, p.description, p.verified ?? false, p.verificationRef ?? null]
  );
  return rows[0];
}

/** Load a risk file's items + controls and run the ISO 14971 summary engine. */
export async function summarizeRmf(orgId: number, rmfId: string) {
  const rmf = await getRmf(orgId, rmfId);
  if (!rmf) return null;

  const { rows: itemRows } = await pool.query(
    `SELECT * FROM risk_items WHERE rmf_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [rmfId, orgId]
  );
  const itemIds = itemRows.map((r: any) => r.id);
  const controlsByItem = new Map<string, any[]>();
  if (itemIds.length > 0) {
    const { rows: controlRows } = await pool.query(
      `SELECT * FROM risk_controls WHERE risk_item_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [itemIds]
    );
    for (const c of controlRows) {
      const arr = controlsByItem.get(c.risk_item_id) ?? [];
      arr.push(c);
      controlsByItem.set(c.risk_item_id, arr);
    }
  }

  const items: RiskItem[] = itemRows.map((r: any) => ({
    id: r.id,
    hazard: r.hazard,
    hazardousSituation: r.hazardous_situation,
    harm: r.harm,
    initialSeverity: r.initial_severity,
    initialP1: r.initial_p1,
    initialP2: r.initial_p2,
    residualSeverity: r.residual_severity ?? undefined,
    residualP1: r.residual_p1 ?? undefined,
    residualP2: r.residual_p2 ?? undefined,
    designInputRef: r.design_input_ref,
    controls: (controlsByItem.get(r.id) ?? []).map((c: any) => ({
      id: c.id, option: c.option, description: c.description,
      verified: c.verified, verificationRef: c.verification_ref,
    })),
  }));

  const summary = summarizeRiskFile(items);
  const benefitRisk = determineBenefitRisk({
    benefitDocumented: rmf.benefit_documented,
    benefitMagnitude: rmf.benefit_magnitude ?? undefined,
    overallResidualAcceptable: summary.overallResidualAcceptable,
    investigateResidualCount: summary.byResidualRegion.investigate,
  });

  return { rmf, summary, benefitRisk };
}
