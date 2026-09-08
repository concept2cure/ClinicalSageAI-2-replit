#!/usr/bin/env node
/**
 * Self-test for check-drizzle-tenant-scope.mjs.
 *
 * The gate reports OK on the current tree — 151 sites, all baselined — so its
 * failure branch never fires in normal use, and a guard whose failure branch has
 * never been seen has not been tested (CLAUDE.md, working agreement).
 *
 * This writes fixture routes into a temp directory, points a patched copy of the
 * gate at them, and asserts its verdict on each: the shape that caused the real
 * defect must fail, and the four shapes that must stay quiet must stay quiet.
 *
 * Usage: node scripts/ci/check-drizzle-tenant-scope.selftest.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:drizzle-tenant-scope:selftest]';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-scope-'));

/** A schema module declaring one org-scoped table and one that is not. */
const schemaDir = path.join(tmp, 'shared', 'schema');
fs.mkdirSync(schemaDir, { recursive: true });
fs.writeFileSync(
  path.join(schemaDir, 'fixture.ts'),
  `export const widgets = pgTable('widgets', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  projectId: integer('project_id'),
});
export const globalCodeList = pgTable('global_code_list', {
  id: serial('id').primaryKey(),
  code: text('code'),
});
`,
);

const routesDir = path.join(tmp, 'server', 'routes');
fs.mkdirSync(routesDir, { recursive: true });

/** Run a patched gate whose repoRoot is the fixture tree. */
function runGate(baselineSites = []) {
  const baselinePath = path.join(tmp, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify({ sites: baselineSites }));

  const src = fs
    .readFileSync(path.join(repoRoot, 'scripts', 'ci', 'check-drizzle-tenant-scope.mjs'), 'utf8')
    .replace(
      /const repoRoot = [^;]+;/,
      `const repoRoot = ${JSON.stringify(tmp)};`,
    )
    .replace(/const BASELINE = [^;]+;/, `const BASELINE = ${JSON.stringify(baselinePath)};`);

  const gatePath = path.join(tmp, `gate-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(gatePath, src);
  try {
    return { code: 0, out: execFileSync(process.execPath, [gatePath], { encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function route(name, body) {
  fs.writeFileSync(path.join(routesDir, name), body);
}
function clearRoutes() {
  for (const f of fs.readdirSync(routesDir)) fs.rmSync(path.join(routesDir, f));
}

const cases = [
  {
    name: 'FAILS on the real defect — a serial-id read with no organization',
    setup: () =>
      route(
        'bad.ts',
        `router.get('/x/:id', async (req, res) => {
  const tasks = await db.select().from(widgets).where(eq(widgets.projectId, id));
  res.json(tasks);
});`,
      ),
    expectExit: 1,
    expectIn: ['NEW unscoped', 'bad.ts::select:widgets'],
  },
  {
    name: 'FAILS on an unscoped lookup used to derive an org id (the create-path defect)',
    setup: () =>
      route(
        'derive.ts',
        `const [project] = await db.select().from(widgets).where(eq(widgets.id, projectId));
const row = { organizationId: project.organizationId };`,
      ),
    // The statement itself has no org predicate; the fact that the RESULT is
    // read for an org id is exactly what made this dangerous.
    expectExit: 1,
    expectIn: ['derive.ts::select:widgets'],
  },
  {
    name: 'quiet — the statement constrains organizationId',
    setup: () =>
      route(
        'good.ts',
        `const tasks = await db.select().from(widgets)
  .where(and(eq(widgets.projectId, id), eq(widgets.organizationId, orgId)));`,
      ),
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — the table is not org-scoped',
    setup: () =>
      route('global.ts', `const codes = await db.select().from(globalCodeList);`),
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — a known site stays baselined',
    setup: () =>
      route(
        'bad.ts',
        `const tasks = await db.select().from(widgets).where(eq(widgets.projectId, id));`,
      ),
    baseline: ['server/routes/bad.ts::select:widgets#0'],
    expectExit: 0,
    expectIn: ['all baselined'],
  },
  {
    name: 'reports a baselined site that has since been fixed',
    setup: () => route('good.ts', `const t = await db.select().from(widgets).where(eq(widgets.organizationId, o));`),
    baseline: ['server/routes/gone.ts::select:widgets#0'],
    expectExit: 0,
    expectIn: ['1 fixed since the baseline'],
  },
];

let failed = 0;
for (const c of cases) {
  clearRoutes();
  c.setup();
  const { code, out } = runGate(c.baseline ?? []);
  const missing = c.expectIn.filter(s => !out.includes(s));
  const ok = code === c.expectExit && missing.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
    console.log(out.split('\n').map(l => `      | ${l}`).join('\n'));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length}`);
  process.exit(1);
}
console.log(`\n${TAG} OK — ${cases.length}/${cases.length}; the gate fires on both defect shapes and stays quiet on the rest.`);
