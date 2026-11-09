/**
 * The verified request owner, as production gives every AnA tool call.
 *
 * The global /api gate scopes a request with its verified subject (tenantStore
 * `accountId`), and the request's connection carries the same scope as
 * `app.current_tenant_id` / `app.current_account_id` (sessionScope.ts
 * applySessionScope). Since 2026-11-06 (`4852aa78`, `a2f9264a`, P-104) every
 * registered tool reads the acting member's private rules through both
 * (governed-tool-gate.ts loadToolSkillGates → ana-context-router.ts
 * requirePrivateOwner) before it runs, and refuses SKILL_POLICY_UNAVAILABLE
 * without them. A real-database suite gives its tools that owner here; the
 * gate itself is unchanged.
 *
 * Not a test file: nothing here runs on its own.
 */
import type { RequestSqlClient } from '../../../../db/requestDb';
import { getTenantScope, runWithTenantScope } from '../../../../db/tenantStore';
import { extractTableDdl } from '../../../../../tests/golden-journeys/harness';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../../db/pglite-harness';

/** The owner store the private-rule read opens, from its creating migration. Empty: the member has no private rules. */
export const PRIVATE_RULE_STORE_DDL = extractTableDdl('migrations/0013_ana_intelligence_system.sql', ['user_intelligence_profiles']);

/**
 * What the AnA stream's conversation step reads for its owner since `a2f9264a`
 * (P-104), before history: the thread (its owner-private boundary), the
 * member's private-rule store, and audit_logs (that store's history and the
 * thread's privacy markers). From their creating migrations; empty: a public
 * thread whose member has no private rules.
 */
export const OWNER_CONVERSATION_STORE_DDL = [
  extractTableDdl('migrations/20260728_chat_thread_store.sql', ['chat_threads']),
  // migrations/20261001c_chat_threads_program_key.sql
  'ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS program_id uuid;',
  PRIVATE_RULE_STORE_DDL,
  AUDIT_LOGS_PGLITE_DDL,
].join('\n');

type Rows = { rows: Array<Record<string, unknown>> };

/**
 * A request client over one PGlite session. PGlite is one connection, so each
 * statement is preceded by the caller's own scope, set as the request's
 * connection holds it, and statements run one at a time so concurrent calls
 * never read each other's owner.
 */
export function ownerScopedClient(run: (sql: string, params?: unknown[]) => Promise<Rows>): RequestSqlClient {
  let lease: Promise<void> = Promise.resolve();
  return { query(sql, params) {
    const scope = getTenantScope();
    const result = lease.then(async () => {
      await run("SELECT set_config('app.current_tenant_id',$1,false),set_config('app.current_account_id',$2,false)",
        [scope?.tenantId ?? '', scope?.accountId == null ? '' : String(scope.accountId)]);
      return run(sql, params);
    });
    lease = result.then(() => {}, () => {});
    return result;
  } };
}

/** Run `work` as the context's member: the request scope with its verified account, keeping an ambient role. */
export function asRequestOwner<T>(ctx: { organizationId?: unknown; userId?: unknown } | undefined, work: () => Promise<T>): Promise<T> {
  const organizationId = Number(ctx?.organizationId), userId = Number(ctx?.userId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) return work();
  const ambient = getTenantScope();
  return runWithTenantScope({ tenantId: String(organizationId), role: ambient?.tenantId === String(organizationId) ? ambient.role : null,
    accountId: userId, source: 'request', caller: 'ana-tool-request-owner' }, work);
}
