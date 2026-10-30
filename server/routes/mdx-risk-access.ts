/** Request-owned admission for the existing ISO 14971 register. Read access,
 * shared editing and signed-content protection remain separate decisions. */
import type { Request, Response } from 'express';
import { requestPgClient, requestConnectable, type RequestSqlClient } from '../db/requestDb';
import { GOVERNED_WRITE_ROLES, governedActorId } from '../middleware/orgMembership';
import { programInOrganization } from '../services/c2c/program-access';
import {
  ProgramReadAccessError, readCurrentProgramActor, requireCurrentProgramAccess,
} from '../services/c2c/current-program-access';
import { canAccessReportProject } from '../services/report-os/project-access';
import { serverError } from '../lib/api-response';

export const RISK_ACCESS_CODE_STATUS = {
  PROJECT_ACTOR_REQUIRED: 403, PROJECT_ACTOR_ACCESS_DENIED: 403,
  PROJECT_PERMISSION_DENIED: 403, PROJECT_WRITE_ACCESS_DENIED: 403,
  PROJECT_NOT_FOUND: 404, PROJECT_ANCHOR_UNRESOLVED: 409,
  PROJECT_SCOPE_UNVERIFIED: 403, PROJECT_ACCESS_CHANGED: 503,
  PROJECT_ACCESS_UNAVAILABLE: 503, RISK_ITEM_NOT_FOUND: 404,
  RISK_CONTROL_NOT_FOUND: 404, RISK_SCOPE_MISMATCH: 422,
  RISK_LINK_SCOPE_MISMATCH: 422, RISK_ASSIGNEE_NOT_MEMBER: 422,
} as const;

export class RiskAccessError extends Error {
  constructor(readonly code: keyof typeof RISK_ACCESS_CODE_STATUS, message: string) { super(message); }
}

export function sendRiskAccessFailure(res: Response, error: unknown): boolean {
  if (error instanceof ProgramReadAccessError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return true;
  }
  if (error instanceof RiskAccessError) {
    res.status(RISK_ACCESS_CODE_STATUS[error.code]).json({ error: error.code, message: error.message });
    return true;
  }
  return false;
}

export function riskFailure(res: Response, log: Parameters<typeof serverError>[1], operation: string, error: unknown): Response | undefined {
  if (sendRiskAccessFailure(res, error)) return;
  return serverError(res, log, operation, error);
}

export const riskClient = requestPgClient;
export const riskActorInput = (req: Request, organizationId: number) => ({
  organizationId, userId: governedActorId(req) ?? undefined,
});

/** Signing credentials and current project admission must name one actor. */
export function assertRiskSigner(req: Request, signerId: number): void {
  if (governedActorId(req) !== signerId) throw new ProgramReadAccessError(403,
    'PROJECT_ACTOR_ACCESS_DENIED', 'The signing actor does not match the current request. Nothing was signed.');
}

export function riskScopeOf(programId: string | null | undefined): { scope: 'program'; programId: string } | { scope: 'organization' } {
  return programId ? { scope: 'program', programId } : { scope: 'organization' };
}

export function riskRowProgram(row: Record<string, unknown>): string | null {
  if (row.program_id === null) return null;
  if (typeof row.program_id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.program_id)) {
    return row.program_id.toLowerCase();
  }
  throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'The risk record’s project scope could not be verified.');
}

/** A shared read/review grant does not authorize an edit. The caller owns the
 * transaction for a write, including a signing ceremony's own transaction. */
export async function admitRiskScope(q: RequestSqlClient, req: Request, organizationId: number,
  programId: string | null, write = false): Promise<void> {
  const identity = riskActorInput(req, organizationId);
  if (!write) {
    if (programId) await requireCurrentProgramAccess(q, { ...identity, programId });
    else await readCurrentProgramActor(q, identity);
    return;
  }
  const actor = await readCurrentProgramActor(q, { ...identity, forShare: true });
  if (!GOVERNED_WRITE_ROLES.has(actor.role)) throw new ProgramReadAccessError(403,
    'PROJECT_WRITE_ACCESS_DENIED', 'Your current permissions do not permit this change. Nothing was changed.');
  if (!programId) return;
  try {
    if (!await programInOrganization(q, programId, organizationId, { forShare: true })) {
      throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    const access = await requireCurrentProgramAccess(q, { ...identity, programId, forShare: true });
    const parent = await q.query(`SELECT id FROM projects WHERE id=$1 AND organization_id=$2
      AND regulatory_program_id=$3 FOR SHARE`, [access.projectId, organizationId, programId]);
    if (parent.rows.length !== 1) throw new ProgramReadAccessError(409,
      'PROJECT_ANCHOR_UNRESOLVED', 'The project relationship changed. Nothing was changed.');
    await q.query(`SELECT project_id FROM project_visibility_settings
      WHERE project_id=$1 AND organization_id=$2 FOR SHARE`, [access.projectId, organizationId]);
    if (!await canAccessReportProject(organizationId, actor, access.projectId, q, { forWrite: true })) {
      throw new ProgramReadAccessError(403, 'PROJECT_WRITE_ACCESS_DENIED', 'Your current project permissions do not permit this change. Nothing was changed.');
    }
  } catch (error) {
    if (error instanceof ProgramReadAccessError) throw error;
    throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project edit access could not be verified. Nothing was changed.');
  }
}

export async function withRiskWrite<T>(req: Request, operation: (q: RequestSqlClient) => Promise<T>): Promise<T> {
  const client = await requestConnectable(req).connect();
  let discardReason: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { discardReason = new Error('Risk transaction rollback could not be verified'); }
    throw error;
  } finally { client.release(discardReason); }
}

/** Load identity only until admission, and reserve the same parent for writes.
 * An explicit scope can never borrow another project's item, even if both are visible. */
export async function admittedRisk(q: RequestSqlClient, req: Request, organizationId: number, id: number,
  options: { expectedProgram?: string; write?: boolean } = {}): Promise<Record<string, unknown>> {
  const { expectedProgram, write = false } = options;
  if (expectedProgram) await admitRiskScope(q, req, organizationId, expectedProgram, write);
  const sql = write
    ? `SELECT id, program_id FROM risk_items WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR program_id=$3::uuid) FOR UPDATE`
    : `SELECT id, program_id FROM risk_items WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR program_id=$3::uuid)`;
  const { rows } = await q.query(sql, [id, organizationId, expectedProgram ?? null]);
  if (rows.length !== 1) throw new RiskAccessError('RISK_ITEM_NOT_FOUND', 'Risk item not found. Nothing was supplied or changed.');
  await admitRiskScope(q, req, organizationId, riskRowProgram(rows[0]), write);
  return rows[0];
}

export async function admitRiskAssignee(q: RequestSqlClient, organizationId: number, assignedTo?: number | null): Promise<void> {
  if (assignedTo == null) return;
  try {
    await readCurrentProgramActor(q, { organizationId, userId: assignedTo, forShare: true });
  } catch (error) {
    if (error instanceof ProgramReadAccessError && error.status === 403) {
      throw new RiskAccessError('RISK_ASSIGNEE_NOT_MEMBER', 'assignedTo is not a member of this organization');
    }
    throw error;
  }
}

export async function validateIntroducedRisk(q: RequestSqlClient, organizationId: number, programId: string | null,
  riskId: number | null | undefined): Promise<void> {
  if (riskId == null) return;
  const { rows } = await q.query(`SELECT id FROM risk_items WHERE id=$1 AND organization_id=$2
    AND program_id IS NOT DISTINCT FROM $3::uuid AND deleted_at IS NULL FOR SHARE`, [riskId, organizationId, programId]);
  if (rows.length !== 1) throw new RiskAccessError('RISK_LINK_SCOPE_MISMATCH',
    'The introduced risk must belong to the same organization and project. Nothing was changed.');
}

/** Moving either endpoint must preserve existing introduced-risk links. */
export async function validateRiskReparent(q: RequestSqlClient, organizationId: number, itemId: number,
  programId: string | null): Promise<void> {
  await q.query(`SELECT r.id FROM risk_items r WHERE r.organization_id=$2 AND EXISTS (
    SELECT 1 FROM risk_controls c WHERE c.organization_id=$2 AND
      (c.risk_item_id=$1 AND c.new_risk_item_id=r.id OR c.new_risk_item_id=$1 AND c.risk_item_id=r.id))
    ORDER BY r.id FOR SHARE`, [itemId, organizationId]);
  const { rows } = await q.query(`SELECT c.id FROM risk_controls c
    LEFT JOIN risk_items other ON other.id=CASE WHEN c.risk_item_id=$1 THEN c.new_risk_item_id ELSE c.risk_item_id END
    WHERE (c.risk_item_id=$1 AND c.new_risk_item_id IS NOT NULL OR c.new_risk_item_id=$1 AND c.risk_item_id<>$1)
      AND (c.organization_id<>$2 OR other.id IS NULL OR other.organization_id<>$2
        OR other.deleted_at IS NOT NULL OR other.id<>$1 AND other.program_id IS DISTINCT FROM $3::uuid)
    LIMIT 1`, [itemId, organizationId, programId]);
  if (rows.length) throw new RiskAccessError('RISK_LINK_SCOPE_MISMATCH',
    'Existing introduced-risk links must remain in the same project. Nothing was changed.');
}
