/**
 * ops:provision-launch-modules — grant the launch catalog to an existing
 * organisation.
 *
 * New organisations get it at creation (server/routes/auth.ts signup and
 * server/routes/setup.ts first run). Organisations created before that
 * landed, or by the laptop-only seed scripts, have no module_subscriptions
 * rows and see every app "not switched on". This writes the same grants the
 * creation path writes, through the same single grant writer.
 *
 *   npx tsx scripts/ops/provision-launch-modules.ts --org 2
 *   npx tsx scripts/ops/provision-launch-modules.ts --org 2 --actor ops@example.com
 *
 * Idempotent. Exits 1 if any grant failed, listing which.
 */
import { provisionLaunchModules } from '../../server/services/entitlements/launch-scope';
import { LAUNCH_MODULE_IDS } from '../../shared/constants/launch-scope';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const org = Number(arg('org'));
if (!Number.isInteger(org) || org <= 0) {
  console.error('usage: tsx scripts/ops/provision-launch-modules.ts --org <organizationId> [--actor <email>]');
  process.exit(2);
}

const { granted, failed } = await provisionLaunchModules(org, { actorEmail: arg('actor') ?? null });
console.log(`organisation ${org}: ${granted.length}/${LAUNCH_MODULE_IDS.length} launch modules granted`);
for (const f of failed) console.log(`  ✗ ${f.moduleId}: ${f.error}`);
process.exit(failed.length === 0 ? 0 : 1);
