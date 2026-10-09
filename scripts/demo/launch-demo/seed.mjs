#!/usr/bin/env node
/**
 * launch-demo/seed.mjs — build the end-to-end demonstration data for the launch
 * catalog through the product's own API.
 *
 *   node scripts/demo/launch-demo/seed.mjs --pack biotech|mdx|all [--purge]
 *     [--base-url http://localhost:5200] [--email founder@example.com]
 *
 *   npm run demo:seed -- --pack all
 *
 * Authentication: DEMO_SEED_TOKEN (a bearer token for the target server) or, on
 * a local server started with ALLOW_DEV_AUTH=1, dev-login as --email /
 * DEMO_SEED_EMAIL (default: the founder). Records land in that user's
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
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const PACKS = ['biotech', 'mdx'];
const chosen = opt('pack', 'all');
const list = chosen === 'all' ? PACKS : chosen.split(',').filter((p) => PACKS.includes(p));
if (list.length === 0) {
  console.error(`--pack must be one of ${PACKS.join(', ')} or all`);
  process.exit(2);
}

const ctx = await connect({ baseUrl: opt('base-url'), email: opt('email') });
console.info(`Signed in as ${ctx.identity.email} (user ${ctx.identity.userId}, organisation ${ctx.identity.organizationId}) at ${ctx.baseUrl}`);

let failed = false;
for (const pack of list) {
  const run = makeRun(pack);
  const mod = await import(`./packs/${pack}.mjs`);
  console.info(`\n=== ${flag('purge') ? 'purge' : 'seed'}: ${pack} ===`);
  try {
    if (flag('purge')) await mod.purge({ ...ctx, run });
    else await mod.seed({ ...ctx, run });
    const where = run.write();
    console.info(`manifest → ${where}`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${pack}: ${err.message}`);
    run.note(`FAILED: ${err.message}`);
    run.write();
  }
}
process.exit(failed ? 1 : 0);
