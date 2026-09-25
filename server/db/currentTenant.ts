/**
 * The tenant a request may read, as a KEY — taken from the verified session's
 * tenant scope, never from anything the request carries.
 *
 * Two keys name a tenant here. The integer organizations.id keys the public
 * schema and RLS's app.current_tenant_id; organizations.uuid keys
 * lumen_data_atoms (through its organization join), the vault (through
 * app.current_org_id) and every non-public schema. The scope the auth boundary
 * opens (middleware/establishRequestTenantScope.ts) always carries the first,
 * and carries the second when the membership lookup supplied it. When it did
 * not — the degraded membership path — the uuid is read from the organizations
 * row for the scope's own tenant id. That degraded path is exactly when the
 * routes' old `tenantContext?.organizationUuid || req.headers['x-org-uuid']`
 * fallbacks handed the client's header to a WHERE clause.
 *
 * One implementation. The same derivation lived in three places before this
 * module — cortexQueryRoutes.ts (sessionOrgUuid), advancedRAGPipeline.ts
 * (assertCallerTenantIsSession) and utils/tenantContext.ts (getSecureOrgUuid,
 * which no production code called) — and eleven retrieval call sites used none
 * of them. docs/evidence/D3/2026-09-24-atom-search-tenant-key/.
 */
import type pg from 'pg';
import { getTenantScope, type TenantScope } from './tenantStore';

export type TenantKeyQueryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTenantUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The per-user tenant scope, or null. No scope, and the system and pre-auth
 * scopes (tenant '0'), name no tenant a request could be asking for.
 */
function currentScope(): TenantScope | null {
  const scope = getTenantScope();
  return scope && scope.tenantId !== '0' ? scope : null;
}

/**
 * The current tenant's organization uuid, or null when there is no per-user
 * tenant scope or its organization has no row. Callers answer null with a
 * refusal (403), never with a query that has no tenant key.
 */
export async function currentTenantOrgUuid(db: TenantKeyQueryable): Promise<string | null> {
  const scope = currentScope();
  if (!scope) return null;
  if (isTenantUuid(scope.orgUuid)) return scope.orgUuid;
  const orgId = Number(scope.tenantId);
  if (!Number.isSafeInteger(orgId) || orgId <= 0) return null;
  const { rows } = await db.query<{ uuid: string }>(
    'SELECT uuid::text AS uuid FROM organizations WHERE id = $1',
    [orgId]
  );
  return rows[0]?.uuid ?? null;
}

/**
 * Thrown when a query that must be tenant-scoped is asked to run with no
 * tenant key. The alternative — running it unscoped — is how an atom search
 * came to rank every tenant's evidence.
 */
export class TenantKeyRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantKeyRequiredError';
  }
}

/**
 * Thrown when a tenant other than the current scope's is asked for. A caller
 * that does this has a defect; refusing loudly keeps it from reading as "there
 * is nothing on this".
 */
export class TenantScopeMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeMismatchError';
  }
}

/**
 * Refuse a tenant key that is not the current scope's.
 *
 * Inside a per-user scope, an integer org id other than the scope's tenant, or
 * a uuid other than the scope's organization's, throws. Outside one — jobs, the
 * eval harness, the system scope — there is no session to compare with and this
 * stands down; the caller's own key is then the only boundary, and a MISSING
 * key is the caller's to refuse.
 */
export async function assertTenantIsCurrent(
  db: TenantKeyQueryable,
  requested: { organizationUuid?: string | null; organizationId?: number | null }
): Promise<void> {
  const scope = currentScope();
  if (!scope) return;
  const { organizationUuid, organizationId } = requested;
  if (organizationId != null && String(organizationId) !== scope.tenantId) {
    throw new TenantScopeMismatchError(
      `retrieval refused: tenant ${organizationId} was requested inside tenant ${scope.tenantId}'s session`
    );
  }
  if (!organizationUuid) return;
  const current = await currentTenantOrgUuid(db);
  if (!current || current.toLowerCase() !== organizationUuid.toLowerCase()) {
    throw new TenantScopeMismatchError(
      "retrieval refused: an organization other than the session's tenant was requested"
    );
  }
}
