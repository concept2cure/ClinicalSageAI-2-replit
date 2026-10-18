# F19 affected-record navigation evidence

The shared notification tray now resolves a record when its open control is
clicked. The authenticated request's live recipient audience and canonical
source/object/program policies select the destination. Neither notification
metadata nor the recorded URL's program hint grants access. The returned target
contains only an owning surface, native record parameters and a nullable UUID
program. Failures retain the notice and offer retry; opening does not mark read.

The contract and actual producer inventory are in
`notification-record-contract.md`. Supported destinations are saved reports,
unified tasks, canonical authored documents/sections, owned legacy projects,
regulatory programs, submissions/sequences, gateway transmittals, protocols and
controlled QMS documents. Saved document/submission reports retain their
canonical parent's UUID program without converting an artifact into an authored
document. Unfiled context explicitly clears the previously open program.

## Actual destination behavior

- Gateway reads the exact target independently of the bounded log. Its fresh
  record replaces a stale same-ID list copy; unavailable targets remain
  retryable and never mark another row as the target.
- Authoring receives repeated exact document/section targets without remounting
  the workbench. Its existing `requestLeave` owns the unsaved-work decision;
  Cancel preserves the current canvas. An asynchronous section read rechecks
  the ceremony before changing the canvas. A program switch waits for the
  existing scope/unsaved decision.
- Submission Center accepts repeated and copied exact submission/sequence
  targets, checks them against the actual canonical read, and retains a failed
  target for the visible retry control. A missing parent/sequence never becomes
  a first-row success.
- Protocol, Quality and Tasks use their owning agents' exact-selection flows.
  Protocol emits `protocol`, and an unfiled document carries the explicit
  `protocolScope=unfiled`. Quality's editor read remains the content authority.

## Regression evidence

`notification-record-red.log` records the initial absent resolver (15 failing
regressions and 2 controls). `notification-journey-red.log` records 5 actual tray
journey failures. `notification-consumer-red.log` records 5 failures across the
real Gateway, Authoring and Submission Center destinations.

`notification-authoring-unsaved-red.log` is retained as an early test run; its
requested dialog role was corrected to the workbench's existing `alertdialog`.
The successful canonical leave/cancel test is the relevant qualification,
alongside the independent target-handoff reproduction above.

`notification-record-green.log` records 157 passing tests in 13 files, covering the consolidated resolver, recipient
state/preferences, actual tray, destination and native unsaved-work regressions.
The SQL-backed Express/PGlite fixture exercises actual query/policy evaluation,
including stale privileged claims, private programs, foreign/deleted records,
recipient/role mismatch, expiry/archive/preferences, revoked membership,
malformed references and read failure/recovery. It is a synthetic schema and
does not establish a production PostgreSQL RLS deployment claim.

`notification-record-lint.log` records zero lint errors. New modules are clean;
the touched established large components retain existing size/complexity
warnings. No service credentials, live agency transmission, commit, push or
deployment occurred.

## Explicit remaining legacy limits

The separate Phase-13 project/review notification stores are not the shared
inbox and have no proven cross-store canonical mapping. Generic artifact IDs,
surface-only references, multi-record digests, unknown resource kinds and
projects without a unique owned program anchor remain explicit unavailable
targets. This change does not invent document mappings, migrate prose or
introduce automatic notification production in modules that currently have none.
