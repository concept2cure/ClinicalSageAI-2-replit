#!/usr/bin/env node
/**
 * Tenant entry-point ratchet — every way into tenant data must be classified.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The tenant lifecycle guard (`server/middleware/tenantLifecycleGuard.ts`) is
 * Express middleware on the `/api` chain. It was written, tested, mounted, and
 * then found to be missing from FOUR other ways into tenant data, discovered one
 * at a time over three review passes:
 *
 *   1. `/api/v1` — allowlisted out of the auth boundary because it uses
 *      X-API-Key, so a suspended tenant's key kept full read AND write access.
 *   2. The hocuspocus collaboration socket — a different transport, and a pure
 *      write channel: suspended tenants kept editing documents in real time.
 *   3. `server/jobs/taskDueSweep.ts` — no transport at all: suspended tenants
 *      kept receiving automated notifications.
 *   4. Socket.IO — a third transport carrying live task/notification traffic.
 *
 * None of those were related to each other. All four were the same mistake: a
 * control mounted on ONE path and assumed to be everywhere. Finding the fifth by
 * reading code again is not a strategy — this gate makes the surface enumerable
 * instead.
 *
 * ── What it checks ────────────────────────────────────────────────────────────
 * Every file matching a known ENTRY-POINT SHAPE (an alternative-auth router, a
 * socket handshake, a scheduled sweep) must EITHER reference the tenant
 * lifecycle vocabulary, OR appear in the baseline with a written justification.
 * The baseline may only shrink.
 *
 * This is deliberately the same idiom as `check-tenant-isolation.mjs` and
 * `audit-requestdb-coverage.mjs` — baseline plus per-entry justification, parity
 * enforced — because the repository already proved that idiom works and a second
 * pattern for the same job would just be another thing to remember.
 *
 * ── What it does NOT claim ────────────────────────────────────────────────────
 * A textual reference is not proof the check is correct or reachable; the
 * behavioural proof is the contract tests next to each surface. What this gate
 * buys is that a NEW entry point cannot ship having simply never considered the
 * question — which is exactly how all four above arrived.
 *
 * Usage:
 *   node scripts/ci/check-tenant-entry-points.mjs
 *   node scripts/ci/check-tenant-entry-points.mjs --write-baseline
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(REPO_ROOT, 'docs', 'reports', 'tenant-entry-points-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

/**
 * Where tenant data can be entered from. Each shape names a directory and a
 * predicate on the file's CONTENT, because the file name alone does not say
 * whether something is an entry point.
 */
const ENTRY_POINT_SHAPES = [
  {
    kind: 'scheduled-sweep',
    dir: 'server/jobs',
    // A sweep that opens a system-wide scope reaches every tenant by definition.
    matches: src => /runWithSystemTenantScope|setInterval|cron\./.test(src),
  },
  {
    kind: 'worker',
    dir: 'server/workers',
    matches: src => /runWithSystemTenantScope|setInterval|withTenantConnection/.test(src),
  },
  {
    kind: 'socket-transport',
    dir: 'server',
    fileMatches: f => /socketServer\.ts$|hocuspocus-server\.ts$/.test(f),
    matches: () => true,
  },
  {
    kind: 'alternative-auth-router',
    dir: 'server/routes',
    // Routers that authenticate with something OTHER than the session, and are
    // therefore allowlisted out of the auth boundary.
    matches: src => /x-api-key|X-API-Key|validateApiKey|scim/i.test(src),
  },
];

/** Tokens that show the surface has considered tenant entitlement. */
const LIFECYCLE_VOCABULARY = [
  'getTenantAccessPosture',
  'shouldProcessTenantInBackground',
  'filterTenantsForBackgroundWork',
  'enforceTenantLifecycle',
  'decisionPermitsMethod',
  'backgroundWorkPermitted',
];

function walk(dir) {
  const abs = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(ts|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name))
    .map(e => path.posix.join(dir, e.name));
}

function discover() {
  const found = new Map();
  for (const shape of ENTRY_POINT_SHAPES) {
    for (const rel of walk(shape.dir)) {
      if (shape.fileMatches && !shape.fileMatches(rel)) continue;
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      if (!shape.matches(src)) continue;
      const considered = LIFECYCLE_VOCABULARY.some(token => src.includes(token));
      const digest = crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
      // A file can match more than one shape; first classification wins, but a
      // "considered" result is never downgraded.
      const prior = found.get(rel);
      found.set(rel, {
        kind: prior?.kind ?? shape.kind,
        considered: considered || Boolean(prior?.considered),
        digest,
      });
    }
  }
  return found;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return { unconsidered: {} };
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

const discovered = discover();
const unconsidered = [...discovered.entries()]
  .filter(([, v]) => !v.considered)
  .map(([file, v]) => ({ file, kind: v.kind, digest: v.digest }))
  .sort((a, b) => (a.file < b.file ? -1 : 1));

if (writeBaseline) {
  const existing = loadBaseline();
  const out = {
    $comment:
      'Tenant-data entry points that do NOT reference the tenant lifecycle vocabulary. ' +
      'Each needs a justification saying why the surface does not need an entitlement ' +
      'check. This list may only SHRINK: wire the check, then re-run with ' +
      '--write-baseline. Adding an entry by hand is a regression, not a fix.',
    generatedBy: 'scripts/ci/check-tenant-entry-points.mjs --write-baseline',
    count: unconsidered.length,
    unconsidered: Object.fromEntries(
      unconsidered.map(u => [
        u.file,
        {
          reason:
            existing.unconsidered?.[u.file]?.reason ??
            `TODO(${u.kind}): justify or wire the entitlement check`,
          // Content hash at the time the justification was written. A baselined
          // file that later changes re-flags: the justification was true of the
          // code as it stood, and "this sweep has no per-tenant fan-out" stops
          // being true the moment someone adds one.
          digest: u.digest,
        },
      ])
    ),
  };
  fs.writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
  console.info(
    `[ci:tenant-entry-points] baseline written — ${unconsidered.length} unconsidered entry point(s)`
  );
  process.exit(0);
}

const baseline = loadBaseline();
const baselined = new Set(Object.keys(baseline.unconsidered ?? {}));
const isNew = unconsidered.filter(u => !baselined.has(u.file));
const fixed = [...baselined].filter(f => !unconsidered.some(u => u.file === f));

console.info(
  `[ci:tenant-entry-points] ${discovered.size} entry point(s); ` +
    `${discovered.size - unconsidered.length} consider tenant entitlement, ` +
    `${unconsidered.length} do not (baseline ${baselined.size})`
);

if (fixed.length) {
  console.info(
    `  ${fixed.length} baselined entry point(s) now consider it or were removed: ${fixed.join(', ')}`
  );
  console.info('  Ratchet tighter: npm run ci:tenant-entry-points:write-baseline');
}

// A justification that is still the generated TODO is not a justification.
const unjustified = [...baselined].filter(f =>
  String(baseline.unconsidered[f]?.reason ?? '').startsWith('TODO(')
);

// A baselined file whose CONTENT changed must be re-justified. The reason was
// true of the code as it stood; "no per-tenant fan-out" stops being true the
// moment someone adds one, and nothing else would notice.
const drifted = unconsidered.filter(
  u => baselined.has(u.file) && baseline.unconsidered[u.file]?.digest !== u.digest
);

if (isNew.length) {
  console.error(
    `\n[ci:tenant-entry-points] FAIL — ${isNew.length} NEW tenant entry point(s) with no entitlement check:`
  );
  for (const u of isNew) console.error(`    ${u.file}  (${u.kind})`);
  console.error(
    '\n  Every way into tenant data must answer "may this tenant be operating?".\n' +
      '  Wire one of: getTenantAccessPosture / shouldProcessTenantInBackground /\n' +
      '  filterTenantsForBackgroundWork / enforceTenantLifecycle — or, if the surface\n' +
      '  genuinely does not need one, baseline it WITH a written reason:\n' +
      '    npm run ci:tenant-entry-points:write-baseline   (then replace the TODO)\n'
  );
  process.exit(1);
}

if (drifted.length) {
  console.error(
    `\n[ci:tenant-entry-points] FAIL — ${drifted.length} baselined entry point(s) CHANGED since justification:`
  );
  for (const u of drifted) console.error(`    ${u.file}  (${u.kind})`);
  console.error(
    '\n  Re-read the justification against the new code. If it still holds, refresh\n' +
      '  the digest: npm run ci:tenant-entry-points:write-baseline\n'
  );
  process.exit(1);
}

if (unjustified.length) {
  console.error(
    `\n[ci:tenant-entry-points] FAIL — ${unjustified.length} baselined entry point(s) carry an unfilled TODO:`
  );
  for (const f of unjustified) console.error(`    ${f}`);
  console.error('\n  Replace each TODO in the baseline with the real reason.\n');
  process.exit(1);
}

console.info('[ci:tenant-entry-points] OK — no unclassified tenant entry points.');
