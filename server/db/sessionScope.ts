/**
 * What a pooled runtime connection carries for one borrower, set and cleared
 * in one place (D3, 2026-10-08).
 *
 * ── The isolation switches ──────────────────────────────────────────────────
 * Tenant policies grant every row when `app.rls_enforce` is not 'on', and the
 * identity.can_* helpers grant when `app.bypass_rls` (or the gcc policies'
 * `app.is_admin`) is 'true'. All three are ordinary session variables.
 * Production turns enforcement on only in the connection's startup packet
 * (rlsEnforcement.ts, buildRlsStartupOptions), so a session-level SET on a
 * runtime connection, from a bug or an injected statement, outlived the
 * request: the per-request cleanups reset only the three tenant variables, and
 * the next request, from any tenant, read every tenant's rows. Shown on
 * PostgreSQL by tests/db/isolation-switch-does-not-outlive-request.dbtest.ts.
 *
 * So every place that applies a scope also PINS the switches (enforcement to
 * this deployment's mode, the two bypass switches empty), in the same
 * statement, and every release clears them. A switch left on a connection by
 * any path is overwritten when the next borrower applies its scope.
 *
 * This does not make isolation unswitchable by a session that can run its own
 * SQL: such a session can equally set `app.current_tenant_id`. These policies
 * protect against code that forgets a tenant predicate; they are not a
 * boundary against injected SQL, and are not claimed as one.
 *
 * Callers: server/middleware/establishRequestTenantScope.ts (request scope),
 * server/middleware/lazyRequestDbClient.ts (its release),
 * server/db/withTenantConnection.ts, server/src/routes/stability.router.ts,
 * and server/db/poolInstrumentation.ts (the pool's own statements, LOCAL).
 *
 * @module server/db/sessionScope
 */
import type { PoolClient } from 'pg';
import { readEnforcementMode } from './rlsEnforcement';

/** The value `app.rls_enforce` is pinned to: 'on' where this deployment enforces, else empty (as an unset startup option leaves it). */
const enforcementValue = (): string => (readEnforcementMode() === 'on' ? 'on' : '');

/**
 * The set_config terms that pin the switches, for a SELECT that applies a scope.
 * `isLocal` true for a transaction-local scope (the pool's statements).
 */
export function switchPinTerms(isLocal: boolean): string {
  return (
    `set_config('app.rls_enforce', '${enforcementValue()}', ${isLocal}), ` +
    `set_config('app.bypass_rls', '', ${isLocal}), ` +
    `set_config('app.is_admin', '', ${isLocal})`
  );
}

export interface SessionScope {
  tenantId: string;
  role?: string | null;
  orgUuid?: string | null;
}

/** Apply a session-level scope to a checked-out connection: the tenant variables and the switch pins, one statement. */
export async function applySessionScope(client: PoolClient, scope: SessionScope): Promise<void> {
  await client.query(
    "SELECT set_config('app.current_tenant_id', $1, false), " +
      "set_config('app.current_user_role', $2, false), " +
      "set_config('app.current_org_id', $3, false), " +
      switchPinTerms(false),
    [scope.tenantId, scope.role ?? '', scope.orgUuid ?? ''],
  );
}

/** The clearing statement: the tenant variables and the two bypass switches emptied. */
export const CLEAR_SESSION_SCOPE_SQL =
  "SELECT set_config('app.current_tenant_id', '', false), " +
  "set_config('app.current_user_role', '', false), " +
  "set_config('app.current_org_id', '', false), " +
  "set_config('app.bypass_rls', '', false), " +
  "set_config('app.is_admin', '', false)";

/** Restores enforcement to the connection's startup value ('on' in production). */
export const RESET_ENFORCEMENT_SQL = 'RESET app.rls_enforce';

/** Clear a connection before it goes back to the pool. Throws when it cannot; the caller then discards the connection. */
export async function clearSessionScope(client: PoolClient): Promise<void> {
  await client.query(CLEAR_SESSION_SCOPE_SQL);
  await client.query(RESET_ENFORCEMENT_SQL);
}
