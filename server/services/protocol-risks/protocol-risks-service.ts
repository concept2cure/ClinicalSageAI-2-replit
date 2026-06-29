/**
 * Protocol Risk Register service (Capability C2C-19)
 *
 * Tenant-scoped functions over protocol_risks: add a risk, update mitigation /
 * residual targets / status, and read the scored register with summary. Scoring
 * is deterministic (protocol-risks-logic.ts). Mutations run inside the caller's
 * transaction with the governed-action ledger.
 *
 * @module server/services/protocol-risks/protocol-risks-service
 */

import { pool } from '../../db';
import { scoreRisk, summarizeRiskRegister, type RiskLikelihood, type RiskImpact, type RiskRegisterSummary } from './protocol-risks-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolRiskError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolRiskError';
  }
}

const CATEGORIES = ['participant_safety', 'data_integrity', 'regulatory', 'operational', 'privacy', 'other'];
const LIKELIHOOD = ['rare', 'unlikely', 'possible', 'likely', 'almost_certain'];
const IMPACT = ['negligible', 'minor', 'moderate', 'major', 'severe'];
const STATUS = ['open', 'mitigating', 'accepted', 'closed'];

export interface RiskInput {
  protocolDocumentId: number;
  category?: string;
  description: string;
  likelihood?: string;
  impact?: string;
  mitigation?: string | null;
  owner?: string | null;
}

export async function addRiskTx(client: Queryable, orgId: number, userId: number, input: RiskInput): Promise<{ id: number; level: string }> {
  if (input.category && !CATEGORIES.includes(input.category)) throw new ProtocolRiskError('BAD_INPUT', `Invalid category "${input.category}".`);
  if (input.likelihood && !LIKELIHOOD.includes(input.likelihood)) throw new ProtocolRiskError('BAD_INPUT', `Invalid likelihood "${input.likelihood}".`);
  if (input.impact && !IMPACT.includes(input.impact)) throw new ProtocolRiskError('BAD_INPUT', `Invalid impact "${input.impact}".`);
  const likelihood = (input.likelihood ?? 'possible') as RiskLikelihood;
  const impact = (input.impact ?? 'moderate') as RiskImpact;
  const { rows } = await client.query(
    `INSERT INTO protocol_risks (organization_id, protocol_document_id, category, description, likelihood, impact, mitigation, owner, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9) RETURNING id`,
    [orgId, input.protocolDocumentId, input.category ?? 'operational', input.description, likelihood, impact, input.mitigation ?? null, input.owner ?? null, userId],
  );
  const level = scoreRisk({ likelihood, impact }).inherentLevel;
  return { id: Number(rows[0].id), level };
}

export interface RiskUpdateInput {
  mitigation?: string | null;
  residualLikelihood?: string | null;
  residualImpact?: string | null;
  status?: string;
  owner?: string | null;
}

export async function updateRiskTx(client: Queryable, orgId: number, riskId: number, input: RiskUpdateInput): Promise<void> {
  if (input.status && !STATUS.includes(input.status)) throw new ProtocolRiskError('BAD_INPUT', `Invalid status "${input.status}".`);
  if (input.residualLikelihood && !LIKELIHOOD.includes(input.residualLikelihood)) throw new ProtocolRiskError('BAD_INPUT', `Invalid residual_likelihood "${input.residualLikelihood}".`);
  if (input.residualImpact && !IMPACT.includes(input.residualImpact)) throw new ProtocolRiskError('BAD_INPUT', `Invalid residual_impact "${input.residualImpact}".`);
  const r = await client.query(
    `UPDATE protocol_risks SET
        mitigation = COALESCE($3, mitigation),
        residual_likelihood = COALESCE($4, residual_likelihood),
        residual_impact = COALESCE($5, residual_impact),
        status = COALESCE($6, status),
        owner = COALESCE($7, owner),
        updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [riskId, orgId, input.mitigation ?? null, input.residualLikelihood ?? null, input.residualImpact ?? null, input.status ?? null, input.owner ?? null],
  );
  if ((r as any).rowCount === 0) throw new ProtocolRiskError('NOT_FOUND', 'Risk not found for this organization.');
}

export async function listRisks(orgId: number, protocolDocumentId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, category, description, likelihood, impact, mitigation, residual_likelihood, residual_impact, owner, status
       FROM protocol_risks WHERE organization_id = $1 AND protocol_document_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [orgId, protocolDocumentId],
  );
  return rows.map((r) => {
    const scored = scoreRisk({ likelihood: r.likelihood, impact: r.impact, residualLikelihood: r.residual_likelihood, residualImpact: r.residual_impact, status: r.status });
    return { ...r, ...scored };
  });
}

export async function getRiskRegister(orgId: number, protocolDocumentId: number): Promise<{ risks: any[]; summary: RiskRegisterSummary }> {
  const risks = await listRisks(orgId, protocolDocumentId);
  const summary = summarizeRiskRegister(
    risks.map((r) => ({ category: r.category, likelihood: r.likelihood, impact: r.impact, residualLikelihood: r.residual_likelihood, residualImpact: r.residual_impact, status: r.status })),
  );
  return { risks, summary };
}
