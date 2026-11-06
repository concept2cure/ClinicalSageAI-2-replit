/**
 * The one writer of a tenant's AI placement policy (`ai_placement_policies`).
 *
 * Until 2026-09-25 nothing in the application wrote residency, zero retention
 * or the allow-lists: the gateway enforced a policy that only a hand-run SQL
 * statement could set, and nothing recorded who set it or why
 * (docs/evidence/D6/2026-09-25-tenant-boundary/). This writer is reached from
 * PUT /api/ai-placement-policy (server/routes/ai-placement-policy.ts), which
 * admits an organization admin or owner only.
 *
 * A change is a governed action:
 *  - the whole policy is stated on every write, so an omitted field can never
 *    silently reset a constraint;
 *  - a reason for change is required;
 *  - the row and its chained `audit_logs` entry (before, after, reason) commit
 *    in one transaction, or neither does;
 *  - a policy no AI service could ever satisfy is refused, so a typo cannot
 *    turn off a tenant's AI without anyone saying so. A lane whose placement
 *    the deployment decides (Bedrock, Vertex, Azure) counts as possible: the
 *    policy may be set before the lane is deployed, and until it is, the
 *    tenant's requests are refused with DENY_TENANT_POLICY and recorded;
 *  - the resolver cache is invalidated on commit, so the change governs this
 *    process's next dispatch; other processes converge within the resolver TTL.
 *
 * `preferred_ai_provider` (a separate, unapplied column) is not touched.
 *
 * The provider election (ADR-0014 §1, P1-45): in production a NULL
 * `allowedProviders` is the default set (anthropic, bedrock, local), and
 * OpenAI, Azure or Vertex is used only when the list names it — so this is
 * where an administrator elects OpenAI, and the satisfiability check reads the
 * list the same way the gateway does. A list naming Moonshot is refused in
 * production: the gateway would never honour it.
 *
 * @module server/services/ai-gateway/providers/org-placement-writer
 */

import { writeChainedAuditRow } from '../../auditService';
import type { DataResidency, ProviderName, SubstrateClass } from '../types';
import { PLACEMENT_PROVIDERS, PLACEMENT_SUBSTRATES, effectiveAllowedProviders,
  getOrgPlacementResolver, isProviderExcludedInEnvironment } from './org-placement';
import { isPlacementCompliant, resolvePlacement } from './placement';
import { createHash, randomUUID } from 'node:crypto';
import { isImmutableTenantKeyArn, sealTenantPayload, openTenantPayload, type TenantEnvelopeContext } from '../../security/field-encryption';
import { buildExplicitDerivative, derivativePayloadSha256, reinjectExplicitDerivative, type DerivativeSpan, type DerivativeTransform } from '../../observability/redaction';
import type { IStorageProvider } from '../../storage/storage-provider';

/** A complete tenant placement policy, as stored. null = no constraint. */
export interface StoredPlacementPolicy {
  residency: Exclude<DataResidency, 'any'> | null;
  zeroDataRetention: boolean;
  allowedSubstrates: SubstrateClass[] | null;
  allowedProviders: ProviderName[] | null;
  publicSourceFrontier: boolean;
  publicSourceEgress: boolean;
}

export type PlacementPolicyInput =
  | { ok: true; policy: StoredPlacementPolicy; reasonForChange: string }
  | { ok: false; message: string };

const WRITABLE_RESIDENCIES = new Set(['us', 'eu', 'apac', 'on_prem']);
const POLICY_KEYS = [
  'residency', 'zeroDataRetention', 'allowedSubstrates',
  'allowedProviders', 'publicSourceFrontier', 'publicSourceEgress',
] as const;
const REASON_MIN = 8;
const REASON_MAX = 2000;

function allowListInput<T extends string>(
  key: string,
  value: unknown,
  valid: ReadonlySet<T>,
): { ok: true; list: T[] | null } | { ok: false; message: string } {
  if (value === null) return { ok: true, list: null };
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      message: `${key} must be null (no constraint) or a non-empty list of: ${[...valid].join(', ')}.`,
    };
  }
  const unknown = value.filter(v => typeof v !== 'string' || !valid.has(v as T));
  return unknown.length > 0
    ? { ok: false, message: `${key} names unknown values: ${unknown.map(String).join(', ')}.` }
    : { ok: true, list: [...new Set(value as T[])] };
}

/**
 * Validate a PUT body into a complete policy. Every policy key must be present;
 * unknown keys are refused so a misspelt one cannot silently no-op.
 */
export function parsePlacementPolicyInput(body: unknown): PlacementPolicyInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'The request body must be a placement policy object.' };
  }
  const b = body as Record<string, unknown>;
  const problem = keysProblem(b) ?? reasonProblem(b.reasonForChange) ?? scalarsProblem(b);
  if (problem) return { ok: false, message: problem };
  const substrates = allowListInput('allowedSubstrates', b.allowedSubstrates, PLACEMENT_SUBSTRATES);
  if (!substrates.ok) return substrates;
  const providers = allowListInput('allowedProviders', b.allowedProviders, PLACEMENT_PROVIDERS);
  if (!providers.ok) return providers;
  const excluded = providers.list?.filter(p => isProviderExcludedInEnvironment(p)) ?? [];
  if (excluded.length > 0) {
    return {
      ok: false,
      message:
        `allowedProviders names ${excluded.join(', ')}, which is not a production AI service for any ` +
        'organization (ADR-0014 §1).',
    };
  }

  const policy: StoredPlacementPolicy = {
    residency: b.residency as StoredPlacementPolicy['residency'],
    zeroDataRetention: b.zeroDataRetention as boolean,
    allowedSubstrates: substrates.list,
    allowedProviders: providers.list,
    publicSourceFrontier: b.publicSourceFrontier as boolean,
    publicSourceEgress: b.publicSourceEgress as boolean,
  };
  const contradiction = placementPolicyContradiction(policy);
  if (contradiction) return { ok: false, message: contradiction };
  return { ok: true, policy, reasonForChange: (b.reasonForChange as string).trim() };
}

/** Unknown keys are refused, and every policy key must be present. */
function keysProblem(b: Record<string, unknown>): string | null {
  const unknown = Object.keys(b).find(
    k => k !== 'reasonForChange' && !(POLICY_KEYS as readonly string[]).includes(k),
  );
  if (unknown) return `Unknown policy key: ${unknown}.`;
  const missing = POLICY_KEYS.filter(k => !(k in b));
  return missing.length > 0
    ? `The whole policy is required on every change; missing: ${missing.join(', ')}.`
    : null;
}

function reasonProblem(value: unknown): string | null {
  const reason = typeof value === 'string' ? value.trim() : '';
  return reason.length < REASON_MIN || reason.length > REASON_MAX
    ? `reasonForChange must say why the policy is changing (${REASON_MIN}–${REASON_MAX} characters).`
    : null;
}

function scalarsProblem(b: Record<string, unknown>): string | null {
  if (b.residency !== null && !(typeof b.residency === 'string' && WRITABLE_RESIDENCIES.has(b.residency))) {
    return 'residency must be null (no constraint) or one of: us, eu, apac, on_prem.';
  }
  const notBoolean = (['zeroDataRetention', 'publicSourceFrontier', 'publicSourceEgress'] as const).find(
    k => typeof b[k] !== 'boolean',
  );
  return notBoolean ? `${notBoolean} must be true or false.` : null;
}

/**
 * A policy that no AI service could ever satisfy, whatever is deployed: the
 * vendor list and the substrate list share no service, or on-premises
 * residency with no self-hosted service allowed. Returns why, or null.
 */
export function placementPolicyContradiction(policy: StoredPlacementPolicy): string | null {
  // The vendors the gateway would admit for this list here: in production a
  // NULL list is the default set, and Moonshot is never one (ADR-0014 §1).
  const vendors = effectiveAllowedProviders(policy.allowedProviders);
  const candidates = [...PLACEMENT_PROVIDERS].filter(
    p =>
      (!vendors || vendors.includes(p)) &&
      (!policy.allowedSubstrates || policy.allowedSubstrates.includes(resolvePlacement(p).substrate)),
  );
  if (candidates.length === 0) {
    return 'No AI service is on both allowedProviders and allowedSubstrates; this policy would refuse every AI request.';
  }
  if (policy.residency === 'on_prem' && !candidates.some(p => resolvePlacement(p).substrate === 'self_hosted')) {
    return 'On-premises residency needs a self-hosted service (provider local, substrate self_hosted) to be allowed.';
  }
  if (!candidates.some(p => couldEverServe(p, policy))) {
    const needs = [policy.residency ? `residency ${policy.residency}` : null, policy.zeroDataRetention ? 'zero data retention' : null]
      .filter(Boolean)
      .join(' and ');
    return (
      `None of the allowed AI services can provide ${needs}: ${candidates.join(', ')}. ` +
      'This policy would refuse every AI request.'
    );
  }
  return null;
}

/**
 * Lanes whose residency and retention are set by the deployment (the region a
 * private-cloud client calls, an operator's recorded ZDR). The writer cannot
 * know them when the policy is set, which may be before the lane is deployed,
 * so they are taken as possibly satisfiable.
 */
const DEPLOYMENT_DEFINED: ReadonlySet<ProviderName> = new Set<ProviderName>(['bedrock', 'vertex', 'azure']);
/** Shared lanes whose zero retention is an operator setting (a signed agreement). */
const ZDR_BY_AGREEMENT: ReadonlySet<ProviderName> = new Set<ProviderName>(['anthropic', 'openai']);

/**
 * Could `provider` ever serve this policy's residency and retention? The
 * shared frontier lanes have no residency (placement.ts: 'global'), and Kimi
 * offers no zero retention, whatever is deployed — so those combinations are
 * refused at write time rather than turning a tenant's AI off with a 200.
 */
function couldEverServe(provider: ProviderName, policy: StoredPlacementPolicy): boolean {
  if (DEPLOYMENT_DEFINED.has(provider)) return true;
  const placement = resolvePlacement(provider);
  const zdrPossible = placement.zeroDataRetention || ZDR_BY_AGREEMENT.has(provider);
  if (policy.zeroDataRetention && !zdrPossible) return false;
  return isPlacementCompliant(placement, { residency: policy.residency ?? undefined });
}

interface PolicyRow {
  required_data_residency: string | null;
  zero_data_retention: boolean;
  allowed_substrates: string[] | null;
  allowed_providers: string[] | null;
  public_source_frontier: boolean;
  public_source_egress: boolean;
}

function fromRow(row: PolicyRow): StoredPlacementPolicy {
  return {
    residency: (row.required_data_residency ?? null) as StoredPlacementPolicy['residency'],
    zeroDataRetention: row.zero_data_retention === true,
    allowedSubstrates: (row.allowed_substrates ?? null) as SubstrateClass[] | null,
    allowedProviders: (row.allowed_providers ?? null) as ProviderName[] | null,
    publicSourceFrontier: row.public_source_frontier === true,
    publicSourceEgress: row.public_source_egress === true,
  };
}

const SELECT_POLICY = `SELECT required_data_residency, zero_data_retention, allowed_substrates,
        allowed_providers, public_source_frontier, public_source_egress
   FROM ai_placement_policies
  WHERE organization_id = $1`;

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }
interface PoolLike extends Queryable {
  connect: () => Promise<Queryable & { release: () => void }>;
}

/** The stored policy for an org, or null when it has none (no constraint). */
export async function readOrgPlacementPolicy(
  pool: Queryable,
  organizationId: number,
): Promise<StoredPlacementPolicy | null> {
  const { rows } = await pool.query(`${SELECT_POLICY} LIMIT 1`, [organizationId]);
  return rows[0] ? fromRow(rows[0] as PolicyRow) : null;
}

export interface PlacementPolicyActor {
  userId: number;
  ipAddress?: string | null;
  userAgent?: string;
}

/**
 * Replace an org's placement policy and record the change, in one transaction.
 * Throws when either write fails; nothing is committed in that case.
 */
export async function writeOrgPlacementPolicy(
  pool: PoolLike,
  organizationId: number,
  policy: StoredPlacementPolicy,
  reasonForChange: string,
  actor: PlacementPolicyActor,
): Promise<{ previousPolicy: StoredPlacementPolicy | null; policy: StoredPlacementPolicy }> {
  const client = await pool.connect();
  let previousPolicy: StoredPlacementPolicy | null;
  try {
    await client.query('BEGIN');
    // Serialize changes to this org's policy, including the first one: with no
    // row yet, FOR UPDATE locks nothing, so two first-time writes each read
    // "no previous policy" and the second's audit row hid what it replaced.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ai_placement_policy:' || $1::text))`, [
      organizationId,
    ]);
    const { rows } = await client.query(`${SELECT_POLICY} FOR UPDATE`, [organizationId]);
    previousPolicy = rows[0] ? fromRow(rows[0] as PolicyRow) : null;
    await client.query(
      `INSERT INTO ai_placement_policies
         (organization_id, required_data_residency, zero_data_retention, allowed_substrates,
          allowed_providers, public_source_frontier, public_source_egress)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id) DO UPDATE SET
         required_data_residency = EXCLUDED.required_data_residency,
         zero_data_retention     = EXCLUDED.zero_data_retention,
         allowed_substrates      = EXCLUDED.allowed_substrates,
         allowed_providers       = EXCLUDED.allowed_providers,
         public_source_frontier  = EXCLUDED.public_source_frontier,
         public_source_egress    = EXCLUDED.public_source_egress,
         updated_at              = NOW()`,
      [organizationId, ...POLICY_KEYS.map(key => policy[key])],
    );
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: actor.userId,
      action: 'ai_placement_policy.update',
      resourceType: 'ai_placement_policies',
      resourceId: String(organizationId),
      ipAddress: actor.ipAddress ?? undefined,
      userAgent: actor.userAgent,
      details: { previousPolicy, newPolicy: policy, reasonForChange },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  getOrgPlacementResolver().invalidate?.(organizationId);
  return { previousPolicy, policy };
}


/** Managed metadata only. Ciphertext and the candidate residual live in the
 * existing tenant byte store, never in settings, audit details or tool output. */
export interface DerivativePolicy { enabled: boolean; kmsKeyArn: string; maxLifetimeSeconds: number; version: number }
export interface DerivativeUseInput { organizationId: number; userId: number; projectId: number; derivativeId: string }
export interface DerivativePool extends Queryable { connect(): Promise<Queryable & { release(error?: Error): void }> }
interface DerivativeRecord extends TenantEnvelopeContext {
  documentId: string; extractedTextSha256: string; programId: string; version: number;
  status: 'prepared' | 'attested' | 'revoked'; payloadSha256: string;
  storage: { provider: string; versionId: string; sha256: string };
  createdBy: number; attestedBy?: number; attestedAt?: string;
}
export interface DerivativeCustodyView { policy: DerivativePolicy | null; records: DerivativeRecord[] }
interface CustodyState { policy: DerivativePolicy | null; records: Record<string, DerivativeRecord> }
export type DerivativeAction = { reasonForChange: string } & (
  | { action: 'derivative_policy'; policy: Omit<DerivativePolicy, 'version'> }
  | { action: 'derivative_prepare'; projectId: number; documentId: string; template: string; spans: DerivativeSpan[]; expiresInSeconds: number }
  | { action: 'derivative_review'; projectId: number; derivativeId: string }
  | { action: 'derivative_attest'; projectId: number; derivativeId: string; payloadSha256: string; expectedVersion: number }
  | { action: 'derivative_revoke'; projectId: number; derivativeId: string; payloadSha256: string; expectedVersion: number }
);
export interface DerivativeReviewView { derivativeId: string; version: number; exactPayload: string; payloadSha256: string; expiresAt: string }
export interface DerivativeSourceBinding { readonly documentId: string; readonly programId: string; readonly contentHash: string; readonly extractedTextSha256: string; readonly projectId: number }
export interface AuthorizedDerivativeUse {
  readonly exactPayload: string; readonly payloadSha256: string; readonly authorityFingerprint: string;
  readonly originTier: 2; readonly effectiveTier: 1; readonly policyVersion: number;
  readonly expiresAt: string; readonly derivativeId: string;
  readonly placementPolicy: StoredPlacementPolicy;
  readonly sourceBinding: DerivativeSourceBinding;
}
export class DerivativeCustodyError extends Error {
  readonly code = 'DERIVATIVE_USE_REFUSED';
  readonly status: 400 | 403 | 404 | 409 | 503 = 403;
  constructor() { super('Current derivative custody, source access or human attestation could not be verified. No derivative content was released.'); this.name = 'DerivativeCustodyError'; }
}
function derivativeDenied(): never { throw new DerivativeCustodyError(); }
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : derivativeDenied();
function policyOf(value: unknown): DerivativePolicy {
  const v = object(value);
  if (typeof v.enabled !== 'boolean' || !isImmutableTenantKeyArn(v.kmsKeyArn) || !positive(v.version) ||
      !positive(v.maxLifetimeSeconds) || v.maxLifetimeSeconds > 86400) derivativeDenied();
  return { enabled: v.enabled, kmsKeyArn: v.kmsKeyArn, version: v.version, maxLifetimeSeconds: v.maxLifetimeSeconds };
}
function recordLifecycle(v: Record<string, any>): void {
  if (!['prepared', 'attested', 'revoked'].includes(v.status) || typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt))) derivativeDenied();
  if (v.status === 'attested' && (!positive(v.attestedBy) || typeof v.attestedAt !== 'string' || !Number.isFinite(Date.parse(v.attestedAt)))) derivativeDenied();
}
function recordOf(value: unknown, id: string): DerivativeRecord {
  const v = object(value);
  const keys = ['organizationId', 'projectId', 'derivativeId', 'sourceHash', 'policyVersion', 'expiresAt', 'documentId',
    'extractedTextSha256', 'programId', 'version', 'status', 'payloadSha256', 'storage', 'createdBy', 'attestedBy', 'attestedAt'];
  if (Object.keys(v).some(key => !keys.includes(key))) derivativeDenied();
  if (!uuid(id) || v.derivativeId !== id || !uuid(v.documentId) || !uuid(v.programId) ||
      ![v.organizationId, v.projectId, v.policyVersion, v.version, v.createdBy].every(positive) ||
      !sha(v.sourceHash) || !sha(v.extractedTextSha256) || !sha(v.payloadSha256)) derivativeDenied();
  const storage = object(v.storage);
  if (!sha(storage.sha256) || !uuid(storage.versionId) || !['local', 's3'].includes(storage.provider)) derivativeDenied();
  recordLifecycle(v);
  return v as DerivativeRecord;
}
function custodyOf(settings: unknown): CustodyState {
  const raw = object(settings ?? {}).derivativeCustody;
  if (raw === undefined) return { policy: null, records: {} };
  const v = object(raw), entries = Object.entries(object(v.records));
  if (entries.length > 1000) derivativeDenied();
  return { policy: v.policy === null ? null : policyOf(v.policy), records: Object.fromEntries(entries.map(([id, record]) => [id, recordOf(record, id)])) };
}
const custodyCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const derivativeActionId = (action: DerivativeAction, prepared?: DerivativeRecord): string | undefined =>
  'derivativeId' in action ? action.derivativeId : prepared?.derivativeId;
function custodyAuditDetails(state: CustodyState, prior: { policy: DerivativePolicy | null; record: DerivativeRecord | null }, id?: string) {
  return { previousPolicy: prior.policy, policy: state.policy, previousRecord: prior.record, record: id ? state.records[id] : null };
}
function derivativeActionFields(b: Record<string, any>): void {
  if (b.action === 'derivative_policy') {
    if (Object.keys(object(b.policy)).some(k => !['enabled', 'kmsKeyArn', 'maxLifetimeSeconds'].includes(k))) derivativeDenied();
    policyOf({ ...b.policy, version: 1 }); return;
  }
  if (!positive(b.projectId)) derivativeDenied();
  if (b.action === 'derivative_prepare') {
    if (!uuid(b.documentId) || typeof b.template !== 'string' || !Array.isArray(b.spans) || !positive(b.expiresInSeconds)) derivativeDenied();
    return;
  }
  if (!uuid(b.derivativeId)) derivativeDenied();
  if (b.action === 'derivative_review') return;
  if (!positive(b.expectedVersion) || !sha(b.payloadSha256)) derivativeDenied();
}
export function parseDerivativeAction(body: unknown): DerivativeAction {
  const b = object(body);
  if (typeof b.reasonForChange !== 'string' || b.reasonForChange.trim().length < 8 || b.reasonForChange.length > 2000) derivativeDenied();
  const keys: Record<string, string[]> = {
    derivative_policy: ['policy'], derivative_prepare: ['projectId', 'documentId', 'template', 'spans', 'expiresInSeconds'],
    derivative_review: ['projectId', 'derivativeId'], derivative_attest: ['projectId', 'derivativeId', 'payloadSha256', 'expectedVersion'],
    derivative_revoke: ['projectId', 'derivativeId', 'payloadSha256', 'expectedVersion'],
  };
  const allowed = typeof b.action === 'string' && Object.prototype.hasOwnProperty.call(keys, b.action) ? keys[b.action] : undefined;
  if (!allowed || Object.keys(b).some(k => !['action', 'reasonForChange', ...allowed].includes(k)) || allowed.some(k => !(k in b))) derivativeDenied();
  derivativeActionFields(b);
  return JSON.parse(JSON.stringify(b)) as DerivativeAction;
}
async function loadCustody(q: Queryable, orgId: number, lock = false): Promise<{ settings: Record<string, any>; state: CustodyState }> {
  if (!positive(orgId)) derivativeDenied();
  const { rows } = await q.query(`SELECT settings FROM organizations WHERE id=$1 AND status='active'${lock ? ' FOR UPDATE' : ''}`, [orgId]);
  if (rows.length !== 1) derivativeDenied();
  const state = custodyOf(rows[0].settings);
  if (Object.values(state.records).some(record => record.organizationId !== orgId)) derivativeDenied();
  return { settings: object(rows[0].settings ?? {}), state };
}
export async function readDerivativeCustody(q: Queryable, orgId: number): Promise<DerivativeCustodyView> {
  const { state } = await loadCustody(q, orgId);
  return { policy: state.policy, records: Object.values(state.records) };
}
async function currentSource(input: DerivativeUseInput, documentId: string) {
  const { loadDocumentForActor } = await import('../../vault/document-catalog.service');
  const doc = await loadDocumentForActor({ organizationId: input.organizationId, userId: input.userId, projectId: input.projectId, documentId }, { includeText: true, currentOnly: true });
  if (!doc || doc.organizationId !== input.organizationId || doc.admittedScope.projectId !== input.projectId ||
      doc.classification !== 'CONFIDENTIAL' || !doc.isCurrent || !doc.sourceAccess.currentUseEligible ||
      typeof doc.extractedText !== 'string' || !doc.extractedText || !sha(doc.contentHash) || !sha(doc.extractedTextSha256)) derivativeDenied();
  return doc;
}
function currentRecord(state: CustodyState, input: DerivativeUseInput, status?: 'attested'): DerivativeRecord {
  const record = state.records[input.derivativeId];
  if (!positive(input.userId) || !positive(input.projectId) || !record || record.organizationId !== input.organizationId ||
      record.projectId !== input.projectId || !state.policy?.enabled || record.policyVersion !== state.policy.version ||
      Date.parse(record.expiresAt) <= Date.now() || record.status === 'revoked' || (status && record.status !== status)) derivativeDenied();
  return record;
}
async function checkSource(record: DerivativeRecord, input: DerivativeUseInput): Promise<void> {
  const source = await currentSource(input, record.documentId);
  if (source.contentHash !== record.sourceHash || source.extractedTextSha256 !== record.extractedTextSha256 || source.programId !== record.programId) derivativeDenied();
}
async function byteStore(provider?: string): Promise<IStorageProvider> {
  const { getStorageProviderFor } = await import('../../storage/index');
  return getStorageProviderFor(provider);
}
async function openCandidate(state: CustodyState, record: DerivativeRecord): Promise<DerivativeTransform> {
  const stored = await (await byteStore(record.storage.provider)).get(record.storage.versionId, record.organizationId);
  if (!stored || stored.sha256 !== record.storage.sha256 || derivativePayloadSha256(stored.bytes.toString('utf8')) !== record.storage.sha256) derivativeDenied();
  const transform = JSON.parse(await openTenantPayload(stored.bytes.toString('utf8'), record, state.policy!.kmsKeyArn));
  if (!transform || typeof transform.payload !== 'string' || transform.payloadSha256 !== record.payloadSha256 ||
      derivativePayloadSha256(transform.payload) !== record.payloadSha256 || !Array.isArray(transform.tokens)) derivativeDenied();
  reinjectExplicitDerivative(transform.payload, transform);
  return transform;
}
async function assertCustodyAdmin(q: Queryable, orgId: number, userId: number): Promise<void> {
  const { resolveSignerOrgRole } = await import('../../part11/resolve-signer-role');
  const role = await resolveSignerOrgRole(userId, orgId, q);
  if (!role || !['admin', 'owner'].includes(role)) derivativeDenied();
}
async function prepareRecord(q: Queryable, state: CustodyState, orgId: number,
  action: Extract<DerivativeAction, { action: 'derivative_prepare' }>, actor: PlacementPolicyActor): Promise<DerivativeRecord> {
  if (!state.policy?.enabled || action.expiresInSeconds > state.policy.maxLifetimeSeconds || Object.keys(state.records).length >= 1000) derivativeDenied();
  const derivativeId = randomUUID(), input = { organizationId: orgId, userId: actor.userId, projectId: action.projectId, derivativeId };
  const doc = await currentSource(input, action.documentId);
  const transform = buildExplicitDerivative(doc.extractedText!, action.template, action.spans);
  const identity = { organizationId: orgId, projectId: action.projectId, derivativeId, sourceHash: doc.contentHash,
    policyVersion: state.policy.version, expiresAt: new Date(Date.now() + action.expiresInSeconds * 1000).toISOString() };
  const envelope = await sealTenantPayload(JSON.stringify(transform), identity, state.policy.kmsKeyArn);
  await assertCustodyAdmin(q, orgId, actor.userId);
  const stored = await (await byteStore()).put({ orgId, projectId: String(action.projectId), filename: `${derivativeId}.custody`,
    bytes: Buffer.from(envelope), mime: 'application/octet-stream', metadata: { purpose: 'encrypted-derivative-custody' } });
  return { ...identity, documentId: doc.id, programId: doc.programId, extractedTextSha256: doc.extractedTextSha256!,
    payloadSha256: transform.payloadSha256, status: 'prepared', version: 1, createdBy: actor.userId,
    storage: { provider: stored.provider, versionId: stored.vaultVersionId, sha256: stored.sha256 } };
}
async function changeExistingDerivative(state: CustodyState, orgId: number,
  action: Exclude<DerivativeAction, { action: 'derivative_policy' | 'derivative_prepare' }>, actor: PlacementPolicyActor): Promise<DerivativeReviewView | undefined> {
  const input = { organizationId: orgId, userId: actor.userId, projectId: action.projectId, derivativeId: action.derivativeId };
  const record = action.action === 'derivative_revoke' ? state.records[action.derivativeId] : currentRecord(state, input);
  if (!record || record.organizationId !== orgId || record.projectId !== action.projectId) derivativeDenied();
  if (action.action === 'derivative_revoke') {
    if (record.version !== action.expectedVersion || record.payloadSha256 !== action.payloadSha256) derivativeDenied();
    record.status = 'revoked'; record.version += 1; return;
  }
  await checkSource(record, input);
  const candidate = await openCandidate(state, record);
  await checkSource(record, input);
  if (action.action === 'derivative_review') return { derivativeId: record.derivativeId, version: record.version,
    exactPayload: candidate.payload, payloadSha256: record.payloadSha256, expiresAt: record.expiresAt };
  if (record.version !== action.expectedVersion || record.payloadSha256 !== action.payloadSha256) derivativeDenied();
  record.status = 'attested'; record.attestedBy = actor.userId; record.attestedAt = new Date().toISOString(); record.version += 1;
}
/** Root route supplies current canonical admin + fresh human reauthentication.
 * A request body's reviewer/model labels never become authority here. */
export async function manageDerivativeCustody(pool: DerivativePool, orgId: number, raw: DerivativeAction,
  actor: PlacementPolicyActor): Promise<DerivativeCustodyView | DerivativeReviewView> {
  const action = parseDerivativeAction(raw), q = await pool.connect();
  let orphan: DerivativeRecord | undefined;
  let commitAttempted = false;
  let discardConnection: Error | undefined;
  try {
    await q.query('BEGIN');
    const { settings, state } = await loadCustody(q, orgId, true);
    await assertCustodyAdmin(q, orgId, actor.userId);
    const prior = { policy: custodyCopy(state.policy), record: custodyCopy(state.records[derivativeActionId(action) ?? ''] ?? null) };
    let review: DerivativeReviewView | undefined;
    if (action.action === 'derivative_policy') state.policy = { ...action.policy, version: (state.policy?.version ?? 0) + 1 };
    else if (action.action === 'derivative_prepare') {
      orphan = await prepareRecord(q, state, orgId, action, actor); state.records[orphan.derivativeId] = orphan;
      await checkSource(orphan, { organizationId: orgId, userId: actor.userId, projectId: action.projectId, derivativeId: orphan.derivativeId });
    } else review = await changeExistingDerivative(state, orgId, action, actor);
    await assertCustodyAdmin(q, orgId, actor.userId);
    if (!review) await q.query('UPDATE organizations SET settings=$2::jsonb WHERE id=$1', [orgId, JSON.stringify({ ...settings, derivativeCustody: state })]);
    const recordId = derivativeActionId(action, orphan);
    await writeChainedAuditRow(q, { tenantId: orgId, userId: actor.userId, action: action.action, resourceType: 'derivative_custody',
      resourceId: recordId ?? String(orgId), reason: action.reasonForChange, details: custodyAuditDetails(state, prior, recordId) });
    commitAttempted = true;
    await q.query('COMMIT'); orphan = undefined;
    return review ?? { policy: state.policy, records: Object.values(state.records) };
  } catch {
    if (commitAttempted) {
      // The database may have committed before the acknowledgement was lost.
      // Keep its encrypted object and let an authoritative reread resolve the outcome.
      discardConnection = new Error('Derivative custody commit acknowledgement unavailable');
      throw discardConnection;
    }
    await q.query('ROLLBACK').catch(() => undefined);
    if (orphan) {
      try { await (await byteStore(orphan.storage.provider)).delete(orphan.storage.versionId, orgId); } catch { /* Encrypted orphan has no issued authority. */ }
    }
    derivativeDenied();
  } finally { q.release(discardConnection); }
}
const issuedDerivatives = new WeakMap<AuthorizedDerivativeUse, { input: DerivativeUseInput; transform: DerivativeTransform }>();
async function freshDerivativePlacement(pool: Queryable, orgId: number): Promise<StoredPlacementPolicy> {
  const policy = await readOrgPlacementPolicy(pool, orgId);
  if (!policy || !parsePlacementPolicyInput({ ...policy, reasonForChange: 'Verify current derivative placement' }).ok) derivativeDenied();
  return policy;
}
function immutablePlacement(policy: StoredPlacementPolicy): StoredPlacementPolicy {
  if (policy.allowedProviders) Object.freeze(policy.allowedProviders);
  if (policy.allowedSubstrates) Object.freeze(policy.allowedSubstrates);
  return Object.freeze(policy);
}
const authorityHash = (policy: DerivativePolicy | null, record: DerivativeRecord, placementPolicy: StoredPlacementPolicy): string =>
  createHash('sha256').update(JSON.stringify({ policy, record, placementPolicy })).digest('hex');
async function checkedCandidate(pool: Queryable, input: DerivativeUseInput) {
  const { state } = await loadCustody(pool, input.organizationId), record = currentRecord(state, input, 'attested');
  await checkSource(record, input);
  const transform = await openCandidate(state, record);
  await checkSource(record, input);
  const placementPolicy = await freshDerivativePlacement(pool, input.organizationId);
  return { transform, record, placementPolicy, fingerprint: authorityHash(state.policy, record, placementPolicy) };
}
export async function authorizeDerivativeUse(pool: DerivativePool, input: DerivativeUseInput): Promise<AuthorizedDerivativeUse> {
  try {
    const pinned = { ...input }, candidate = await checkedCandidate(pool, pinned);
    const issued: AuthorizedDerivativeUse = Object.freeze({ exactPayload: candidate.transform.payload, payloadSha256: candidate.record.payloadSha256,
      authorityFingerprint: candidate.fingerprint, originTier: 2, effectiveTier: 1, policyVersion: candidate.record.policyVersion,
      expiresAt: candidate.record.expiresAt, derivativeId: candidate.record.derivativeId, placementPolicy: immutablePlacement(candidate.placementPolicy),
      sourceBinding: Object.freeze({ documentId: candidate.record.documentId, programId: candidate.record.programId, contentHash: candidate.record.sourceHash,
        extractedTextSha256: candidate.record.extractedTextSha256, projectId: candidate.record.projectId }) });
    issuedDerivatives.set(issued, { input: pinned, transform: candidate.transform });
    await recheckDerivativeUse(pool, pinned, issued);
    return issued;
  } catch { return derivativeDenied(); }
}
export async function recheckDerivativeUse(pool: DerivativePool, input: DerivativeUseInput, issued: AuthorizedDerivativeUse): Promise<void> {
  try {
    const held = issuedDerivatives.get(issued);
    if (!held || JSON.stringify(held.input) !== JSON.stringify(input)) derivativeDenied();
    const now = await checkedCandidate(pool, held.input);
    if (now.fingerprint !== issued.authorityFingerprint || now.transform.payloadSha256 !== issued.payloadSha256) derivativeDenied();
    const final = await loadCustody(pool, input.organizationId);
    const record = currentRecord(final.state, input, 'attested');
    const placementPolicy = await freshDerivativePlacement(pool, input.organizationId);
    if (authorityHash(final.state.policy, record, placementPolicy) !== issued.authorityFingerprint) derivativeDenied();
    await checkSource(record, held.input);
  } catch { derivativeDenied(); }
}
export async function reinjectAndVerifyDerivative(pool: DerivativePool, input: DerivativeUseInput,
  issued: AuthorizedDerivativeUse, modelText: string): Promise<{ content: string; verification: { kind: 'deterministic_token_roundtrip'; derivativeId: string; payloadSha256: string } }> {
  await recheckDerivativeUse(pool, input, issued);
  const held = issuedDerivatives.get(issued) ?? derivativeDenied();
  let content: string;
  try { content = reinjectExplicitDerivative(modelText, held.transform); } catch { return derivativeDenied(); }
  await recheckDerivativeUse(pool, input, issued);
  return { content, verification: { kind: 'deterministic_token_roundtrip', derivativeId: issued.derivativeId, payloadSha256: issued.payloadSha256 } };
}
