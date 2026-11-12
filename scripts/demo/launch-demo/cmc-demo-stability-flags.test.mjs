/**
 * The C2C-201 demo records whether each stability result is within its limit
 * (GA-DEMO-01, 2026-11-10).
 *
 * The stability results C2C-201's pack records carried no `withinSpecification`
 * flag, and the Stability view read a missing flag as out of specification: it
 * said 14 of 14 results were outside their limits on a programme where one is
 * (total impurities at 6 months accelerated, 0.61 % against NMT 0.5 %). The
 * view now reads a missing flag as "not assessed"; the pack records the flag,
 * so the demo shows the one true OOS.
 *
 * DS-2502-R2's recorded "pass" at 97.4 % is deliberate and stays: phase 4's
 * acceptance fixture pins it (docs/evidence/S7/2026-11-08-phase4-acceptance-fixture/).
 *
 * node --test scripts/demo/launch-demo/cmc-demo-stability-flags.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BIOTECH_CMC, BIOTECH_SM_CMC } from './packs/biotech-work-content.mjs';

const resultsOf = (cmc) => cmc.stability.flatMap((s) => s.results.map((r) => ({ study: s.title, ...r })));

for (const [label, cmc] of [['C2C-201', BIOTECH_SM_CMC], ['C2C-101', BIOTECH_CMC]]) {
  test(`${label}: every stability result records whether it is within its limit`, () => {
    const unflagged = resultsOf(cmc).filter((r) => typeof r.withinSpecification !== 'boolean');
    assert.deepEqual(unflagged.map((r) => `${r.study} · ${r.parameter} at ${r.timePoint}`), []);
  });
}

test('C2C-201: exactly one stability result is out of specification, and it is the 6-month accelerated impurity', () => {
  const oos = resultsOf(BIOTECH_SM_CMC).filter((r) => r.withinSpecification === false);
  assert.equal(oos.length, 1);
  assert.equal(oos[0].parameter, 'Total impurities');
  assert.equal(oos[0].timePoint, '6');
  assert.equal(oos[0].result, '0.61');
  assert.match(oos[0].study, /accelerated/);
});

test('C2C-201: DS-2502-R2 is still recorded as a pass at 97.4 % (the phase 4 fixture pins it)', () => {
  const r2 = BIOTECH_SM_CMC.qcResults.find((q) => q.sampleId === 'DS-2502-R2');
  assert.equal(r2.disposition, 'pass');
  assert.equal(r2.value, '97.4');
  assert.equal(r2.criterion, '98.0 - 102.0 %');
});
