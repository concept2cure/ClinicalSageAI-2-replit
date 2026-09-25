/**
 * Launch-scope enforcement — the server's one decision about what ships.
 *
 * `LAUNCH_SCOPE_ENFORCE` is the deployment setting:
 *   on   — surfaces outside shared/constants/launch-scope.ts are locked with
 *          source 'launch-scope'; the rail hides them, the catalog names the
 *          reason, a deep link renders the honest panel.
 *   off  — no launch-scope verdicts; the catalog and tiers alone decide.
 *
 * Unset: ON in production, OFF elsewhere. Production must not depend on an
 * operator remembering to set a flag whose absence widens the product; a
 * laptop must not hide half the product from the person building it. Any
 * other value is a configuration error and, in production, refuses to boot —
 * the same fail-closed contract as RLS_ENFORCE.
 */
import { LAUNCH_MODULE_IDS } from '../../../shared/constants/launch-scope';
import { writeModuleGrant } from './module-grants.js';
import { getTenantScope } from '../../db/tenantStore';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('launch-scope');

export type LaunchScopeMode = 'on' | 'off';

export function readLaunchScopeMode(env: NodeJS.ProcessEnv = process.env): LaunchScopeMode {
  const raw = (env.LAUNCH_SCOPE_ENFORCE ?? '').trim().toLowerCase();
  const production = env.NODE_ENV === 'production';
  if (raw === '') return production ? 'on' : 'off';
  if (raw === 'on' || raw === 'off') return raw;
  if (production) {
    throw new Error(
      `[launch-scope] LAUNCH_SCOPE_ENFORCE must be "on" or "off" in production (got ${JSON.stringify(env.LAUNCH_SCOPE_ENFORCE)}). ` +
        'Unset means on. Refusing to boot rather than guess which half of the product to show.',
    );
  }
  logger.warn('[launch-scope] LAUNCH_SCOPE_ENFORCE is not "on" or "off"; treating as off outside production', {
    value: env.LAUNCH_SCOPE_ENFORCE,
  });
  return 'off';
}

export type UnattributedApiMode = 'report' | 'enforce';

/**
 * What the API gate does with a path nothing claims (launch-scope-api.ts
 * `unmapped`) while launch scope is enforced. Unset means `report`: the
 * would-refuse is recorded in the enforcement report (Master Admin → Licensing →
 * Enforcement) and the request is served. `enforce` refuses it 403 LAUNCH_SCOPE.
 * Any other value refuses to boot in production, like LAUNCH_SCOPE_ENFORCE.
 */
export function readUnattributedApiMode(env: NodeJS.ProcessEnv = process.env): UnattributedApiMode {
  const raw = (env.LAUNCH_SCOPE_API_UNATTRIBUTED ?? '').trim().toLowerCase();
  if (raw === '') return 'report';
  if (raw === 'report' || raw === 'enforce') return raw;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      `[launch-scope] LAUNCH_SCOPE_API_UNATTRIBUTED must be "report" or "enforce" in production (got ${JSON.stringify(env.LAUNCH_SCOPE_API_UNATTRIBUTED)}). ` +
        'Unset means report. Refusing to boot rather than guess whether to refuse unclaimed API paths.',
    );
  }
  logger.warn('[launch-scope] LAUNCH_SCOPE_API_UNATTRIBUTED is not "report" or "enforce"; treating as report outside production', {
    value: env.LAUNCH_SCOPE_API_UNATTRIBUTED,
  });
  return 'report';
}

export function launchScopeEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return readLaunchScopeMode(env) === 'on';
}

/**
 * Grant the launch catalog to an organisation. Idempotent: the grant writer
 * upserts on (organization_id, module_id). Called after the organisation row
 * exists — never inside its creating transaction, because the grant writer
 * holds its own connection and an org that fails to provision must still
 * exist so an administrator can provision it by hand.
 *
 * `actorEmail` null: the platform, not a person, wrote these rows. The audit
 * trail carries the reason (`launch catalog default`).
 *
 * The grants are written under whatever tenant scope the CALLER holds, and
 * module_subscriptions is RLS-enabled and FORCED, so the caller's scope must be
 * one that may write this organisation's rows — its own tenant scope, or the
 * system scope. This function deliberately does not open a scope of its own: a
 * service that widened its caller's scope would let any caller grant modules to
 * any organisation, with RLS no longer standing in the way.
 *
 * ── A failure is never silent ───────────────────────────────────────────────
 * Callers keep the organisation when provisioning fails (see above), so the log
 * is the only place a failure can surface. It surfaces as exactly ONE
 * error-level line per call, carrying the organisation, how many modules
 * failed, the database's own words, the scope the writes ran under and the
 * command that repairs it. Until 2026-09-22 it was one line per module plus an
 * info-level "provisioned" summary: self-serve signup ran this under the
 * pre-auth scope, RLS refused all 21 grants, and the only line at the level an
 * operator watches read "launch catalog provisioned".
 */
export async function provisionLaunchModules(
  organizationId: number,
  opts: { actorEmail?: string | null } = {},
): Promise<{ granted: string[]; failed: Array<{ moduleId: string; error: string }> }> {
  const granted: string[] = [];
  const failed: Array<{ moduleId: string; error: string }> = [];
  for (const moduleId of LAUNCH_MODULE_IDS) {
    try {
      await writeModuleGrant({
        organizationId,
        moduleId,
        enabled: true,
        actorEmail: opts.actorEmail ?? null,
        expiresAt: null,
      });
      granted.push(moduleId);
    } catch (err) {
      failed.push({ moduleId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (failed.length > 0) {
    const scope = getTenantScope();
    logger.error(
      `launch catalog NOT provisioned for organisation ${organizationId}: ` +
        `${failed.length} of ${LAUNCH_MODULE_IDS.length} launch modules were not granted`,
      {
        organizationId,
        attempted: LAUNCH_MODULE_IDS.length,
        granted: granted.length,
        failed: failed.length,
        failedModules: failed.map((f) => f.moduleId),
        errors: [...new Set(failed.map((f) => f.error))],
        scope: scope
          ? { tenantId: scope.tenantId, role: scope.role ?? null, source: scope.source, caller: scope.caller ?? null }
          : null,
        remediation: `npm run ops:provision-launch-modules -- --org ${organizationId}`,
      },
    );
  } else {
    logger.info('launch catalog provisioned', { organizationId, granted: granted.length });
  }
  return { granted, failed };
}
