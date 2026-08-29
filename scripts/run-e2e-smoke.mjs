/**
 * Boot-and-run recipe for the Tier 5 authenticated browser smoke.
 *
 * Closes the "browser workflow" tier of the proof hierarchy with a reproducible
 * one-command run: seed the login user, boot the real server with dev-auth
 * enabled, wait for it, then drive a real Chromium through
 * tests/e2e/authenticated-app-smoke.e2e.spec.ts (real dev-login session →
 * ProtectedRoute → authenticated surfaces, plus a negative control that proves
 * the guard bites without a session).
 *
 * Prerequisites:
 *   - A provisioned Postgres reachable at DATABASE_URL (defaults to the local
 *     concept2cure-ri DB). The schema must already exist; this script only seeds
 *     the admin login user (idempotent) — it does not run migrations.
 *   - Playwright installed:  npm i -D @playwright/test && npx playwright install
 *     (kept out of package.json deliberately; the browser ships preinstalled in
 *     the managed sandbox — set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to reuse it).
 *
 * Usage:   npm run test:e2e:smoke
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...options });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(baseUrl, { method: 'GET' });
      if (res.ok || res.status < 500) return;
    } catch {
      // server not up yet — retry
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for dev server at ${baseUrl}`);
}

/** Resolve a runnable playwright: local bin first, else `npx playwright`. */
function resolvePlaywright() {
  const localBin = 'node_modules/.bin/playwright';
  if (existsSync(localBin)) return { cmd: localBin, prefix: [] };
  return { cmd: 'npx', prefix: ['playwright'] };
}

function startDevServer() {
  const env = {
    ...process.env,
    // The governed-export gate must be ON for the golden journey's
    // denied-before-review step to mean anything (server-side toggle;
    // non-production only — production is always enforced).
    EXPORT_REVIEW_GATE: process.env.EXPORT_REVIEW_GATE || 'enforce',
    DATABASE_URL:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable',
    SKIP_DB_STARTUP_TEST: process.env.SKIP_DB_STARTUP_TEST || 'true',
    NODE_ENV: 'development',
    // Dev-login is hard-gated behind BOTH of these (server/auth/dev-auth-policy.ts).
    // Without ALLOW_DEV_AUTH=1 the endpoint 404s and the smoke cannot authenticate.
    ALLOW_DEV_AUTH: '1',
    PORT: process.env.PORT || '5000',
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-session-secret',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret-32-char-minimum-value',
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-token-secret-32-char-min',
    CONCEPT2CURE_SIGNER_MODE: process.env.CONCEPT2CURE_SIGNER_MODE || 'dev',
  };
  // detached:true puts the server (and the `tsx`→`node` grandchild it spawns) in
  // its own process group, so cleanup can kill the WHOLE group. A plain
  // child.kill() only signals the direct `npx` child and orphans the node server,
  // leaving :5000 bound and the next run unable to boot.
  return spawn('npx', ['tsx', 'server/index.ts'], { stdio: 'inherit', env, detached: true });
}

/** SIGTERM the server's entire process group (see startDevServer). */
function stopDevServer(server) {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // group already gone — fall back to a direct kill
    try {
      server.kill('SIGTERM');
    } catch {
      /* already dead */
    }
  }
}

async function main() {
  // Seed the login user the smoke authenticates as (idempotent upsert).
  await run('node', ['scripts/seed-admin.mjs']);
  // Seed the governed-workflow identities (author/reviewer/admin) the golden
  // journey authenticates as (idempotent upsert; same database).
  await run('node', ['tests/e2e/seed-governed-workflow.cjs']);

  const server = startDevServer();
  let closed = false;
  server.on('close', () => {
    closed = true;
  });

  try {
    await waitForServer(BASE_URL);
    const pw = resolvePlaywright();
    // Which specs to drive comes from argv so the CI workflow can run each one
    // as its OWN step. That is not cosmetic: a combined step reports only
    // "exit code 1", and CI logs are not always retrievable, so a failure in
    // one spec is indistinguishable from the other. Separate steps make the
    // failing surface readable from the job's step list alone. Defaults to
    // both specs for a one-command local run.
    const specs = process.argv.slice(2).filter(a => !a.startsWith('-'));
    const toRun = specs.length
      ? specs
      : ['tests/e2e/authenticated-app-smoke.e2e.spec.ts', 'tests/e2e/golden-customer-journey.e2e.ts'];
    for (const spec of toRun) {
      await run(pw.cmd, [...pw.prefix, 'test', spec], { env: { ...process.env, BASE_URL } });
    }
  } catch (error) {
    console.error(
      '\nTier 5 smoke failed. Ensure Playwright is installed ' +
        '(npm i -D @playwright/test && npx playwright install) and DATABASE_URL points at a provisioned DB.'
    );
    throw error;
  } finally {
    if (!closed) stopDevServer(server);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
