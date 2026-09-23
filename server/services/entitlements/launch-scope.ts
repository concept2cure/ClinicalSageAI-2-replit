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
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ moduleId, error });
      logger.error('[launch-scope] failed to grant launch module', { organizationId, moduleId, error });
    }
  }
  logger.info('[launch-scope] launch catalog provisioned', {
    organizationId,
    granted: granted.length,
    failed: failed.length,
  });
  return { granted, failed };
}
