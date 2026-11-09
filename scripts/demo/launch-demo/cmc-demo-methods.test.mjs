/**
 * A demo specification names an analytical procedure the demo also records.
 *
 * ## The defect
 *
 * `ensureCmc` (packs/work-areas.mjs) seeds three CMC registers —
 * specifications, stability studies, batch records — and each specification
 * carries `testMethods: { method: <free text> }`. No pack seeds the ANALYTICAL
 * METHOD register at all.
 *
 * That was invisible until 2026-11-08, when the approval route began refusing
 * a limit whose procedure is not shown fit to measure it
 * (`services/cmc/analytical-method-source.ts`,
 * `docs/evidence/F1/2026-11-08-specification-method-gate/`). The gate resolves
 * the named method against the project's method register and refuses
 * `METHOD_NOT_IN_REGISTER` when the register does not hold it — so **every
 * demo specification became unapprovable**, in the demo the founder walks.
 *
 * It is also the first of several reasons Module 3 cannot compose for a demo
 * project (J5-13, `docs/evidence/HUMAN-TEST/J5/README.md`): §3.2.S.4.3's
 * Analytical Methods table has no source, and `compositionRefusal` finds no
 * drug substance to classify.
 *
 * ## What these cases hold
 *
 * Every `method` string a pack's specifications name is a method that pack
 * records, compared the way the gate compares it — trimmed and lower-cased,
 * never by substring. And the seeder posts those methods to the register
 * before the specifications that cite them, with the ICH Q2 parameters the
 * governed validation requires, so the demo's limits can be approved.
 *
 * No real account, database or signature: the server boundary is simulated, as
 * in faux-demo.test.mjs.
 *
 * node --test scripts/demo/launch-demo/cmc-demo-methods.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BIOTECH_CMC } from './packs/biotech-work-content.mjs';
import { LMN201_CMC } from './packs/lumen-content.mjs';
import { DEMO_PROGRAM as PROGRAM, fakeCmcApplication, methodKey as key } from './cmc-demo-app.fixture.mjs';
import { ensureCmc } from './packs/work-areas.mjs';



const PACKS = [
  ['biotech (C2C-101)', BIOTECH_CMC],
  ['lumen (LMN-201)', LMN201_CMC],
];

for (const [label, cmc] of PACKS) {
  test(`${label}: every specification's method is a method the pack records`, () => {
    const recorded = new Set((cmc.methods ?? []).map((m) => key(m.title)));
    assert.ok(recorded.size > 0, `${label} records no analytical method, so none of its specifications can be approved`);
    for (const spec of cmc.specs) {
      assert.ok(
        recorded.has(key(spec.method)),
        `${label}: "${spec.name}" is measured by "${spec.method}", which the pack does not record — ` +
          'the approval route answers METHOD_NOT_IN_REGISTER',
      );
    }
  });

  test(`${label}: every recorded method states the ICH Q2 parameters its validation signs for`, () => {
    for (const m of cmc.methods ?? []) {
      assert.ok(m.code, `${label}: a method with no code: ${JSON.stringify(m)}`);
      assert.ok(Array.isArray(m.characteristics) && m.characteristics.length > 0,
        `${label}: "${m.title}" records no ICH Q2 characteristics, so POST /validate refuses it with nothing to sign`);
      assert.ok(typeof m.summary === 'string' && m.summary.trim().length > 0,
        `${label}: "${m.title}" records no validation summary`);
    }
  });

  test(`${label}: no method is declared validated in the pack's data`, () => {
    /* `validated` is reached only through POST /analytical-methods/:id/validate
       with a reason and re-authentication; an ordinary create carrying it is
       refused with a 409 (`ungovernedQualificationRefusal`). A pack that wrote
       it in its data would fail every run. */
    for (const m of cmc.methods ?? []) {
      assert.notEqual(key(m.status), 'validated', `${label}: "${m.title}" declares itself validated`);
    }
  });
}

test('the seeder records each method before the specification that cites it', async () => {
  const app = fakeCmcApplication();
  await ensureCmc({ api: app.api, run: app.run, tally: app.tally }, PROGRAM, BIOTECH_CMC, 'C2C-101');

  const posted = app.calls.filter((c) => c.method === 'POST');
  const firstSpec = posted.findIndex((c) => c.url === '/api/cmc/specifications');
  const lastMethod = posted.map((c) => c.url).lastIndexOf('/api/cmc/analytical-methods');
  assert.ok(lastMethod >= 0, 'the seeder posted no analytical method');
  assert.ok(firstSpec > lastMethod,
    'a specification was recorded before the method it names, so the approval gate cannot resolve it');

  const names = new Set(app.state.methods.map((m) => key(m.title)));
  for (const spec of BIOTECH_CMC.specs) {
    assert.ok(names.has(key(spec.method)), `no method recorded for "${spec.method}"`);
  }
});

test('the seeder carries the Q2 parameters, and does not sign without a signer', async () => {
  const app = fakeCmcApplication();
  await ensureCmc({ api: app.api, run: app.run, tally: app.tally }, PROGRAM, BIOTECH_CMC, 'C2C-101');

  for (const m of app.state.methods) {
    const q2 = m.ichQ2Parameters;
    assert.ok(q2 && Array.isArray(q2.characteristics) && q2.characteristics.length > 0,
      `"${m.title}" was recorded without ICH Q2 characteristics, so POST /validate has nothing to sign`);
  }
  assert.deepEqual(app.state.validated, [], 'the seeder signed a validation with no signer credential supplied');
  assert.ok(
    app.run.steps.some((s) => /method/i.test(s)),
    'the seeder recorded no step for the analytical methods',
  );
});

test('with a signer, each method is validated through the governed route', async () => {
  const app = fakeCmcApplication();
  const signer = { email: 'signer@example.test', password: 'pw', api: app.api };
  await ensureCmc({ api: app.api, run: app.run, tally: app.tally, signer }, PROGRAM, BIOTECH_CMC, 'C2C-101');

  assert.ok(app.state.methods.length > 0, 'the seeder recorded no method, so there was nothing to validate');
  assert.equal(app.state.validated.length, app.state.methods.length,
    'not every recorded method was validated through the governed route');
});

test('a second run records nothing twice', async () => {
  const app = fakeCmcApplication();
  const ctx = { api: app.api, run: app.run, tally: app.tally };
  await ensureCmc(ctx, PROGRAM, BIOTECH_CMC, 'C2C-101');
  const after = app.state.methods.length;
  assert.ok(after > 0, 'the seeder recorded no method, so idempotence says nothing');
  await ensureCmc(ctx, PROGRAM, BIOTECH_CMC, 'C2C-101');
  assert.equal(app.state.methods.length, after, 'the second run created the methods again');
});
