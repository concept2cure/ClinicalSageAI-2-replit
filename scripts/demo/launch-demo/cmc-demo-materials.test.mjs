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

import { BIOTECH_CMC, BIOTECH_SM_CMC } from './packs/biotech-work-content.mjs';
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

/**
 * Both of these were found by RUNNING the seed against a server and reading the
 * composed sections — no unit case noticed either, which is why they are cases
 * now.
 */
test('every study that claims a shelf life sends it, so §3.2.P.8 has its subject', async () => {
  /* `mapStabilityPayload` emits `drugProductShelfLifeClaim` only from a
     recorded claim, and the seed sent none — so §3.2.P.8 composed at 0%
     complete, missing `drugProductShelfLifeClaim`, for every demo project. The
     results table and its OOS row compose from `results` either way, which is
     why the unit cases were all green. */
  const app = fakeCmcApplication();
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  const claimed = BIOTECH_SM_CMC.stability.filter((s) => s.shelfLife);
  assert.ok(claimed.length > 0, 'the pack records no shelf-life claim at all');
  assert.equal(
    app.state.stability.filter((r) => r.shelfLife).length,
    claimed.length,
    'a study claiming a shelf life was recorded without it',
  );
});

test('a study already on file without its claim is given one', async () => {
  /* The seeder is idempotent by title, so a field added after a database was
     seeded would never reach it: §3.2.P.8 stayed at 0% on this container's
     database until the claim was also set on an EXISTING study. */
  const app = fakeCmcApplication();
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  for (const row of app.state.stability) row.shelfLife = null;
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  const claimed = BIOTECH_SM_CMC.stability.filter((x) => x.shelfLife).length;
  assert.equal(app.state.stability.filter((r) => r.shelfLife).length, claimed,
    'a study on file without its shelf-life claim was left without one');
});

test('the recorded release results reach the register §3.2.S.4.4 and §3.2.P.5.4 read', async () => {
  /* The seed recorded batch RECORDS and no QC results, so both sections
     composed missing their batch analyses — the two sections whose entire
     purpose is to carry quantitative results. */
  const app = fakeCmcApplication();
  await ensureCmc(app.ctx, PROGRAM, BIOTECH_SM_CMC, 'C2C-201');
  assert.equal(app.state.qcResults.length, BIOTECH_SM_CMC.qcResults.length);
  const sides = new Set(app.state.qcResults.map((r) => r.sampleType));
  assert.ok(sides.has('in-process'), 'no drug-substance result, so §3.2.S.4.4 has none');
  assert.ok(sides.has('finished-product'), 'no drug-product result, so §3.2.P.5.4 has none');
});

test('one recorded result disagrees with its own criterion, on purpose', async () => {
  /* So the composed section states the contradiction by name rather than
     printing "pass" — the behaviour phase 4's acceptance fixture pins, shown
     on data a person clicks through. */
  const contradicting = BIOTECH_SM_CMC.qcResults.filter(
    (r) => r.disposition === 'pass' && Number(r.value) < Number(String(r.criterion).split('-')[0]),
  );
  assert.equal(contradicting.length, 1, 'the pack records no declared pass over a failing result');
  assert.match(contradicting[0].observation ?? '', /investigation/i);
});

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
