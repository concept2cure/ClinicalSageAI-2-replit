/**
 * RLS enforcement mode — controls whether the policy installed by PR B
 * actually filters rows, or compiles to a no-op.
 *
 * The policy's leading clause is:
 *
 *   NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
 *   OR <tenant match>
 *   OR <super-admin match>
 *
 * When `app.rls_enforce` is unset (default) or anything other than `'on'`,
 * the leading clause is TRUE and every row passes — the table is effectively
 * not filtered. When the setting is `'on'`, the leading clause is FALSE and
 * the tenant/super-admin clauses do the real work.
 *
 * This gives the rollout three knobs without re-running migrations:
 *
 *   RLS_ENFORCE=off       — policy compiled, never filters. (default)
 *   RLS_ENFORCE=shadow    — alias for off; intent: "I'm watching"
 *   RLS_ENFORCE=on        — policy filters. The flip.
 *
 * The setting is applied per connection via a Pool 'connect' handler so
 * every connection inherits it without each call site doing anything.
 */

import type { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('rls-enforcement');

export type RlsEnforcementMode = 'off' | 'shadow' | 'on';

export function readEnforcementMode(env: NodeJS.ProcessEnv = process.env): RlsEnforcementMode {
  const raw = (env.RLS_ENFORCE ?? '').trim().toLowerCase();
  if (raw === 'on' || raw === 'enforce' || raw === 'true' || raw === '1') return 'on';
  if (raw === 'shadow') return 'shadow';
  return 'off';
}

/**
 * Install a Pool 'connect' handler that sets `app.rls_enforce` on every
 * new connection based on the env var. Idempotent — calling twice on the
 * same pool installs only one handler.
 *
 * Done at pool creation time rather than per query so the var is in place
 * even for queries that bypass our request-scoped client (the bulk of the
 * existing codebase).
 */
export function installRlsEnforcement(pool: Pool): Pool {
  const tagged = pool as Pool & { __rlsEnforcementInstalled?: boolean };
  if (tagged.__rlsEnforcementInstalled) return pool;
  tagged.__rlsEnforcementInstalled = true;

  const mode = readEnforcementMode();
  const settingValue = mode === 'on' ? 'on' : '';

  pool.on('connect', client => {
    // set_config(name, value, false) → session-level (lasts for connection life)
    client.query("SELECT set_config('app.rls_enforce', $1, false)", [settingValue]).catch(err => {
      logger.error('Failed to apply RLS enforcement mode on new connection', {
        mode,
        error: (err as Error).message,
      });
    });
  });

  logger.info('RLS enforcement mode installed', { mode });
  return pool;
}
