/**
 * A demo project records the drug substance and the drug product its Module 3
 * is written about.
 *
 * ## The defect (J5-13's root cause)
 *
 * `ensureCmc` seeded specifications, stability studies and batch records — and
 * since 2026-11-09 the analytical methods those specifications name
 * (`cmc-demo-methods.test.mjs`). It recorded **no drug substance and no drug
 * product**, the two records §3.2.S.1 and §3.2.P.1 are written from.
 *
 * So for every demo project:
 *
 * - `compositionRefusal` found no drug substance and answered
 *   `CMC_MODALITY_NOT_ESTABLISHED` — *"This project records no drug substance,
 *   so whether its Module 3 is composable here is not established"*;
 * - §3.2.S.1 and §3.2.P.1 composed with no source.
 *
 * The human-test walk reported the symptom as *"the build is refused because
 * C2C-101 is a monoclonal antibody"* (J5-13,
 * `docs/evidence/HUMAN-TEST/J5/README.md`). That refusal is correct and is what
 * the demo SHOULD show for a biologic — but it was not the refusal the product
 * was giving, because the record that states the modality did not exist.
 *
 * ## What these cases hold
 *
 * Each pack records the substance and the product, with the modality STATED
 * rather than left to the route heuristic, and the seeder records both before
 * anything that is about them.
 *
 * The packs' payloads are also run through the REAL boundary, so each demo
 * project is refused for the reason that is true of it — but that case lives in
 * `server/services/cmc/__tests__/demo-packs-composition-boundary.test.ts`,
 * because `composition-scope.ts` imports its siblings by specifiers only the
 * bundler resolves, and a plain `node --test` cannot load it.
 *
 * node --test scripts/demo/launch-demo/cmc-demo-materials.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BIOTECH_CMC } from './packs/biotech-work-content.mjs';
import { LMN201_CMC } from './packs/lumen-content.mjs';
import { DEMO_PROGRAM as PROGRAM, fakeCmcApplication } from './cmc-demo-app.fixture.mjs';
import { ensureCmc } from './packs/work-areas.mjs';

const PACKS = [
  ['biotech (C2C-101)', BIOTECH_CMC, 'biologic'],
  ['lumen (LMN-201)', LMN201_CMC, 'biologic'],
];

for (const [label, cmc, modality] of PACKS) {
  test(`${label}: records the drug substance §3.2.S is written about`, () => {
    const s = cmc.substance;
    assert.ok(s, `${label} records no drug substance, so compositionRefusal answers CMC_MODALITY_NOT_ESTABLISHED`);
    assert.ok(s.name, `${label}: the substance has no name`);
    assert.ok(s.manufacturer, `${label}: §3.2.S.2.1 needs the manufacturer`);
    assert.ok(s.route, `${label}: §3.2.S.2.2 needs the manufacturing route`);
    /* Stated, not inferred. `classifySubstanceModality` reads the route as a
       heuristic when the modality is absent, and a demo must not depend on a
       heuristic to be in or out of composition scope. */
    assert.equal(s.modality, modality, `${label}: the modality must be stated, not left to the route heuristic`);
  });

  test(`${label}: records the drug product §3.2.P is written about`, () => {
    const p = cmc.product;
    assert.ok(p, `${label} records no drug product, so §3.2.P.1 composes with no source`);
    for (const field of ['name', 'dosageForm', 'strength', 'composition']) {
      assert.ok(p[field], `${label}: the product records no ${field}`);
    }
  });

  test(`${label}: a biologic substance states its origin, as §3.2.A.2 asks`, () => {
    const s = cmc.substance;
    if (s?.modality !== 'biologic') return;
    assert.ok(
      s.biologicalOrigin || s.cellLine || s.sourceOrganism,
      `${label}: a biologic records no origin, cell line or source organism, so §3.2.A.2 can state nothing`,
    );
  });
}

test('the seeder records the substance and the product first of all', async () => {
  const app = fakeCmcApplication();
  await ensureCmc({ api: app.api, run: app.run, tally: app.tally }, PROGRAM, BIOTECH_CMC, 'C2C-101');

  assert.equal(app.state.substances.length, 1, 'the seeder recorded no drug substance');
  assert.equal(app.state.products.length, 1, 'the seeder recorded no drug product');

  const posted = app.calls.filter((c) => c.method === 'POST').map((c) => c.url);
  /* The materials come first: §3.2.S.1/§3.2.P.1 are what the rest is about, and
     the composition boundary is decided from the substance record. */
  assert.equal(posted[0], '/api/cmc/drug-substances', `the first write was ${posted[0]}`);
  assert.ok(posted.indexOf('/api/cmc/drug-products') < posted.indexOf('/api/cmc/analytical-methods'),
    'the product was recorded after the analytical methods');
});

test('the substance carries the modality the boundary reads, as stated', async () => {
  const app = fakeCmcApplication();
  await ensureCmc({ api: app.api, run: app.run, tally: app.tally }, PROGRAM, BIOTECH_CMC, 'C2C-101');
  const [s] = app.state.substances;
  assert.equal(s.modality, 'biologic');
  assert.ok(s.manufacturingProcess?.route, 'the route reached §3.2.S.2.2');
  assert.ok(s.manufacturingProcess?.manufacturer, 'the manufacturer reached §3.2.S.2.1');
});

test('a second run records neither material twice', async () => {
  const app = fakeCmcApplication();
  const ctx = { api: app.api, run: app.run, tally: app.tally };
  await ensureCmc(ctx, PROGRAM, BIOTECH_CMC, 'C2C-101');
  await ensureCmc(ctx, PROGRAM, BIOTECH_CMC, 'C2C-101');
  assert.equal(app.state.substances.length, 1, 'the second run recorded the substance again');
  assert.equal(app.state.products.length, 1, 'the second run recorded the product again');
});
