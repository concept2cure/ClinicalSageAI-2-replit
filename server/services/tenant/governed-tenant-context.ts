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

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<unknown>; }

/**
 * Stamp the RLS tenant session vars on the current transaction. Call immediately
 * after BEGIN. `app.current_tenant_id` is the numeric org id the policy matches.
 */
export async function setTenantContextTx(client: Queryable, orgId: number | null | undefined, role?: string | null): Promise<void> {
  if (orgId == null) return; // governed handlers guard on org context already; no-op defensively
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [String(orgId)]);
  if (role) await client.query("SELECT set_config('app.current_user_role', $1, true)", [role]);
}
