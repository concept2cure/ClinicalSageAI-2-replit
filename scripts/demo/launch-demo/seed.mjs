#!/usr/bin/env node
/**
 * launch-demo/seed.mjs — build the end-to-end demonstration data for the launch
 * catalog through the product's own API.
 *
 *   node scripts/demo/launch-demo/seed.mjs --pack biotech|mdx|lumen|faux|project-management|portfolio|all [--purge]
 *     [--base-url http://localhost:5200] [--email founder@example.com]
 *     [--organization-id <id>] [--client-workspace-id <id>] (workspace: biotech only)
 *     [--plan enterprise]  (platform owner: open every demo work area to the organisation)
 *
 *   npm run demo:seed -- --pack all    # excludes the dedicated Faux Biotech tenant
 *   npm run demo:seed -- --pack faux   # only as a Faux Biotech organization member
 *   npm run demo:seed -- --pack portfolio  # opt-in fictional CSR portfolio; never part of all
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
import { connect, ensureDemoPlan, makeRun } from './lib.mjs';

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

/* project-management (P-122 defects, 2026-11-10) writes the Schedule, roll-up and "at risk" engines' records on the
   biotech and Lumen packs' projects, so it runs after them: "all" keeps this order. portfolio is opt-in (OPT_IN
   below) and never part of "all". */
const PACKS = ['biotech', 'mdx', 'lumen', 'faux', 'project-management', 'portfolio'];
const chosen = opt('pack', 'all');
// Faux Biotech is a dedicated fictional ORGANIZATION, not another pack in a
// shared tenant. Never include it in a blanket "--pack all" invocation.
// The fictional CSR portfolio is opt-in too (--pack portfolio), so the
// automatic "--pack all" a Codespace re-runs is unchanged by it.
const OPT_IN = ['faux', 'portfolio'];
const list = chosen === 'all' ? PACKS.filter(pack => !OPT_IN.includes(pack)) : chosen.split(',');
if (list.length === 0 || list.some(p => !PACKS.includes(p)) || new Set(list).size !== list.length) {
  console.error(`--pack must be one of ${PACKS.join(', ')} or all`);
  process.exit(2);
}

if (list.includes('faux') && list.length !== 1) {
  console.error('--pack faux must run alone under the dedicated fictional organization. No packs were run.');
  process.exit(2);
}
if (list.includes('portfolio') && list.length !== 1) {
  console.error('--pack portfolio must run alone (it is opt-in and never part of all). No packs were run.');
  process.exit(2);
}
const clientWorkspaceId = opt('client-workspace-id', process.env.DEMO_CLIENT_WORKSPACE_ID);
if (clientWorkspaceId !== undefined && list.some(pack => pack !== 'biotech')) {
  console.error('--client-workspace-id is currently supported by the biotech pack only; no packs were run.');
  process.exit(2);
}
// This pack is for a separately created fictional organization; its explicit
// numeric id is required in addition to the recorded organization-name check.
// Never guess the target from whichever account a token happened to sign in.
const targetOrganizationId = opt('organization-id', process.env.DEMO_EXPECTED_ORGANIZATION_ID);
if (list.includes('faux') && !targetOrganizationId) {
  console.error('--pack faux requires --organization-id or DEMO_EXPECTED_ORGANIZATION_ID. No demo records were written.');
  process.exit(2);
}
const ctx = await connect({ baseUrl: opt('base-url'), email: opt('email'),
  expectedOrganizationId: targetOrganizationId, clientWorkspaceId });
console.info(`Signed in as ${ctx.identity.email} (user ${ctx.identity.userId}, organisation ${ctx.identity.organizationId}) at ${ctx.baseUrl}`);

/* The demo's work areas must be open to the organisation it runs in
   (2026-10-31: on a lower plan, Communication, CMC / Module 3, Risk-based
   monitoring and Biostatistics answered "not included in your subscription",
   and a client demo read the rail as broken). With --plan <tier> the platform
   owner raises the organisation's plan through Master licensing; otherwise the
   locked areas and the remedy are said before anything is seeded. */
const plan = await ensureDemoPlan(ctx, opt('plan'));
ctx.preflight.plan = plan;

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
