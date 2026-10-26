/** One transaction and current canonical authority for CAPA state and its
 * vigilance/audit trail. Caller identity is supplied by trusted API/AnA
 * context, never by model arguments or the historical actor display fields. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { pool } from '../../db';
import { getTenantScope } from '../../db/tenantStore';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from '../authoring/authoring-program-access';
import { readCsrProjectActor } from '../csr/project-scope';
import { programInOrganization } from '../c2c/program-access';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('governed-capa');

export interface CapaCaller { userId: number }
export type AuditedCapaResult<T> = T & { auditTrail: { persisted: true; chained: true } };
export class CapaAccessError extends Error {
  readonly status = 403;
  readonly code = 'CAPA_ACTOR_REQUIRED';
  constructor() { super('A current organization member with permission for this operation is required.'); this.name = 'CapaAccessError'; }
}
export class CapaPersistenceError extends Error {
  readonly status = 503;
  constructor(readonly code: 'CAPA_COMMIT_UNCONFIRMED' | 'CAPA_PERSISTENCE_UNAVAILABLE' | 'CAPA_AUDIT_UNAVAILABLE',
    readonly recovery?: { recordId: string; recoveryUrl: string }) {
    super(code === 'CAPA_COMMIT_UNCONFIRMED'
      ? 'The commit result could not be confirmed. Read back this record before retrying; it may already have completed.'
      : 'The governed CAPA operation could not be completed. Read the current record before retrying.');
    this.name = 'CapaPersistenceError';
  }
}
interface CapaContext {
  organizationId: number; caller: CapaCaller; role: string; write: boolean;
  db: NodePgDatabase; q: PoolClient; auditWrites: number;
  recovery?: { recordId: string; recoveryUrl: string };
}
const context = new AsyncLocalStorage<CapaContext>();

export function capaContext(): CapaContext {
  const active = context.getStore();
  if (!active) throw new CapaAccessError();
  return active;
}

async function admittedActor(q: PoolClient, organizationId: number, caller: CapaCaller, write: boolean): Promise<string> {
  if (!Number.isSafeInteger(organizationId) || organizationId < 1 || !Number.isSafeInteger(caller?.userId) || caller.userId < 1) throw new CapaAccessError();
  const scope = getTenantScope();
  if (scope && scope.tenantId !== String(organizationId)) throw new CapaAccessError();
  let actor;
  try { actor = await readCsrProjectActor(q, organizationId, caller.userId); }
  catch (error) {
    if (error instanceof Error && error.name === 'CsrScopeError') throw new CapaAccessError();
    throw error;
  }
  if (write && !GOVERNED_WRITE_ROLES.has(actor.role ?? '')) throw new CapaAccessError();
  return actor.role ?? '';
}

function isGovernedCapaRefusal(error: unknown): boolean {
  if (error instanceof CapaAccessError || error instanceof CapaPersistenceError || error instanceof AuthoringProgramAccessError) return true;
  return error instanceof Error && ['TenantAccessError', 'NotFoundError', 'InvalidTransitionError'].includes(error.name);
}

function requireCapaAuditWrite(active: CapaContext): void {
  if (active.write && active.auditWrites < 1) throw new CapaPersistenceError('CAPA_AUDIT_UNAVAILABLE');
}

async function run<T>(organizationId: number, caller: CapaCaller, write: boolean, action: () => Promise<T>): Promise<T> {
  // Missing callers are rejected before acquiring a connection. A service is
  // also reachable from AnA, so an HTTP-only writer gate cannot substitute.
  if (!Number.isSafeInteger(caller?.userId) || caller.userId < 1) throw new CapaAccessError();
  let q: PoolClient;
  try { q = await pool.connect(); }
  catch { throw new CapaPersistenceError('CAPA_PERSISTENCE_UNAVAILABLE'); }
  let committing = false;
  let discard = false;
  let active: CapaContext | undefined;
  try {
    await q.query('BEGIN');
    const role = await admittedActor(q, organizationId, caller, write);
    active = { organizationId, caller, role, write, db: drizzle(q), q, auditWrites: 0 };
    const result = await context.run(active, action);
    requireCapaAuditWrite(active);
    committing = true;
    await q.query('COMMIT');
    return result;
  } catch (error) {
    log.warn('Governed CAPA transaction did not return confirmed success', { organizationId,
      phase: committing ? 'commit' : 'before-commit', code: (error as { code?: string })?.code ?? null });
    if (committing) {
      discard = true;
      throw new CapaPersistenceError(write ? 'CAPA_COMMIT_UNCONFIRMED' : 'CAPA_PERSISTENCE_UNAVAILABLE', active?.recovery);
    }
    try { await q.query('ROLLBACK'); } catch { discard = true; }
    if (isGovernedCapaRefusal(error)) throw error;
    throw new CapaPersistenceError('CAPA_PERSISTENCE_UNAVAILABLE');
  } finally { q.release(discard); }
}

export function readCapa<T>(organizationId: number, caller: CapaCaller, action: () => Promise<T>): Promise<T> {
  return run(organizationId, caller, false, action);
}
export async function mutateCapa<T>(organizationId: number, caller: CapaCaller, action: () => Promise<T>): Promise<AuditedCapaResult<T>> {
  const row = await run(organizationId, caller, true, action);
  return { ...row, auditTrail: { persisted: true, chained: true } };
}

export async function authorizeCapaProgram(programId: string): Promise<void> {
  const active = capaContext();
  let admitted;
  try {
    admitted = await authorizeAuthoringProgram(active.q, { tenantId: active.organizationId,
      actor: { id: String(active.caller.userId), email: '' }, programId, forWrite: active.write });
  } catch (error) {
    if (!(error instanceof AuthoringProgramAccessError)) throw error;
    const message = error.code === 'PROJECT_ANCHOR_UNRESOLVED'
      ? 'A verified tracking record is required to access this project’s governed records.'
      : error.status === 503 ? 'Current project access could not be verified. Nothing was changed.'
      : error.status === 404 ? 'Project not found.' : 'Your current access does not permit this project operation.';
    throw new AuthoringProgramAccessError(error.status, error.code, message);
  }
  active.role = admitted.role;
  if (active.write) {
    // Canonical authority is checked before acquiring the programme lock.
    // This serializes generated display codes and all local state changes.
    if (!await programInOrganization(active.q, programId, active.organizationId, { forUpdate: true })) throw new AuthoringProgramAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    const project = await active.q.query(`SELECT id FROM projects WHERE id=$1 AND organization_id=$2
      AND regulatory_program_id=$3 FOR UPDATE`, [admitted.projectId, active.organizationId, programId]);
    if (project.rows.length !== 1) throw new AuthoringProgramAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'A verified tracking record is required for this project.');
    // Existing ACL updates/deletes are held; the parent project lock also
    // serializes inserts of absent FK-backed visibility/membership rows.
    await active.q.query('SELECT id FROM project_visibility_settings WHERE project_id=$1 AND organization_id=$2 FOR SHARE', [admitted.projectId, active.organizationId]);
    await active.q.query('SELECT id FROM project_members WHERE project_id=$1 AND organization_id=$2 AND user_id=$3 FOR SHARE', [admitted.projectId, active.organizationId, active.caller.userId]);
    await active.q.query(`SELECT ra.id FROM concept2cure_review_assignments ra
      JOIN concept2cure_artifacts a ON a.id=ra.artifact_id AND a.organization_id=ra.organization_id
      WHERE a.project_id=$1 AND ra.organization_id=$2 AND ra.reviewer_id=$3 FOR SHARE OF ra,a`, [admitted.projectId, active.organizationId, active.caller.userId]);
    // Fresh statements after any waits admit the policy that actually exists
    // now, while its dependencies remain locked through the governed commit.
    const current = await authorizeAuthoringProgram(active.q, { tenantId: active.organizationId,
      actor: { id: String(active.caller.userId), email: '' }, programId, forWrite: true });
    active.role = current.role;
  }
}

/** Lists contain only currently readable, uniquely anchored programmes.
 * Explicit programme requests retain the canonical 403/404/409 refusal. */
export async function visibleCapaPrograms(requested?: string): Promise<string[]> {
  if (requested) { await authorizeCapaProgram(requested); return [requested]; }
  const active = capaContext();
  const candidates = await active.q.query('SELECT id::text FROM regulatory_programs WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY id', [active.organizationId]);
  const visible: string[] = [];
  for (const candidate of candidates.rows) {
    try { await authorizeCapaProgram(String(candidate.id)); visible.push(String(candidate.id)); }
    catch (error) {
      // Only evaluated object exclusions shrink a list. A lost actor or a
      // verification outage remains an error, never an apparently empty queue.
      if (!(error instanceof AuthoringProgramAccessError)
        || !['PROJECT_PERMISSION_DENIED', 'PROJECT_NOT_FOUND', 'PROJECT_ANCHOR_UNRESOLVED'].includes(error.code)) throw error;
    }
  }
  return visible;
}
