/**
 * OQ-008 — the run every step module shares.
 *
 * The steps live in sibling modules with their `await step(...)` at the top
 * level, exactly as the Projects and QMS runners have theirs, so no module
 * wraps its steps in a function that would then be hundreds of lines long.
 * That arrangement needs one place for the run itself, which is this file:
 * ESM evaluates it once, before any module that imports it, so every step
 * module sees the same `step`, `state` and session.
 *
 * `ci:validation-traceability` reads the runner as run.mjs plus the modules it
 * imports with `from './*.mjs'`, so every step in those modules is this
 * runner's step and must carry the kind docs/validation/OQ-008-CMC-MODULE-3.md
 * declares for it.
 */
import { createRun, helpers } from '../../lib/harness.mjs';

/**
 * One step reads the screens (OQ-CMC-25, unscripted), so a real run needs a
 * browser. `VALIDATION_NO_BROWSER=1` runs the other thirty-two steps without
 * one — on a machine where playwright is not installed, every step would
 * otherwise fail at `createRun` before any requirement was exercised. OQ-CMC-25
 * then records a deviation, *not executed*, which is what the absence of a
 * browser honestly is; it is never reported as a pass.
 */
export const BROWSERLESS = process.env.VALIDATION_NO_BROWSER === '1';

export const run = await createRun({
  app: 'CMC',
  appLabel: 'CMC / Module 3',
  protocolId: 'OQ-008',
  protocolTitle: 'Operational Qualification — CMC / Module 3',
  needsBrowser: !BROWSERLESS,
});

export const { step, state } = run;
export const stamp = helpers.stamp();

/**
 * The programme under test is a small-molecule US IND, which is what this app
 * composes (URS-CMC-005). The out-of-scope programmes the refusal steps need
 * are built from this by overriding one field each, so a refusal is never
 * confounded with some other difference.
 */
export const IND = {
  name: `BX-701 IND ${stamp}`,
  productName: 'BX-701',
  programType: 'ind',
  productType: 'drug',
  applicationNumber: `1612${String(stamp).slice(-2)}`,
  primaryAgency: 'FDA',
  priority: 'high',
  indication: 'Relapsed multiple myeloma',
};

/** A programme id this organisation does not hold, for the tenancy steps. */
export const FOREIGN_PROJECT_ID = '00000000-0000-4000-8000-0000000000ff';
