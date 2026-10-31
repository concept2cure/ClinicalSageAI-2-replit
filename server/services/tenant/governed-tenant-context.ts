/**
 * Governed-transaction tenant context.
 *
 * The governed-CRUD path (each route's `governed()` helper and the AnA tool
 * handlers) opens a pool connection and runs BEGIN → domain Tx →
 * recordGovernedAction → COMMIT. Those connections never carried the RLS tenant
 * session variable, so the `tenant_isolation_policy` (once enforcement is flipped
 * on via app.rls_enforce='on') would see no tenant and fail-closed to zero rows.
 *
 * This sets the tenant vars **transaction-locally** (set_config(..., true) resets
 * at COMMIT/ROLLBACK), so it must be called right after BEGIN, before any domain
 * query. It is a no-op for behavior in shadow mode (RLS ignores the var until
 * enforcement is on), so wiring it in is safe to ship ahead of enabling
 * enforcement — it simply makes enforcement *safe to turn on*.
 *
 * @module server/services/tenant/governed-tenant-context
 */

import { switchPinTerms } from '../../db/sessionScope';
import { isPlatformScopeRole, PlatformScopeRoleRefusedError } from '../../db/tenantStore';

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<unknown>; }

/**
 * Stamp the RLS tenant session vars on the current transaction. Call immediately
 * after BEGIN. `app.current_tenant_id` is the numeric org id the policy matches.
 *
 * `role` is written to app.current_user_role, which the platform arm of about
 * 977 tenant policies compares with 'app_super_admin'. A governed transaction
 * acts for one organisation, so that role is refused, however it is cased or
 * padded, before any statement: the same refusal a per-user request scope
 * gives (P-72 slices 1a and 1b, server/db/tenantStore.ts isPlatformScopeRole;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). Until then a caller's
 * role string opened every tenant's rows for the rest of the transaction.
 */
export async function setTenantContextTx(client: Queryable, orgId: number | null | undefined, role?: string | null): Promise<void> {
  if (isPlatformScopeRole(role)) throw new PlatformScopeRoleRefusedError('setTenantContextTx');
  if (orgId == null) return; // governed handlers guard on org context already; no-op defensively
  // The isolation switches are pinned in the same statement (server/db/sessionScope.ts).
  await client.query(`SELECT set_config('app.current_tenant_id', $1, true), ${switchPinTerms(true)}`, [String(orgId)]);
  if (role) await client.query("SELECT set_config('app.current_user_role', $1, true)", [role]);
}
