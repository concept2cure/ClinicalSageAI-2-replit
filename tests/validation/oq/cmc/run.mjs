/**
 * OQ-008 — Operational Qualification: CMC / Module 3.
 * Protocol: docs/validation/OQ-008-CMC-MODULE-3.md. Requirements: docs/validation/URS-007-CMC-MODULE-3.md.
 *
 * The steps live in the eight `./steps-*.mjs` modules, in the order imported
 * below; `./context.mjs` holds the run they share. They are this runner's
 * steps — `ci:validation-traceability` reads the runner as this file plus the
 * modules it imports with `from './*.mjs'` — so each must carry the kind the
 * protocol declares for it, and neither may name a step the other lacks.
 *
 * ── Executing this is not the same as validating the app ─────────────────────
 * Decision P-28 requires the W3 posture (RLS enforcing, a non-owner runtime
 * role, launch scope enforced, a credentialed second signer) at one commit
 * beside IQ-001 and OQ-001…007, plus a named expert's signature on the
 * reference records OQ-CMC-03 creates. A run without `OQ_SIGNER_*`,
 * `OQ_MEMBER_*`, `OQ_VIEWER_*` or `DATABASE_URL_RUNTIME` records each step that
 * needs one as a deviation — *not executed, credential not supplied* — and its
 * record is a runner smoke test, not an OQ record. §4 of the protocol lists
 * what a real run needs and what remains after one.
 */
import { run } from './context.mjs';
/* The steps run as these modules are evaluated, in this order. Each is
   imported with a `from` clause because that is how the traceability gate
   finds a runner's step modules; the names are reported below, so the record
   says which modules contributed to it. */
import { ACCESS_STEPS } from './steps-access.mjs';
import { COMPILE_STEPS } from './steps-compile.mjs';
import { APPROVAL_STEPS } from './steps-approval.mjs';
import { FILING_STEPS } from './steps-filing.mjs';
import { SURFACE_STEPS } from './steps-surface.mjs';
import { REGISTER_STEPS } from './steps-registers.mjs';
import { ATTRIBUTION_STEPS } from './steps-attribution.mjs';
import { CORRESPONDENCE_STEPS } from './steps-correspondence.mjs';

console.info(`OQ-008 step modules: ${[ACCESS_STEPS, COMPILE_STEPS, APPROVAL_STEPS, FILING_STEPS, SURFACE_STEPS, REGISTER_STEPS, ATTRIBUTION_STEPS, CORRESPONDENCE_STEPS].join(', ')}`);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
