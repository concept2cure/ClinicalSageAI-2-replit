/** RBM admission composes the existing project and commercial policies. */
import type { Request, RequestHandler, Response } from 'express';
import { requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { requireCurrentProgramAccess } from '../c2c/current-program-access';
import { requireGovernedProgramWriteTx } from '../c2c/governed-program-write';
import { toolAuthorizationOf } from '../ana/tool-authorization';

export type RbmRecordKind = 'assessment' | 'item' | 'kri' | 'qtl' | 'signal' | 'plan' | 'action' | 'patient';
export interface RbmActor { organizationId: number; userId: number }
interface Target { programId?: unknown; records?: Array<{ kind: RbmRecordKind; id: unknown }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLES: Record<Exclude<RbmRecordKind, 'action'>, string> = { assessment: 'rbm_risk_assessments', item: 'rbm_risk_items', kri: 'rbm_kris', qtl: 'rbm_qtls', signal: 'rbm_signals', plan: 'rbm_monitoring_plans', patient: 'rbm_patient_profiles' };
export const RBM_TOOL_NAMES: ReadonlySet<string> = new Set(['run_rbm_assessment', 'assess_site_risk', 'evaluate_kris_qtls', 'generate_rbm_plan', 'prioritize_monitoring_queries', 'run_central_monitoring', 'scan_patient_profiles', 'generate_rbm_report', 'get_rbm_attention', 'add_ctq_factor', 'define_kri', 'record_kri_reading', 'set_qtl', 'raise_monitoring_signal', 'triage_signal', 'draft_monitoring_plan', 'create_monitoring_action', 'update_monitoring_action', 'approve_rbm_assessment', 'approve_rbm_plan']);
export class RbmAccessError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'RbmAccessError'; } }
const invalid = () => new RbmAccessError(422, 'RBM_PROJECT_REQUIRED', 'Choose the recorded project for this monitoring operation.');
function actor(organizationId: unknown, userId: unknown): RbmActor {
  const org = Number(organizationId), user = Number(userId);
  if (!Number.isSafeInteger(org) || org <= 0 || !Number.isSafeInteger(user) || user <= 0) throw new RbmAccessError(403, 'RBM_ACTOR_REQUIRED', 'A current organization member is required.');
  return { organizationId: org, userId: user };
}
async function recordProgram(q: RequestSqlClient, identity: RbmActor, kind: RbmRecordKind, rawId: unknown): Promise<string> {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) throw invalid();
  const sql = kind === 'action'
    ? 'SELECT p.program_id::text AS program_id FROM rbm_monitoring_actions a JOIN rbm_monitoring_plans p ON p.id=a.plan_id AND p.organization_id=a.organization_id WHERE a.organization_id=$1 AND a.id=$2 AND p.deleted_at IS NULL'
    : `SELECT program_id::text AS program_id FROM ${TABLES[kind]} WHERE organization_id=$1 AND id=$2 AND deleted_at IS NULL`;
  const { rows } = await q.query(sql, [identity.organizationId, id]);
  if (rows.length !== 1) throw new RbmAccessError(404, 'RBM_RECORD_NOT_FOUND', 'Monitoring record not found.');
  if (typeof rows[0].program_id !== 'string' || !UUID.test(rows[0].program_id)) throw new RbmAccessError(409, 'RBM_PROJECT_UNANCHORED', 'This monitoring record needs a verified project relationship.');
  return rows[0].program_id.toLowerCase();
}
/** An admitted read never grants write authority. Writers recheck on their transaction. */
export async function requireRbmProgram(q: RequestSqlClient, identity: RbmActor, target: Target, write = false): Promise<string> {
  actor(identity.organizationId, identity.userId);
  let program: string | undefined;
  if (target.programId !== undefined && target.programId !== null) {
    if (typeof target.programId !== 'string' || !UUID.test(target.programId)) throw invalid();
    program = target.programId.toLowerCase();
  }
  for (const record of target.records ?? []) {
    if (record.id === undefined || record.id === null) continue;
    const parent = await recordProgram(q, identity, record.kind, record.id);
    if (program && program !== parent) throw new RbmAccessError(409, 'RBM_PROJECT_MISMATCH', 'The monitoring records do not belong to the same project.');
    program = parent;
  }
  if (!program) throw invalid();
  await requireCurrentProgramAccess(q, { ...identity, programId: program });
  if (write) await requireGovernedProgramWriteTx(q, identity.organizationId, identity.userId, program);
  return program;
}
export function rbmAccessFailure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof RbmAccessError) return { status: error.status, code: error.code, message: error.message };
  const known = error as { status?: number; code?: string } | null;
  if (known && [403, 404, 409, 503].includes(Number(known.status)) && typeof known.code === 'string') return { status: Number(known.status), code: known.code, message: 'Current project access does not permit this monitoring operation or could not be verified.' };
  return { status: 503, code: 'RBM_ACCESS_UNAVAILABLE', message: 'Current monitoring project access could not be verified. Try again.' };
}
export function respondRbmAccessFailure(res: Response, error: unknown) { const out = rbmAccessFailure(error); return res.status(out.status).json({ success: false, error: out.message, code: out.code }); }
const FAMILIES: Record<string, RbmRecordKind | null> = { 'rbm-assessments': 'assessment', 'rbm-risk-items': 'item', 'rbm-kris': 'kri', 'rbm-qtls': 'qtl', 'rbm-signals': 'signal', 'rbm-monitoring-plans': 'plan', 'rbm-monitoring-actions': 'action', 'rbm-patient-profiles': 'patient', 'rbm-site-risk': null, 'rbm-central-monitoring': null, 'rbm-metric-ingest': null, 'rbm-data-runs': null, 'rbm-site-oversight': null, 'rbm-summary': null, 'rbm-report': null, 'rbm-attention': null };
export const RBM_HTTP_PREFIXES = Object.keys(FAMILIES).map(family => `/api/mdx/${family}`);
const RECORD_FIELDS: Array<[string, RbmRecordKind]> = [['assessmentId', 'assessment'], ['assessment_id', 'assessment'], ['riskItemId', 'item'], ['risk_item_id', 'item'], ['kriId', 'kri'], ['qtlId', 'qtl'], ['signalId', 'signal'], ['planId', 'plan'], ['plan_id', 'plan'], ['actionId', 'action']];
function relatedRecords(input: Record<string, unknown>): NonNullable<Target['records']> { return RECORD_FIELDS.filter(([field]) => input[field] != null).map(([field, kind]) => ({ kind, id: input[field] })); }
const admissions = new WeakMap<Request, { identity: RbmActor; programId: string }>();
function coherentProgram(values: unknown[]): string | undefined {
  const named = values.filter(value => value !== undefined && value !== null);
  if (!named.length) return undefined;
  if (!named.every(value => typeof value === 'string' && UUID.test(value))) throw invalid();
  const ids = named.map(value => String(value).toLowerCase());
  if (ids.some(id => id !== ids[0])) throw new RbmAccessError(409, 'RBM_PROJECT_MISMATCH', 'The monitoring request names different projects.');
  return ids[0];
}
function decodedPath(req: Request): string[] {
  try { return req.path.split('/').filter(Boolean).map(part => decodeURIComponent(part).toLowerCase()); }
  catch { throw invalid(); }
}
function requireConsumedCreateProgram(method: string, family: string, tail: string | undefined, body: Record<string, unknown>): void {
  if (method !== 'POST' || family === 'rbm-monitoring-actions') return;
  const creating = !tail || ['seed', 'generate', 'score', 'run', 'recompute'].includes(tail);
  if (creating && !UUID.test(String(body.programId ?? ''))) throw invalid();
}
function requestTarget(req: Request, parts: string[]): Target {
  const family = parts[0], tail = parts[1], kind = FAMILIES[family];
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const query = req.query as Record<string, unknown>;
  requireConsumedCreateProgram(req.method, family, tail, body);
  const pathOwned = ['rbm-summary', 'rbm-report', 'rbm-attention', 'rbm-site-oversight'].includes(family);
  if (pathOwned && (!tail || !UUID.test(tail))) throw invalid();
  // A collection handler filters on query.program_id, not an ignored alias/body.
  if (['GET', 'HEAD'].includes(req.method) && !tail && !UUID.test(String(query.program_id ?? ''))) throw invalid();
  const records = [...relatedRecords(query), ...relatedRecords(body)];
  if (kind && tail && !['seed', 'generate', 'score'].includes(tail)) records.unshift({ kind, id: tail });
  return { programId: coherentProgram([query.programId, query.program_id, body.programId, body.program_id, pathOwned ? tail : undefined]), records };
}
/** Inert for every other router stacked under /api/mdx. */
export const rbmRequestAdmission: RequestHandler = async (req, res, next) => {
  const rawFamily = req.path.split('/').filter(Boolean)[0]?.toLowerCase();
  if (!rawFamily || !Object.hasOwn(FAMILIES, rawFamily)) { next(); return; }
  try {
    const parts = decodedPath(req), family = parts[0];
    if (!Object.hasOwn(FAMILIES, family)) { next(); return; }
    const principal = (req as Request & { user?: { id?: unknown; organizationId?: unknown } }).user;
    const identity = actor(principal?.organizationId, principal?.id), q = requestPgClient(req);
    const programId = await requireRbmProgram(q, identity, requestTarget(req, parts), !['GET', 'HEAD', 'OPTIONS'].includes(req.method));
    admissions.set(req, { identity, programId }); next();
  } catch (error) { respondRbmAccessFailure(res, error); }
};
export async function recheckRbmWrite(req: Request, q: RequestSqlClient): Promise<void> {
  const admission = admissions.get(req);
  if (!admission) throw invalid();
  await requireRbmProgram(q, admission.identity, { programId: admission.programId }, true);
}
interface ToolIdentity { organizationId?: number | null; userId?: number | null; sqlClient?: RequestSqlClient }
async function commercialRefusal(identity: RbmActor): Promise<{ code: string; result: string } | null> {
  const { currentEnforcementMode } = await import('../entitlements/enforcement-mode');
  const { mode } = await currentEnforcementMode();
  if (mode === 'off') return null;
  try {
    const { resolveMasterAdmin } = await import('../entitlements/master-admin');
    // Tool context lends only the verified principal id, never an invented role, email or provider.
    if (await resolveMasterAdmin({ user: { id: identity.userId } } as unknown as Request)) return null;
    const { canAccessModule } = await import('../license-manager');
    const verdict = await canAccessModule(identity.organizationId, 'rbm');
    if (verdict.allowed) return null;
    const { recordObservation } = await import('../entitlements/enforcement-observations');
    recordObservation({ path: 'ana:rbm', organizationId: identity.organizationId, modules: ['rbm'], reasons: [verdict.reason ?? 'RBM is not included.'], enforced: mode === 'enforce' });
    return mode === 'enforce' ? { code: 'MODULE_NOT_ENTITLED', result: JSON.stringify({ code: 'MODULE_NOT_ENTITLED', error: 'Risk-based monitoring is not included for this organization.' }) } : null;
  } catch {
    // Match the canonical commercial gate's fail-open resolution-error policy.
    const { createScopedLogger } = await import('../../utils/logger');
    createScopedLogger('rbm-access').error('RBM commercial entitlement resolution unavailable; retaining canonical mode behavior');
    return null;
  }
}
export async function rbmToolAdmissionRefusal(name: string, input: Record<string, unknown>, ctx?: ToolIdentity): Promise<{ code: string; result: string } | null> {
  if (!RBM_TOOL_NAMES.has(name) || name === 'approve_rbm_assessment' || name === 'approve_rbm_plan') return null;
  try {
    const identity = actor(ctx?.organizationId, ctx?.userId);
    const commercial = await commercialRefusal(identity);
    if (commercial) return commercial;
    const { getPool } = await import('../../db');
    await requireRbmProgram(ctx?.sqlClient ?? getPool(), identity, { programId: coherentProgram([input.programId, input.program_id]), records: relatedRecords(input) }, toolAuthorizationOf(name, input).class === 'confirm');
    return null;
  } catch (error) { const out = rbmAccessFailure(error); return { code: out.code, result: JSON.stringify({ code: out.code, error: out.message }) }; }
}
