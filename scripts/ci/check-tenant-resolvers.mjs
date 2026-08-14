#!/usr/bin/env node
/**
 * ci:tenant-resolvers — hold the number of local tenant/user resolvers.
 *
 * `resolveOrgId` decides which organization's data a request sees. It is
 * defined 57 times in 17 different precedence orders (ledger L58). The
 * canonical one in `server/types/auth-request.ts` reads
 * `organizationId ?? tenantContext.organizationId ?? user.organizationId ?? tenantId`;
 * the 35-file majority copy reads those four fields in the reverse order.
 *
 * They agree today only because `establishRequestTenantScope` populates
 * `req.tenantId` and `req.tenantContext.organizationId` from one value, so every
 * order lands on the same answer. That is agreement by coincidence on the
 * control whose entire job is tenant isolation. This gate does not fix the 57 —
 * re-pointing them without integration tests is the change most likely to cause
 * the leak it is meant to prevent — it stops the number growing while those
 * tests get written.
 *
 * Policy: the baseline may only shrink. Import from `server/types/auth-request`
 * instead, then regenerate. Adding an entry by hand is a regression, not a fix.
 *
 * Usage:
 *   node scripts/ci/check-tenant-resolvers.mjs
 *   node scripts/ci/check-tenant-resolvers.mjs --write-baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'tenant-resolvers-baseline.json');

/** The canonical home, and this guard, are allowed to define one. */
const EXEMPT = new Set([
  'server/types/auth-request.ts',
  'scripts/ci/check-tenant-resolvers.mjs',
  'scripts/ci/tenant-resolvers-baseline.json',
]);

/**
 * A local resolver is a function whose body reads the request's tenant or user
 * identity fields directly. Matching on the field reads rather than on the
 * function name, because the copies are called `resolveOrgId`, `resolveUserId`,
 * `resolveOrgIdForSlug` and `getOrgId`, and the next one will be called
 * something else.
 */
const TENANT_FIELDS =
  /\b(?:tenantId|organizationId|tenantContext\?\.organizationId|resolvedOrganizationId)\b/;

function findLocalResolvers(source) {
  const hits = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // A function declaration whose name says it resolves identity…
    if (!/(?:function|const)\s+(?:resolve|get)(?:Org|Organization|Tenant|User)\w*\s*[(=]/.test(lines[i])) {
      continue;
    }
    // …and whose body reads the raw request fields rather than delegating.
    const body = lines.slice(i, i + 16).join('\n');
    if (TENANT_FIELDS.test(body) && /\breq\b|\brequest\b/i.test(body)) {
      hits.push(i + 1);
    }
  }
  return hits;
}

function trackedSourceFiles() {
  const out = execSync("git ls-files -- 'server/**/*.ts'", {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .filter(f => !EXEMPT.has(f));
}

const found = [];
for (const rel of trackedSourceFiles()) {
  let src;
  try {
    src = readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch {
    continue;
  }
  if (findLocalResolvers(src).length > 0) found.push(rel);
}
found.sort();

if (process.argv.includes('--write-baseline')) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        $comment:
          'Modules that resolve the caller\'s organization or user id from the raw request instead of importing resolveOrgId / resolveUserId from server/types/auth-request. This list may only shrink. Re-point the call site, then regenerate with npm run ci:tenant-resolvers:write-baseline. Write the integration tests in ledger L58 BEFORE re-pointing — the precedence orders differ, and changing one without a test covering the disagreement is the change most likely to cause a cross-tenant read. Adding an entry by hand is a regression, not a fix.',
        generatedBy: 'scripts/ci/check-tenant-resolvers.mjs --write-baseline',
        count: found.length,
        modules: found,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote ${found.length} local tenant resolver(s) to scripts/ci/tenant-resolvers-baseline.json`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const allowed = new Set(baseline.modules ?? []);

console.log(`Local tenant resolvers: ${found.length} (baseline ${allowed.size})`);

const added = found.filter(f => !allowed.has(f));
const removed = [...allowed].filter(f => !found.includes(f));

if (removed.length > 0) {
  console.log(`\n${removed.length} baselined module(s) no longer define one — regenerate the baseline:`);
  for (const f of removed) console.log(`  - ${f}`);
}

if (added.length > 0) {
  console.error(
    `\nFAIL: ${added.length} new local tenant resolver(s). Import { resolveOrgId, resolveUserId } from server/types/auth-request instead:`,
  );
  for (const f of added) console.error(`  - ${f}`);
  console.error(
    '\nA second answer to "which organization is this" is a tenant-isolation decision, not a helper.',
  );
  process.exit(1);
}

console.log('\nOK: no new local tenant resolvers.');
