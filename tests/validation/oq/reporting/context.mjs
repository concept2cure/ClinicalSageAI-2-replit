/**
 * OQ-007 — the run every step module shares (the arrangement of tests/validation/oq/cmc/context.mjs).
 *
 * The steps live in sibling modules with their `await step(...)` at the top level. ESM evaluates this file once,
 * before any module that imports it, so every step module sees the same `step`, `state` and session.
 * `ci:validation-traceability` reads the runner as run.mjs plus the modules it imports with `from './*.mjs'`, so
 * every step in those modules must carry the kind docs/validation/OQ-007-REPORTING-ANALYTICS.md declares for it.
 */
import { createRun, helpers } from '../../lib/harness.mjs';

export const run = await createRun({
  app: 'REPORTING',
  appLabel: 'Reporting & analytics',
  protocolId: 'OQ-007',
  protocolTitle: 'Operational Qualification — Reporting & analytics',
});

export const { step, state } = run;
export const stamp = helpers.stamp();

/**
 * The fixtures the tester names (OQ-007 §1): a program the run identity owns, for the project-scoped refusals, and
 * another organisation's report run and project tracking record, written by
 * docs/evidence/W3/2026-11-10/setup/fixtures-reporting.mjs. The runner refuses to guess any of them.
 */
export const FIXTURES = {
  ownProgramId: (process.env.OQ_QMS_PROGRAM_ID || '').trim(),
  foreignProgramId: (process.env.OQ_FOREIGN_PROJECT_ID || '').trim(),
  foreignRunId: (process.env.OQ_FOREIGN_REPORT_RUN_ID || '').trim(),
  foreignTrackingProjectId: (process.env.OQ_FOREIGN_TRACKING_PROJECT_ID || '').trim(),
};
