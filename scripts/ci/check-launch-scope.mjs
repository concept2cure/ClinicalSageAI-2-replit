#!/usr/bin/env node
/**
 * ci:launch-scope — the launch catalog is real, routable, licensable and
 * fixture-free.
 *
 * shared/constants/launch-scope.ts is the one list of what ships
 * (docs/LAUNCH_DEFINITION_OF_DONE.md, D2). A list is only a boundary if every
 * id in it exists and every file behind it is honest, so this gate proves:
 *
 *   1. Every launch surface id is a SURFACE_VIEWS key (the shell can route to
 *      it) and is registered in UI_SURFACES or is the synthesised `home`.
 *   2. Every launch module id is seeded by one of the catalog migrations, so
 *      provisionLaunchModules writes grants that a real row satisfies (the
 *      FK on module_subscriptions.module_id refuses anything else).
 *   2b. Every launch module id is on the keep-list of step 1 in
 *      db/migrations/20260810_reconcile_module_catalog.sql. That file runs late
 *      in the migration set and, under Rule 1, on EVERY deploy; its step 1
 *      retires every module_id not on its list. A launch module added by a
 *      later file (as 'ectd-publishing' was, by 20260814j) is therefore seeded,
 *      so rule 2 passes, and then re-deprecated on every deploy — invisible to
 *      getModuleCatalog, so the launch catalog loses it on any deploy-shaped
 *      database while every local check stays green. Found 2026-09-22 by
 *      tests/db/entitlement-grants-resolution.dbtest.ts; this rule catches the
 *      next one before a database is needed.
 *   2c. Every SURFACE_VIEWS key outside the scope (after DEEP_LINK_ALIASES)
 *      is in UI_SURFACES, so the server emits the 'launch-scope' verdict
 *      that locks its deep link. An unregistered one renders ungated.
 *   3. No file that implements a launch surface imports a symbol from
 *      client/src/concept2cure/v2/fixtures/ unless
 *      scripts/ci/launch-scope-fixture-allowlist.json names that symbol with a
 *      reason. The folder is misnamed for most of what it holds (lifecycle
 *      stages, board columns, tier labels are reference constants, not
 *      records), which is exactly why the allowlist is per symbol: a new
 *      import of a record array fails until someone writes down why it is
 *      not a fixture.
 *
 * Fails closed: a missing allowlist is an empty allowlist. Exit 1 on any
 * finding. `--json` for machine-readable output. LAUNCH_SCOPE_SURFACES_DIR
 * overrides the surfaces directory (the selftest points it at a copy carrying
 * a deliberate violation). LAUNCH_SCOPE_RECONCILE_FILE overrides the 20260810
 * file for rule 2b (the selftest points it at a copy missing a launch id).
 * LAUNCH_SCOPE_VIEWS_FILE overrides surfaceViews.ts for rule 2c (the selftest
 * points it at a copy carrying an unregistered key).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');
const SURFACES_DIR = process.env.LAUNCH_SCOPE_SURFACES_DIR
  ? path.resolve(process.env.LAUNCH_SCOPE_SURFACES_DIR)
  : path.join(ROOT, 'client/src/concept2cure/v2/surfaces');
const VIEWS = process.env.LAUNCH_SCOPE_VIEWS_FILE
  ? path.resolve(process.env.LAUNCH_SCOPE_VIEWS_FILE)
  : path.join(ROOT, 'client/src/concept2cure/v2/surfaceViews.ts');
const ALIASES = path.join(ROOT, 'client/src/concept2cure/v2/registryModel.ts');
const SCOPE = path.join(ROOT, 'shared/constants/launch-scope.ts');
const REGISTRIES = [
  path.join(ROOT, 'shared/constants/ui-surface-registry.ts'),
  path.join(ROOT, 'shared/constants/ui-surface-registry.ui-v2.ts'),
];
const CATALOG_FILES = [
  'db/migrations/20260810_reconcile_module_catalog.sql',
  'migrations/20260814j_catalog_missing_product_surfaces.sql',
  'migrations/20260814k_catalog_mission_control.sql',
  'migrations/20260814l_catalog_filing_strategy.sql',
].map((f) => path.join(ROOT, f));
const ALLOWLIST = path.join(ROOT, 'scripts/ci/launch-scope-fixture-allowlist.json');
const RECONCILE = process.env.LAUNCH_SCOPE_RECONCILE_FILE
  ? path.resolve(process.env.LAUNCH_SCOPE_RECONCILE_FILE)
  : path.join(ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql');

const read = (p) => fs.readFileSync(p, 'utf8');

// ── 1. The scope file, parsed structurally (no TS evaluation in CI) ────────
const scopeSrc = read(SCOPE);
const appBlocks = [...scopeSrc.matchAll(/\{\s*id:\s*'([^']+)',\s*label:[^]*?surfaces:\s*\[([^\]]*)\][^]*?modules:\s*\[([^\]]*)\]/g)];
// Strip comments before collecting ids: a note such as `// removed 'authoring-engine'`
// inside the array must not count as a member (found 2026-09-21 by WI).
const stripComments = (s) => s.replace(/\/\*[^]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const ids = (s) => [...stripComments(s).matchAll(/'([^']+)'/g)].map((m) => m[1]);
const apps = appBlocks.map((m) => ({ id: m[1], surfaces: ids(m[2]), modules: ids(m[3]) }));
const shellBlock = scopeSrc.match(/LAUNCH_SHELL_SURFACES[^=]*=\s*\{([^]*?)\n\};/);
const shellIds = shellBlock ? [...shellBlock[1].matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'/gm)].map((m) => m[1]) : [];
const launchSurfaces = [...new Set([...apps.flatMap((a) => a.surfaces), ...shellIds])];
const launchModules = [...new Set(apps.flatMap((a) => a.modules))];

const findings = [];
if (apps.length !== 6) findings.push({ rule: 'shape', detail: `expected 6 launch apps, parsed ${apps.length}` });

// ── 2. Routable + registered ───────────────────────────────────────────────
const viewsSrc = read(VIEWS);
const viewsBody = viewsSrc.slice(viewsSrc.indexOf('export const SURFACE_VIEWS'));
const viewKeys = new Set([...viewsBody.matchAll(/^\s+'?([a-z0-9-]+)'?:\s/gm)].map((m) => m[1]));
const registryIds = new Set(
  REGISTRIES.flatMap((p) => [...read(p).matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1])),
);
for (const id of launchSurfaces) {
  if (id === 'home') continue;
  if (!viewKeys.has(id)) findings.push({ rule: 'routable', detail: `launch surface '${id}' is not a SURFACE_VIEWS key` });
  if (!registryIds.has(id)) findings.push({ rule: 'registered', detail: `launch surface '${id}' is not in UI_SURFACES` });
}

// ── 2c. Gated: every routable id outside the scope receives a verdict ──────
// The server locks an out-of-scope surface by emitting a 'launch-scope'
// verdict for it (applyLaunchScope), and it can only do that for ids it knows:
// catalog rows and UI_SURFACES. LaunchScopeGate treats "no verdict" as "no
// lock" — deliberately, since a fabricated refusal is as dishonest as a
// fabricated permission. So a SURFACE_VIEWS key that is neither in the scope
// nor registered renders in production with enforcement on, and nothing else
// notices. The deep link resolves DEEP_LINK_ALIASES first (routing.ts
// surfaceIdFromLocation), so an alias is judged by its target: 'task-board'
// renders as the in-scope 'tasks', 'ind-lifecycle' as the locked
// 'ind-checklist'. Checked 2026-09-23 on all 122 routable ids with enforcement
// on: none leaks today; this keeps it that way.
const aliasSrc = read(ALIASES);
const aliasBlock = aliasSrc.match(/export const DEEP_LINK_ALIASES[^=]*=\s*\{([^]*?)\n\};/);
if (!aliasBlock) {
  findings.push({ rule: 'gated', detail: `could not find DEEP_LINK_ALIASES in ${path.relative(ROOT, ALIASES)}` });
} else {
  const aliases = Object.fromEntries(
    [...stripComments(aliasBlock[1]).matchAll(/^\s*'?([a-z0-9-]+)'?\s*:\s*'([a-z0-9-]+)'/gm)].map((m) => [m[1], m[2]]),
  );
  const inScope = new Set(launchSurfaces);
  for (const key of viewKeys) {
    const id = aliases[key] ?? key;
    if (inScope.has(id) || registryIds.has(id)) continue;
    findings.push({
      rule: 'gated',
      detail: `SURFACE_VIEWS key '${key}'${id === key ? '' : ` (alias of '${id}')`} is outside the launch scope and not in UI_SURFACES, so the server emits no verdict for it and a deep link renders it with enforcement on — register it, alias it to a registered surface, or add it to the scope`,
    });
  }
}

// ── 3. Licensable ─────────────────────────────────────────────────────────
const catalogSrc = CATALOG_FILES.filter(fs.existsSync).map(read).join('\n');
for (const id of launchModules) {
  if (!new RegExp(`'${id}'`).test(catalogSrc)) {
    findings.push({ rule: 'licensable', detail: `launch module '${id}' is seeded by no catalog migration` });
  }
}

// ── 3b. Survives the replay: on 20260810's step-1 keep-list ────────────────
// Fails closed: if the list cannot be found, that is a finding, not a pass —
// a reshaped file must not quietly turn this rule off.
{
  const reconcile = fs.existsSync(RECONCILE) ? read(RECONCILE) : '';
  const keep = reconcile.match(/WHERE module_id NOT IN \(([\s\S]*?)\);/);
  if (!keep) {
    findings.push({
      rule: 'survives-replay',
      detail: `could not find step 1's "WHERE module_id NOT IN (...)" keep-list in ${path.relative(ROOT, RECONCILE)}`,
    });
  } else {
    const kept = new Set([...keep[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    for (const id of launchModules) {
      if (!kept.has(id)) {
        findings.push({
          rule: 'survives-replay',
          detail: `launch module '${id}' is not on step 1's keep-list in ${path.relative(ROOT, RECONCILE)} — that step re-deprecates it on every deploy (Rule 1 replay); add it in place with a dated note`,
        });
      }
    }
  }
}

// ── 4. Fixture-free (per symbol, allowlisted with a reason) ───────────────
let allow = {};
if (fs.existsSync(ALLOWLIST)) {
  allow = JSON.parse(read(ALLOWLIST)).symbols ?? {};
  for (const [key, reason] of Object.entries(allow)) {
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      findings.push({ rule: 'allowlist', detail: `allowlist entry '${key}' needs a reason of at least 10 characters` });
    }
  }
}
// Which file implements which surface. surfaceViews.ts binds a component
// symbol to a chunk (`const Vault = lazySurface(...)` loading surfaces/Vault — written
// without the import keyword on purpose: ci:untracked-imports reads this file, and a
// quoted relative specifier in a comment parses there as a real import)
// and then an id to that symbol (`vault: { component: Vault, … }`). Two maps.
const pathForSymbol = {};
for (const m of viewsSrc.matchAll(/^const\s+(\w+)\s*=\s*lazy(?:Owned)?Surface\(\(\)\s*=>\s*import\('\.\/surfaces\/([^']+)'\)/gm)) {
  pathForSymbol[m[1]] = m[2];
}
for (const m of viewsSrc.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'\.\/surfaces\/([^']+)'/gm)) {
  for (const sym of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean)) {
    pathForSymbol[sym] = m[2];
  }
}
const fileFor = {};
for (const m of viewsBody.matchAll(/^\s+'?([a-z0-9-]+)'?:\s*\{[^}]*?component:\s*(\w+)/gm)) {
  if (pathForSymbol[m[2]]) fileFor[m[1]] = pathForSymbol[m[2]];
}
const checkedFiles = new Set();
for (const id of launchSurfaces) {
  const rel = fileFor[id];
  if (!rel) continue;
  const candidates = [`${rel}.tsx`, `${rel}.ts`, `${rel}/index.tsx`].map((f) => path.join(SURFACES_DIR, f));
  const file = candidates.find(fs.existsSync);
  if (!file || checkedFiles.has(file)) continue;
  checkedFiles.add(file);
  const src = read(file);
  for (const m of src.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*'(?:\.\.\/)+fixtures\/([\w-]+)'/g)) {
    if (m[1]) continue; // type-only imports carry no data
    // Comments inside the braces are prose, not symbols.
    const names = m[2].replace(/\/\*[^]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const raw of names.split(',')) {
      const sym = raw.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '');
      if (!sym || raw.trim().startsWith('type ')) continue;
      const key = `${m[3]}.${sym}`;
      if (!allow[key]) {
        findings.push({
          rule: 'fixture-free',
          detail: `${path.relative(ROOT, file)} imports '${sym}' from fixtures/${m[3]} for launch surface '${id}' and scripts/ci/launch-scope-fixture-allowlist.json does not explain it`,
        });
      }
    }
  }
}

const summary = {
  ok: findings.length === 0,
  apps: apps.length,
  launchSurfaces: launchSurfaces.length,
  launchModules: launchModules.length,
  filesChecked: checkedFiles.size,
  findings,
};
if (JSON_MODE) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(
    `[ci:launch-scope] ${apps.length} apps · ${launchSurfaces.length} surfaces · ${launchModules.length} modules · ${checkedFiles.size} surface files checked for fixture imports`,
  );
  for (const f of findings) console.log(`  ✗ ${f.rule}: ${f.detail}`);
  console.log(findings.length === 0 ? '✅ launch scope is routable, registered, licensable and fixture-free' : `❌ ${findings.length} finding(s)`);
}
process.exit(findings.length === 0 ? 0 : 1);
