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
 * @module server/services/ai-gateway/providers/org-placement-writer
 */

import { writeChainedAuditRow } from '../../auditService';
import type { DataResidency, ProviderName, SubstrateClass } from '../types';
import {
  PLACEMENT_PROVIDERS,
  PLACEMENT_SUBSTRATES,
  getOrgPlacementResolver,
} from './org-placement';
import { isPlacementCompliant, resolvePlacement } from './placement';

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
  'residency',
  'zeroDataRetention',
  'allowedSubstrates',
  'allowedProviders',
  'publicSourceFrontier',
  'publicSourceEgress',
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
  if (unknown.length > 0) {
    return { ok: false, message: `${key} names unknown values: ${unknown.map(String).join(', ')}.` };
  }
  return { ok: true, list: [...new Set(value as T[])] };
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
  const candidates = [...PLACEMENT_PROVIDERS].filter(
    p =>
      (!policy.allowedProviders || policy.allowedProviders.includes(p)) &&
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

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}
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
      [
        organizationId,
        policy.residency,
        policy.zeroDataRetention,
        policy.allowedSubstrates,
        policy.allowedProviders,
        policy.publicSourceFrontier,
        policy.publicSourceEgress,
      ],
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
