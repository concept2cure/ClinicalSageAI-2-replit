/**
 * Returning a pooled connection WITHOUT the RLS bypass still set on it.
 *
 * ── The defect this closes ──────────────────────────────────────────────────
 * The services in this directory reach cross-tenant data by setting two session
 * GUCs on a checked-out connection:
 *
 *     SET app.bypass_rls = 'true'
 *     SET app.is_admin   = 'true'
 *
 * A plain `SET` is SESSION-scoped. Verified against a live database as
 * app_service: it survives COMMIT, survives ROLLBACK, and is cleared only by
 * DISCARD ALL — which nothing in this repo issues. pg-pool's _release() runs no
 * SQL; poolInstrumentation's scopedRelease runs no SQL; withTenantConnection's
 * cleanup resets app.current_tenant_id / app.current_org_id /
 * app.current_user_role and not these two.
 *
 * So the connection went back to the pool with the bypass still on, and the
 * next checkout — a different tenant's request — inherited it. That is not a
 * narrow leak: `app.bypass_rls` short-circuits identity.can_access_org,
 * can_write_org, can_access_program and can_write_program, which between them
 * decide 142 of ~1016 policies across 80 tables in 15 schemas, vault.documents,
 * signing.signatures, ectd_v4.regulatory_submissions and identity.users among
 * them. Worse, withTenantConnection's cleanup would leave the WORST
 * combination: no tenant identity, full bypass.
 *
 * ── Why this shape rather than SET LOCAL ────────────────────────────────────
 * `SET LOCAL` inside an explicit transaction is the better idiom and is what
 * server/routes/innovation-routes.ts guardQuery() already does. It is not what
 * this file does, deliberately: of the seventeen call sites, thirteen are not
 * inside a transaction at all, and SET LOCAL outside one is a no-op with a
 * warning — the swap would silently REMOVE the bypass those queries depend on.
 * Restructuring each site into a transaction changes the semantics of the
 * queries inside it, and this whole directory is unmounted (the innovation
 * router is not registered and the service constructors have no callers), so
 * that refactor cannot be exercised by anything. Clearing the flags at release
 * changes no query's behaviour at all and still makes it impossible for a
 * connection to carry a bypass to the next borrower.
 *
 * ── Fail closed ────────────────────────────────────────────────────────────
 * If the flags cannot be cleared — an aborted transaction, a dead connection —
 * the connection is DESTROYED rather than returned. A connection that might
 * still carry a bypass must never be reused; losing one pooled connection is
 * the cheaper failure.
 */
import type { PoolClient } from 'pg';

/** GUCs that grant cross-tenant reach and must never outlive their borrower. */
const PRIVILEGE_GUCS = ['app.bypass_rls', 'app.is_admin'] as const;

export async function releaseWithoutBypass(client: PoolClient): Promise<void> {
  try {
    // An aborted transaction rejects everything until it is unwound, and a
    // successful COMMIT earlier leaves no transaction, where ROLLBACK is a
    // harmless warning. Either way this makes RESET reachable.
    await client.query('ROLLBACK').catch(() => undefined);

    for (const guc of PRIVILEGE_GUCS) {
      // RESET, not `SET … = 'false'`: the policies test for the literal
      // 'true', but a reset restores the server default rather than leaving a
      // value behind for someone to reason about.
      await client.query(`RESET ${guc}`);
    }
  } catch {
    // Could not prove the flags are gone — do not put this connection back.
    // `release(true)` destroys it; the pool opens a clean one on next demand.
    client.release(true);
    return;
  }
  client.release();
}
