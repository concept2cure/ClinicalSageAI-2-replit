# AnA stopped-work admission — W3 / D4

Canonical branch: `concept2cure-v2`, repository
`concept2cure/ClinicalSageAI-2-replit`. Source base:
`f1b00425afd21fa4573201910c626a3d2f33cca6`.

## Required behavior

| Reproduced backend defect | Bounded repair |
| --- | --- |
| A cancelled request remains queued behind occupied model capacity, then reaches provider dispatch when a permit becomes available. | Remove the cancelled waiter immediately, preserve live FIFO order and capacity accounting, and classify cancellation before dispatch as `pre_call`. |
| A stopped non-streaming tool run can invoke later queued handlers with an already-aborted signal. | Check the existing signal immediately before each handler starts and return the existing cancellation result for every skipped call. |

The delivery changes existing backend admission only. Client files, markup,
styles and layout are untouched. Existing event/result contracts remain intact. No new model, tool,
integration, production dependency, capacity policy or regulated-artifact
writer is added. Tenant binding, provider placement, approved-model policy,
permission checks and control/audit boundaries remain in force.

The provider capacity permit remains held until dispatched work settles;
cancellation never frees an in-flight permit early. A cancelled queue entry
does not consume a permit, call a provider, trigger fallback or damage provider
health. Cancellation after a permit is handed over but before the callback
starts releases that permit without starting the callback. Uncontrolled calls
retain their existing behavior.

For non-streaming tools, the existing cancellation result accounts for each
requested call. A stop is not a tool error and does not invite a model to try
another action. This prevents newly queued handlers from starting; it does not
claim to reverse work already started or undo side effects.

## Qualification

Fail-first and successful behavioral evidence is filed in `gateway-queue/`
and `cancellation/`, on Node 22.23.3:

- Provider queue: **8 failed / 2 passed** before repair; final gateway
  qualification **121 passed across 11 files**, including ten new cases.
  The real route, placement, policy, retry and audit-buffer logic execute;
  only outbound dispatch is scripted. Tests cover custom/default abort reasons,
  permit handoff, live FIFO, cancellation-listener lifetime and capacity
  restoration. Audit assertions cover the in-memory buffer, not database
  persistence or a live provider.
- Non-streaming tools: **2 failed / 1 passed** before repair; final qualification
  **133 passed across ten files**, including three new cases. The actual
  `executeAgenticLoop` runs with registered read-only probes and a scripted
  gateway. Both one configured lane and the default four lanes are exercised.
  Existing permission, run-policy, hold, accounting and stream lifecycle tests
  stay green; the probes do not prove a real external tool's side effects.
- Combined qualification: **254 passing tests across 21 backend files**.
  Forced ESLint has zero errors and no warning growth: capacity limiter 0,
  gateway 25 existing warnings, tool executor 100 existing warnings; all three
  new test files have zero warnings. The production build passed, retaining
  the existing large-chunk warning (`production-build.txt`).

The final local source checkpoint `6b90c6cfa3bb7bd0db678618ab500862a2e64584`
passed the **full unchanged `.husky/pre-push`** against the starting remote
SHA: process exit 0, completion banner observed, **TypeScript zero errors
(tsc exit 0)**, elapsed 124.495 seconds. Full transcript and process verdict:
`prepush-qualification.txt` and `prepush-qualification.json`. No script, rule,
suppression or baseline was weakened. `source-files.json` pins the six tested
production/regression blobs. The final evidence commit changes documentation
only; an incomplete compiler attempt cannot qualify.

No production latency benchmark or remote CI success is
inferred from controlled local tests. Lint evidence retains every diagnostic
but omits duplicate source echoes; their hashes and the format change are
recorded in `eslint-evidence-format.json`. Transcripts trim trailing whitespace
only, preserving commands and verdicts.

Publication is source delivery through the connected GitHub Git-data API to
the sole canonical branch, with every blob and the full Git tree compared
against local Git and a non-force expected-SHA lease. `ui-scope.json` records
identical client trees at the base and qualified checkpoint, and zero changes
outside the selected server files and evidence directory. The published commit
and its remote workflows are verified after updating the branch and reported
separately. No production deployment or remote CI success is inferred from
these local gates.
