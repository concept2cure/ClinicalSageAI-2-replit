#!/usr/bin/env node
/**
 * launch-demo/seed.mjs — build the end-to-end demonstration data for the launch
 * catalog through the product's own API.
 *
 *   node scripts/demo/launch-demo/seed.mjs --pack biotech|mdx|all [--purge]
 *     [--base-url http://localhost:5200] [--email founder@example.com]
 *     [--organization-id <id>] [--client-workspace-id <id>] (workspace: biotech only)
 *
 *   npm run demo:seed -- --pack all
 *
 * Authentication: DEMO_SEED_TOKEN (a bearer token for the target server) or, on
 * a local server started with ALLOW_DEV_AUTH=1, dev-login as --email /
 * DEMO_SEED_EMAIL (required; no identity is built in). Records land in that user's
 * organisation and are audited as that user.
 *
 * Each pack lives in ./packs/<pack>.mjs and exports { seed(ctx), purge(ctx) }.
 * A pack is idempotent by title prefix (see lib.mjs DEMO_PREFIX) and writes a
 * manifest of the ids it created to docs/evidence/DEMO/<pack>/manifest.json so
 * demo scripts and evidence can refer to real records.
 */
import { connect, makeRun } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return dflt;
  if (!args[i + 1] || args[i + 1].startsWith('--')) {
    console.error(`--${name} requires a value`);
    process.exit(2);
  }
  return args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const PACKS = ['biotech', 'mdx'];
const chosen = opt('pack', 'all');
const list = chosen === 'all' ? PACKS : chosen.split(',');
if (list.length === 0 || list.some(p => !PACKS.includes(p)) || new Set(list).size !== list.length) {
  console.error(`--pack must be one of ${PACKS.join(', ')} or all`);
  process.exit(2);
}

const clientWorkspaceId = opt('client-workspace-id', process.env.DEMO_CLIENT_WORKSPACE_ID);
if (clientWorkspaceId !== undefined && list.some(pack => pack !== 'biotech')) {
  console.error('--client-workspace-id is currently supported by the biotech pack only; no packs were run.');
  process.exit(2);
}
const ctx = await connect({ baseUrl: opt('base-url'), email: opt('email'),
  expectedOrganizationId: opt('organization-id', process.env.DEMO_EXPECTED_ORGANIZATION_ID), clientWorkspaceId });
console.info(`Signed in as ${ctx.identity.email} (user ${ctx.identity.userId}, organisation ${ctx.identity.organizationId}) at ${ctx.baseUrl}`);

let failed = false;
for (const pack of list) {
  const run = makeRun(pack);
  run.record('target', { baseUrl: ctx.baseUrl, userId: ctx.identity.userId,
    organizationId: ctx.identity.organizationId, clientWorkspaceId: ctx.clientWorkspaceId ?? null });
  run.record('preflight', ctx.preflight);
  const mod = await import(`./packs/${pack}.mjs`);
  console.info(`\n=== ${flag('purge') ? 'purge' : 'seed'}: ${pack} ===`);
  try {
    if (flag('purge')) await mod.purge({ ...ctx, run });
    else await mod.seed({ ...ctx, run });
    const where = run.write(flag('purge') ? 'purged' : 'seeded_unqualified');
    console.info(`manifest → ${where}`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${pack}: ${err.message}`);
    run.note(`FAILED: ${err.message}`);
    run.write('failed');
  }
}
process.exit(failed ? 1 : 0);
