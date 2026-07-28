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
 *   RLS_ENFORCE=off       — policy compiled, never filters.
 *   RLS_ENFORCE=shadow    — alias for off; intent: "I'm watching"
 *   RLS_ENFORCE=on        — policy filters. The flip.
 *
 * Outside production an unset RLS_ENFORCE defaults to off so dev/test keep
 * working with zero configuration. IN PRODUCTION there is no default: the
 * operator must set RLS_ENFORCE explicitly (on|shadow|off) or the boot fails —
 * a silently-off RLS layer is not an acceptable GA posture. An explicit
 * off/shadow still boots (staged rollouts) but logs a prominent warning naming
 * the accepted risk. See assertRlsEnforcementForProduction.
 *
 * The setting is applied per connection via a Pool 'connect' handler so
 * every connection inherits it without each call site doing anything.
 */

import type { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('rls-enforcement');

export type RlsEnforcementMode = 'off' | 'shadow' | 'on';

/**
 * Raw RLS_ENFORCE values recognized as an explicit operator decision, keyed by
 * the mode they resolve to. Anything outside these lists is NOT a decision —
 * in production that refuses to boot rather than silently degrading to off.
 */
const EXPLICIT_MODE_VALUES: Record<RlsEnforcementMode, readonly string[]> = {
  on: ['on', 'enforce', 'true', '1'],
  shadow: ['shadow'],
  off: ['off', 'false', '0'],
};

export function readEnforcementMode(env: NodeJS.ProcessEnv = process.env): RlsEnforcementMode {
  const raw = (env.RLS_ENFORCE ?? '').trim().toLowerCase();
  if (EXPLICIT_MODE_VALUES.on.includes(raw)) return 'on';
  if (EXPLICIT_MODE_VALUES.shadow.includes(raw)) return 'shadow';
  return 'off';
}

/**
 * True when RLS_ENFORCE carries a recognized, deliberate value. An unset,
 * blank, or unrecognized (typo'd) value is not an operator decision.
 */
export function isExplicitEnforcementDecision(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.RLS_ENFORCE ?? '').trim().toLowerCase();
  return Object.values(EXPLICIT_MODE_VALUES).some(values => values.includes(raw));
}

/**
 * Production safety assertion for the RLS enforcement flip.
 *
 * Tenant isolation has two layers: (1) the PRIMARY app-layer boundary — the
 * global `/api` auth gate + JWT-derived org scoping — and (2) Postgres RLS as
 * defense-in-depth. RLS only actually filters rows when `RLS_ENFORCE=on`.
 *
 * Production boot matrix (non-production is always a no-op):
 *   - RLS_ENFORCE=on                          → boots, RLS filters rows.
 *   - RLS_ENFORCE=shadow / off (explicit)     → boots, but logs a prominent
 *     structured warning naming the accepted risk. Allowed for staged rollouts.
 *   - RLS_ENFORCE unset or unrecognized       → REFUSES TO BOOT. Silent-off is
 *     not an acceptable production posture; the operator must decide.
 *   - RLS_REQUIRE_ENFORCE=true                → fail-closed: anything other
 *     than 'on' refuses to boot, explicit or not.
 *
 * @returns the resolved enforcement mode.
 */
export function assertRlsEnforcementForProduction(
  env: NodeJS.ProcessEnv = process.env
): RlsEnforcementMode {
  const mode = readEnforcementMode(env);
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (!isProduction || mode === 'on') return mode;

  const message =
    `RLS_ENFORCE is "${mode}" in production — Postgres Row-Level Security is NOT ` +
    'filtering rows (defense-in-depth disabled). Tenant isolation is relying solely ' +
    'on the app-layer auth gate + JWT org scoping. Set RLS_ENFORCE=on once the policy ' +
    'rollout is verified.';

  if ((env.RLS_REQUIRE_ENFORCE ?? '').trim().toLowerCase() === 'true') {
    // Operator opted into fail-closed: refuse to boot with RLS off in prod.
    throw new Error(`[rls-enforcement] FAIL-CLOSED: ${message}`);
  }

  if (!isExplicitEnforcementDecision(env)) {
    // No decision was made — production must not default RLS off silently.
    const raw = (env.RLS_ENFORCE ?? '').trim();
    throw new Error(
      `[rls-enforcement] REFUSING TO BOOT: RLS_ENFORCE is ${
        raw === '' ? 'not set' : `set to unrecognized value "${raw}"`
      } in production. Postgres Row-Level Security posture requires an explicit ` +
        'operator decision. Set RLS_ENFORCE=on (policy filters rows — the target ' +
        'state), RLS_ENFORCE=shadow (staged rollout: policy compiled but not ' +
        'filtering), or RLS_ENFORCE=off (explicitly accept that tenant isolation ' +
        'relies solely on the app-layer auth gate + JWT org scoping). ' +
        'RLS_REQUIRE_ENFORCE=true additionally refuses anything other than on.'
    );
  }

  // Explicit off/shadow: permitted for staged rollouts, but the accepted risk
  // must be visible — one prominent structured warning at boot.
  logger.warn(`⚠️  ${message}`, {
    mode,
    controlledBy: 'RLS_ENFORCE',
    acceptedRisk:
      'Postgres RLS defense-in-depth is not filtering rows; tenant isolation relies ' +
      'solely on the app-layer auth gate + JWT org scoping',
    remediation: 'set RLS_ENFORCE=on once the policy rollout is verified',
  });
  return mode;
}

/**
 * Refuse to create an ADDITIONAL organization while RLS is not filtering.
 *
 * ── Why a boot check is not enough ────────────────────────────────────────────
 * assertRlsEnforcementForProduction runs once, at boot, and deliberately permits
 * an explicit `off`/`shadow` for staged rollouts. That is a defensible posture
 * while the deployment holds ONE tenant: there is no second organization for a
 * missing row filter to leak to, so RLS-off costs nothing real.
 *
 * The moment a second organization exists, that reasoning stops holding — and
 * nothing noticed, because the condition arises long after boot. The pilot
 * go/no-go gate says exactly this ("tolerable at 0 organization(s) … RLS_ENFORCE=on
 * is REQUIRED before a second organization is created — this gate turns HARD the
 * moment one is"), but that gate is a script a human runs, not a control in the
 * running system. This is the control.
 *
 * ── What it does ──────────────────────────────────────────────────────────────
 * Called before inserting an organization. If this insert would create the
 * SECOND (or later) organization, and RLS is not `on`, it throws. Creating the
 * FIRST organization is always allowed — a fresh deployment must be able to
 * onboard its founding tenant without operators having flipped RLS first, and
 * with one tenant there is nothing to isolate from.
 *
 * Scoped to deployed environments (anything not explicitly `development` or
 * `test`), matching the repo's established prod-fail-closed idiom — an unset,
 * blank, `staging` or `preview` NODE_ENV all enforce. Local development keeps
 * working with zero configuration.
 *
 * The remedy is one environment variable, and it is named in the error.
 *
 * @param existingOrgCount organizations already present.
 * @throws when adding a tenant would put a deployed system into multi-tenant
 *         operation without row filtering.
 */
export function assertTenantIsolationBeforeNewOrg(
  existingOrgCount: number,
  env: NodeJS.ProcessEnv = process.env
): void {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const isLocal = nodeEnv === 'development' || nodeEnv === 'test';
  if (isLocal) return;

  // The founding tenant is always permitted — nothing to leak between.
  if (existingOrgCount < 1) return;

  const mode = readEnforcementMode(env);
  if (mode === 'on') return;

  throw new Error(
    `[rls-enforcement] FAIL-CLOSED: refusing to create organization #${existingOrgCount + 1} ` +
      `while RLS_ENFORCE is "${mode}". Postgres Row-Level Security is not filtering rows, so ` +
      'this deployment would hold more than one tenant with tenant isolation resting solely on ' +
      'the app-layer auth gate — a single missed org predicate in any query becomes a ' +
      'cross-tenant read. Accepting that risk is defensible with ONE tenant and is not with two. ' +
      'Set RLS_ENFORCE=on (the policies are already provisioned; this only flips them from ' +
      'compiled-but-inert to filtering) and retry.'
  );
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

  // Enforces the production boot matrix: explicit on/shadow/off proceeds
  // (off/shadow with a loud warning); unset/unrecognized refuses to boot.
  const mode = assertRlsEnforcementForProduction();
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
