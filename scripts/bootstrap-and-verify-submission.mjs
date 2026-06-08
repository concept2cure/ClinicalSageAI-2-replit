#!/usr/bin/env node
/**
 * bootstrap-and-verify-submission.mjs — one command to take a DB-backed env from
 * cold to a green Submission Center end-to-end verification.
 *
 * Runs, in order: schema push → seed → seed --verify → (if the server is up) the
 * full runbook (scripts/verify-submission-center.mjs). Each step is guarded and
 * narrated; a missing prerequisite stops with a clear instruction rather than a
 * stack trace. Read-mostly and refuses NODE_ENV=production.
 *
 * Usage (in a DB-backed env):
 *   DATABASE_URL=postgres://… \
 *   BASE_URL=http://localhost:5000 \
 *   LOGIN_EMAIL=… LOGIN_PASSWORD=… [ALT_EMAIL=… ALT_PASSWORD=…] [DOC_ID=…] \
 *   npm run verify:submission:bootstrap
 *
 * If the server isn't running yet, it completes push+seed and tells you to start
 * the server and run `npm run verify:submission`.
 */

import { execSync } from 'node:child_process';

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  die('Refusing to run against production (NODE_ENV=production).');
}
if (!process.env.DATABASE_URL) {
  die('DATABASE_URL is not set — point it at a non-production Postgres and re-run.');
}

function step(label, cmd) {
  console.log(`\n▶ ${label}\n  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', env: process.env });
  } catch {
    die(`Step failed: ${label}`);
  }
}

async function serverIsUp() {
  for (const path of ['/api/health', '/api/healthz', '/api/region-profiles', '/']) {
    try {
      const res = await fetch(`${BASE}${path}`, { method: 'GET' });
      if (res.status < 500) return true; // any non-5xx means the server answered
    } catch {
      /* try next */
    }
  }
  return false;
}

async function main() {
  console.log('Submission Center bootstrap + verify');
  console.log(`  DB:   ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);
  console.log(`  BASE: ${BASE}`);

  step('Apply schema (drizzle-kit push)', 'npx drizzle-kit push');
  step('Seed demo data', 'node scripts/seed-ga-demo.mjs');
  step('Verify seed (idempotent re-run)', 'node scripts/seed-ga-demo.mjs --verify');

  if (!(await serverIsUp())) {
    console.log(
      `\n● Schema + seed are ready, but no server answered at ${BASE}.\n` +
        '  Start the server, then run:  npm run verify:submission\n'
    );
    process.exit(0);
  }

  if (!process.env.LOGIN_EMAIL || !process.env.LOGIN_PASSWORD) {
    die('Server is up but LOGIN_EMAIL / LOGIN_PASSWORD are not set for the runbook.');
  }

  step('Run end-to-end runbook', 'node scripts/verify-submission-center.mjs');
  console.log('\n✓ Bootstrap + verification complete.\n');
}

main().catch((e) => {
  console.error('Bootstrap crashed:', e);
  process.exit(1);
});
