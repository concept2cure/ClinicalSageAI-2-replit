/** Existing migration-backed Shadow stores; no upstream self-claim grants access. */
import type { NextFunction, Request, Response } from 'express';
import { requestDb, requestPgClient } from '../../db/requestDb';
import { looksLikeProgramUuid } from '../../lib/project-id';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { requireGovernedProgramWriteTx } from '../c2c/governed-program-write';
import { readCsrProjectActor } from '../csr/project-scope';
import { canAccessReportProject } from '../report-os/project-access';
import { logAuditEvent } from '../audit/auditLogger';
import { auditRowOutcomeFrom, combineAuditRowOutcomes, setAuditRowHeaders, type AuditRowOutcome } from '../audit/audit-write-outcome';

export class ShadowContractRefusal extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string,
    readonly recoveryUrl?: string) { super(message); this.name = 'ShadowContractRefusal'; }
}
function positiveId(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export async function assertShadowProgramAccess(req: Request, programId: unknown): Promise<void> {
  if (typeof programId !== 'string' || !looksLikeProgramUuid(programId)) throw new ShadowContractRefusal(400, 'PROGRAM_ID_INVALID', 'A valid project UUID is required.');
  const organizationId = positiveId(req.user?.organizationId);
  const userId = positiveId(req.user?.id);
  if (!organizationId || !userId) throw new ShadowContractRefusal(403, 'PROGRAM_ACCESS_DENIED', 'Current organization identity is required.');
  const client = requestPgClient(req);
  if (!await programInOrganization(client, programId, organizationId)) throw new ShadowContractRefusal(403, 'PROGRAM_ACCESS_DENIED', 'You do not have access to this project.');
  // Despite its historical name, this is the canonical generic persisted user,
  // account-status and organization-membership read, not a CSR entitlement.
  const actor = await readCsrProjectActor(client, organizationId, userId);
  const anchor = await readProgramAnchorRow(requestDb(req), { programId, orgId: organizationId, context: 'defense-packet-access', requireUnique: true });
  if (!anchor) throw new ShadowContractRefusal(409, 'PROGRAM_ANCHOR_UNAVAILABLE', 'This project has no unique tracking record. Its records could not be verified.');
  if (!await canAccessReportProject(organizationId, actor, anchor.id, client)) throw new ShadowContractRefusal(403, 'PROGRAM_ACCESS_DENIED', 'Current project access is required.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    await client.query('BEGIN');
    try { await requireGovernedProgramWriteTx(client, organizationId, userId, programId); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  }
}
export async function requireShadowProgramAccess(req: Request, res: Response, next: NextFunction) {
  try {
    await assertShadowProgramAccess(req, req.params.programId);
    next();
  } catch (error) {
    if (error instanceof ShadowContractRefusal) return sendShadowContractRefusal(res, error);
    if ((error as { status?: number }).status === 403) return res.status(403).json({ code: 'PROGRAM_ACCESS_DENIED', error: 'Current project and organization access is required.' });
    return res.status(503).json({ code: 'PROGRAM_ACCESS_UNAVAILABLE', error: 'Current project access could not be verified.' });
  }
}
export function sendShadowContractRefusal(res: Response, error: unknown): boolean {
  if (!(error instanceof ShadowContractRefusal)) return false;
  res.status(error.status).json({ code: error.code, error: error.message,
    ...(error.recoveryUrl ? { recoveryUrl: error.recoveryUrl, retrySafe: false } : {}) });
  return true;
}
export interface BoundPacket extends Record<string, unknown> { id: string; program_id: string; manifest_hash: string }
async function exactRow(req: Request, sql: string, key: unknown): Promise<BoundPacket> {
  if (typeof key !== 'string' || !key || key.length > 128) throw new ShadowContractRefusal(400, 'SHADOW_OBJECT_ID_INVALID', 'A valid record identifier is required.');
  try {
    const { rows } = await requestPgClient(req).query(sql, [req.params.programId, key]);
    if (rows.length !== 1) throw new ShadowContractRefusal(404, 'SHADOW_OBJECT_NOT_FOUND', 'Record not found for this project.');
    return rows[0] as BoundPacket;
  } catch (error) {
    if (error instanceof ShadowContractRefusal) throw error;
    throw new ShadowContractRefusal(503, 'SHADOW_BINDING_UNAVAILABLE', 'The stored record and its project binding could not be verified.');
  }
}
export function requireBoundPacket(req: Request, key: unknown): Promise<BoundPacket> {
  return exactRow(req, `SELECT id, program_id, manifest_hash, risk_code_map_version, risk_vocab_hash
    FROM predicate.defense_packets WHERE program_id = $1::uuid AND (id::text = $2 OR manifest_hash = $2) LIMIT 2`, key);
}
export function requireBoundProofPack(req: Request, key: unknown): Promise<BoundPacket> {
  return exactRow(req, `SELECT pp.id, pp.program_id, pp.manifest_hash FROM predicate.proof_pack_exports pp
    JOIN predicate.defense_packets dp ON dp.id = pp.defense_packet_id AND dp.program_id = pp.program_id
    WHERE pp.program_id = $1::uuid AND pp.id::text = $2 LIMIT 2`, key);
}
export function requireBoundRender(req: Request, key: unknown): Promise<BoundPacket> {
  return exactRow(req, `SELECT rj.id, pp.program_id, pp.manifest_hash FROM predicate.render_jobs rj
    JOIN predicate.proof_pack_exports pp ON pp.id = rj.proof_pack_id
    JOIN predicate.defense_packets dp ON dp.id = pp.defense_packet_id AND dp.program_id = pp.program_id
    WHERE pp.program_id = $1::uuid AND rj.id::text = $2 LIMIT 2`, key);
}
/** A successful external write is not rolled back by a failed BFF readback. */
export async function confirmShadowMutation<T>(req: Request, confirm: () => Promise<T>, recoverySuffix: string): Promise<T> {
  try { return await confirm(); }
  catch {
    throw new ShadowContractRefusal(503, 'SHADOW_OPERATION_UNCONFIRMED',
      'The external operation may have completed, but its stored project binding could not be confirmed. Review the existing records before retrying.',
      `/api/programs/${encodeURIComponent(String(req.params.programId))}/predicate-intel/${recoverySuffix}`);
  }
}

/** Carry every attempted event, including a lost earlier event, on this response. */
export async function recordShadowAudit(res: Response, entry: Parameters<typeof logAuditEvent>[0]): Promise<void> {
  let result: Awaited<ReturnType<typeof logAuditEvent>> | undefined;
  let thrown: string | undefined;
  try { result = await logAuditEvent(entry); }
  catch (error) { thrown = error instanceof Error ? error.message : String(error); }
  const current = auditRowOutcomeFrom(result, { action: `${entry.category}.${entry.action}`, resourceType: entry.resourceType, resourceId: entry.resourceId, thrown });
  const previous = res.locals.shadowPacketAudit as AuditRowOutcome | undefined;
  const combined = previous ? combineAuditRowOutcomes(previous, current) : current;
  res.locals.shadowPacketAudit = combined;
  setAuditRowHeaders(res, combined);
}

