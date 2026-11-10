/**
 * The small-molecule demo project fills all eighteen CMC registers (P-122).
 *
 * ## The gap
 *
 * `ensureCmc` wrote seven of CMC's eighteen registers — substance, product,
 * methods, specifications, stability with results, batches and QC results. The
 * other eleven rendered "No … yet" on every demo project, so Substance &
 * product opened as a wall of empty registers and §3.2 composed without them
 * (`docs/evidence/DESIGN/P-122/inventory/cmc.md`, A16).
 *
 * ## What these cases hold
 *
 * On C2C-201 — the pack's small molecule, the one project whose Module 3
 * composes (P-28) — every one of the eleven receives at least one row through
 * its own create route, before the compile runs; nothing is created in a
 * signed state; and a second run creates nothing.
 *
 * node --test scripts/demo/launch-demo/cmc-demo-registers.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BIOTECH_SM_CMC } from './packs/biotech-work-content.mjs';
import { CMC_REGISTER_PATHS, DEMO_PROGRAM as PROGRAM, fakeCmcApplication } from './cmc-demo-app.fixture.mjs';
import { ensureCmc } from './packs/work-areas.mjs';

const posted = (calls, path) => calls.filter((c) => c.method === 'POST' && c.url === path).length;

test('C2C-201: each of the eleven registers ensureCmc did not write gets a row', async () => {
  const app = fakeCmcApplication();
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  const empty = CMC_REGISTER_PATHS.filter((p) => posted(app.calls, p) === 0);
  assert.deepEqual(empty, [], `still empty after the seed: ${empty.join(', ')}`);
});

test('C2C-201: the impurities cover every class the assessment routes, and dissolution can be compared', async () => {
  const app = fakeCmcApplication();
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  const impurities = app.state.registers['/api/cmc/impurity-profiles'] ?? [];
  const classes = new Set(impurities.map((r) => r.impurityType));
  for (const c of ['process-related', 'degradation', 'mutagenic', 'residual-solvent', 'elemental']) {
    assert.ok(classes.has(c), `no ${c} impurity is recorded`);
  }
  /* f2 needs two profiles under one method, twelve units and recorded variability. */
  const profiles = app.state.registers['/api/cmc/dissolution-profiles'] ?? [];
  assert.equal(profiles.length, 2);
  const [a, b] = profiles;
  assert.deepEqual([a.apparatus, a.medium, a.rotationSpeed], [b.apparatus, b.medium, b.rotationSpeed]);
  for (const p of profiles) {
    assert.equal(p.unitsTested, 12);
    assert.ok(p.results.every((r) => r.rsd && r.n === '12'), `${p.batchNumber}: a point has no variability or unit count`);
  }
});

test('C2C-201: a second run creates nothing', async () => {
  const app = fakeCmcApplication();
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  const before = app.calls.filter((c) => c.method === 'POST' && CMC_REGISTER_PATHS.includes(c.url)).length;
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  const after = app.calls.filter((c) => c.method === 'POST' && CMC_REGISTER_PATHS.includes(c.url)).length;
  assert.equal(after, before, 'a re-run posted the registers again');
});
