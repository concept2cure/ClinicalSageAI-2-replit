/**
 * OQ-007 — Operational Qualification: Reporting & analytics.
 * Protocol: docs/validation/OQ-007-REPORTING-ANALYTICS.md. Requirements: docs/validation/URS-008-REPORTING-ANALYTICS.md.
 *
 * The steps live in the four `./steps-*.mjs` modules, in the order imported below; `./context.mjs` holds the run
 * they share. `ci:validation-traceability` reads the runner as this file plus the modules it imports with
 * `from './*.mjs'`, so each step must carry the kind the protocol declares for it. Each module imports the previous
 * one's name, which serialises them: sibling modules with top-level await would otherwise interleave.
 *
 * A run without `OQ_SIGNER_*`, `OQ_MEMBER_*`, `OQ_VIEWER_*` or the fixtures records each step that needs one as a
 * deviation, not executed. Nothing is simulated.
 */
import { run } from './context.mjs';
import { ACCESS_STEPS } from './steps-access.mjs';
import { FINALIZE_STEPS } from './steps-finalize.mjs';
import { COMPLIANCE_STEPS } from './steps-compliance.mjs';
import { SURFACE_STEPS } from './steps-surface.mjs';

console.info(`OQ-007 step modules: ${[ACCESS_STEPS, FINALIZE_STEPS, COMPLIANCE_STEPS, SURFACE_STEPS].join(" \u2192 ")}`);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
