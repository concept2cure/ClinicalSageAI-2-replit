#!/usr/bin/env node
/**
 * CI gate: a route that takes an organization/tenant id from the URL PATH must
 * compare it against the caller's authenticated org.
 *
 * ── The class ────────────────────────────────────────────────────────────────
 * `GET /api/tenant-users/:tenantId` and its 42 siblings accept a tenant
 * identifier from the path. If a handler uses that value without checking it
 * against the JWT-bound org, any authenticated user reads or writes another
 * tenant's data — the textbook IDOR.
 *
 * RLS is NOT a reliable backstop for this class. Six tables are deliberately on
 * the RLS allowlist (`organization_users`, `api_keys`, `stripe_events`,
 * `billing_budgets`, `billing_alerts`, `__drizzle_migrations`) because they must
 * be readable BEFORE a tenant context exists — `validateApiKey` resolves which
 * org a key belongs to by reading `api_keys` pre-auth, and policing it once broke
 * all API-key authentication (ledger C-44). Those tables have no database-level
 * tenant boundary at all, so for routes touching them the application check is
 * the ONLY control.
 *
 * ── Why a gate rather than a code review ─────────────────────────────────────
 * Every one of the 43 routes is currently guarded — this class is in good shape.
 * But it is enforced by NINE different local idioms:
 *
 *   authorizeOrgAccess · enforceOrgScope · requireAuthedOrgId ·
 *   assertTenantMatchesAuth · requireOrganizationContext · validateTenantId ·
 *   orgScope · getOrgId · authedOrgId
 *
 * with no shared helper and no naming convention. That fragmentation is the real
 * finding. Auditing this class by hand means knowing all nine names: during the
 * review that produced this gate, four separate greps each reported "unguarded"
 * routes that were in fact guarded by an idiom the pattern did not know about.
 * A reviewer who stops at the first such result reports a false vulnerability; a
 * reviewer who trusts a too-narrow pattern in the other direction misses a real
 * one.
 *
 * This gate encodes the vocabulary once, so the check is mechanical and a NEW
 * route with an org path param cannot merge unguarded — the failure mode this
 * class actually has, since all existing routes are fine.
 *
 * ── What counts as a guard ───────────────────────────────────────────────────
 * Any of the known idioms appearing between this route's declaration and the
 * next one, including route-level middleware (`validateTenantId` is applied as
 * middleware on the router line, not called in the body). Deriving the list from
 * the code rather than inventing a convention is deliberate: a gate that demands
 * a new helper would fail 43 working routes and get switched off.
 *
 * Two routes legitimately IGNORE the path param and scope from the token
 * instead (`intelligent-reports`, `mdx-imports`, both with a SECURITY comment
 * saying so). They satisfy the gate through `orgScope` / `getOrgId`, which is
 * correct — using the token is a stronger answer than comparing to it.
 *
 * Exit 0 — every org-path-param route references a guard idiom, or is baselined.
 * Exit 1 — at least one does not.
 *
 * Usage:
 *   node scripts/ci/check-org-path-param-guards.mjs
 *   node scripts/ci/check-org-path-param-guards.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(repoRoot, 'docs/reports/org-path-param-guards-baseline.json');

/** Path segments that name a tenant. */
const ORG_PARAM = '(?:organizationId|orgId|organization_id|tenantId|tenant_id)';

const ROUTE_RE = new RegExp(
  `router\\.(get|post|put|patch|delete)\\(\\s*['"\`]([^'"\`]*:${ORG_PARAM}[^'"\`]*)['"\`]`,
  'g'
);

/**
 * Guard idioms, DERIVED from the routes that already exist rather than invented.
 * Adding a tenth is fine — put it here with the file that introduced it, so the
 * vocabulary stays discoverable in one place instead of nine.
 */
const GUARDS = [
  'authorizeOrgAccess', // routes/tenant-users.ts
  'enforceOrgScope', // routes/global-compliance.ts
  'requireAuthedOrgId', // routes/client-branding.ts, routes/grdheRoutes.ts
  'assertTenantMatchesAuth', // routes/grdheRoutes.ts
  'requireOrganizationContext', // routes/tenant-config.ts
  'validateTenantId', // routes/grdheRoutes.ts (route-level middleware)
  'orgScope', // routes/intelligent-reports.ts (ignores the param; token wins)
  'getOrgId', // routes/mdx-imports.ts (ignores the param; token wins)
  'authedOrgId', // src/routes/pm-settings.router.ts, routes/tenants-simple.ts
  'enforceSubjectAccess', // routes/global-compliance.ts (subject-level, org-scoped)
];
const GUARD_RE = new RegExp(`\\b(${GUARDS.join('|')})\\b`);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

/**
 * Any route declaration, org-scoped or not. The handler body must end at the
 * NEXT route of any kind — an earlier revision of this gate ended it at the next
 * ORG-PARAM route, so a guard belonging to an unrelated handler in between
 * satisfied the check. Mutation-testing caught it: deleting the real guard from
 * `tenant-users.ts` GET /:tenantId still exited 0, because two intervening POST
 * handlers each called authorizeOrgAccess inside the over-long slice. A gate
 * that cannot fail is worse than no gate, because it is believed.
 */
const ANY_ROUTE_RE = /router\.(?:get|post|put|patch|delete|all)\s*\(/g;

/**
 * `router.param('x', cb)` runs cb for EVERY route carrying `:x`, so a guard
 * living there covers routes whose own bodies contain no check at all. This
 * codebase does exactly that — `server/api/cmc/projectRoutes.ts` verifies
 * project ownership for 18 handlers via a single `router.param('projectId')`.
 *
 * A handler-scoped analysis cannot see it. An earlier revision of this gate had
 * that blind spot and reported a correctly-guarded router as UNGUARDED, which is
 * the more corrosive failure: a false positive on a safe route teaches the next
 * reader that the gate cries wolf, and then the true positive is ignored too.
 */
const PARAM_GUARD_RE = new RegExp(
  `router\\.param\\(\\s*['"\`](${ORG_PARAM.replace('(?:', '').replace(')', '')})['"\`]`,
  'g'
);

/** Params this router guards centrally, with the guard verified in the callback. */
function routerLevelGuardedParams(src, allRouteStarts) {
  const guarded = new Set();
  for (const m of src.matchAll(PARAM_GUARD_RE)) {
    // The callback body ends at the next route or param declaration.
    const next = allRouteStarts.find(i => i > m.index) ?? src.length;
    if (GUARD_RE.test(src.slice(m.index, next))) guarded.add(m[1]);
  }
  return guarded;
}

const findings = [];
for (const file of walk(path.join(repoRoot, 'server'))) {
  const src = fs.readFileSync(file, 'utf8');
  const allRouteStarts = [...src.matchAll(ANY_ROUTE_RE)].map(m => m.index);
  const paramGuarded = routerLevelGuardedParams(src, allRouteStarts);
  for (const m of src.matchAll(ROUTE_RE)) {
    const next = allRouteStarts.find(i => i > m.index);
    const inBody = GUARD_RE.test(src.slice(m.index, next ?? src.length));
    // ...or the org param this route uses is guarded once at the router level.
    const viaParam = [...paramGuarded].some(pn => m[2].includes(`:${pn}`));
    findings.push({
      file: path.relative(repoRoot, file),
      verb: m[1].toUpperCase(),
      route: m[2],
      guarded: inBody || viaParam,
    });
  }
}

const unguarded = findings.filter(f => !f.guarded);
const key = f => `${f.file}::${f.verb} ${f.route}`;

if (process.argv.includes('--write-baseline')) {
  const prev = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries ?? {} : {};
  const entries = {};
  for (const f of unguarded) {
    entries[key(f)] = prev[key(f)] ?? { reason: 'TODO: state why this route may skip the org check, or guard it.' };
  }
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ entries }, null, 2) + '\n');
  console.log(`[ci:org-path-param-guards] wrote baseline with ${unguarded.length} entr(ies).`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries ?? {}
  : {};
const fresh = unguarded.filter(f => !(key(f) in baseline));
const stale = Object.keys(baseline).filter(k => !unguarded.some(f => key(f) === k));

console.log(
  `[ci:org-path-param-guards] ${findings.length} route(s) take an org/tenant id from the path; ` +
    `${findings.length - unguarded.length} guarded, ${unguarded.length} not (baseline ${Object.keys(baseline).length}).`
);

let failed = false;

if (fresh.length) {
  failed = true;
  console.error('\n[ci:org-path-param-guards] route(s) with an UNGUARDED org path param:\n');
  for (const f of fresh) {
    console.error(`  ${f.verb} ${f.route}`);
    console.error(`      ${f.file}`);
  }
  console.error(
    '\n  Compare the path id against the caller\'s org before using it, or ignore\n' +
      '  the param and scope from the token. Known idioms:\n' +
      `    ${GUARDS.join(', ')}\n\n` +
      '  RLS will NOT save you here — organization_users, api_keys and four other\n' +
      '  tables are deliberately unpoliced so they can be read pre-auth.\n'
  );
}

if (stale.length) {
  failed = true;
  console.error('[ci:org-path-param-guards] baseline entr(ies) now guarded — remove them:');
  for (const k of stale) console.error(`  ${k}`);
  console.error('');
}

if (failed) process.exit(1);
console.log('[ci:org-path-param-guards] OK — every org path param is checked against the caller.');
