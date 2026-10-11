# W5 — filing target request isolation (2026-10-06)

Launch rows: D2–D7, existing Authoring/Vault → Submission Center filing path.
This is regression evidence for the shared target picker, not launch qualification.

## Defect and repair

A delayed sequence read for submission A could replace the choices after the user
selected submission B, cleared the selection, reset the dialog, or changed project.
A delayed submission-list failure could overwrite a later successful reload.
The shared picker also read the shell project only when the response arrived;
Vault did not pass its already-known document project into that picker.

The canonical `useFilingTarget` now versions both read chains. Reload, reset,
project changes and unmount invalidate prior responses. The effective project is
captured by the load callback; the existing shell-project subscription clears old
choices and reloads an active picker when that project changes. An explicit
document project takes precedence over shell selection. Vault now passes its
existing `projectId`, as Authoring already passes its source-document project.

No new module, model, endpoint, dependency or store. Server placement, approval,
immutable-sequence and project rules remain authoritative. Existing visibility
of unanchored submissions is retained; this change does not qualify them.

## Validation

Before the picker repair, `filingTargetIsolation.test.tsx` failed 6 of 7 tests,
including A→B out-of-order reads, clear/reset, stale list errors and project
switches. After that repair, the explicit Vault document-project regression
failed 1 of 4 tests before wiring the existing project prop into the picker.

Final result: **100 tests passed across 7 files**. Production client/server build
passed. A new effect-cleanup lint warning was repaired without changing the
baseline.

Final command:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
 client/src/concept2cure/v2/__tests__/filingTargetIsolation.test.tsx \
 client/src/concept2cure/v2/__tests__/filingTargetOwnProject.test.tsx \
 client/src/concept2cure/v2/__tests__/documentAuthoringPlaceIntoFiling.test.tsx \
 client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmission.test.tsx \
 client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmissionDialog.test.tsx \
 client/src/concept2cure/v2/__tests__/vaultPlaceFromVault.test.tsx \
 tests/golden-journeys/ind-authoring.journey.test.ts
```

The client suites mock the API boundary; the IND golden journey uses existing
PGlite infrastructure. Build, changed-file warning ratchet (including the new
regression file), test-import and native canvas-path gates are run with unchanged
baselines. Full TypeScript is checked by the unchanged zero-error CI gate; the
local memory-limited runner is not used to claim a full typecheck.

## Remaining qualification and CI limitation

On predecessor `44ddfa3cdd2111bbc0ba460fd46ebe0cef26b1a9`, validation/audit,
browser smoke, Semgrep, CodeQL and baseline-refresh workflows passed. The main CI
workflow's Integration Tests job `112534678131` failed in its `npm test` step.
The connected GitHub log endpoint repeatedly returned `Transport closed`, so
its cause is not diagnosed or claimed repaired here. The subsequent real-database
test step was not reached. Main unit tests and coverage were still running when
this evidence was prepared. This failure remains open, independently of the
focused filing regression results.

This change ignores stale reads; it cannot cancel a write already accepted by
the server. It provides no global exactly-once placement guarantee. Live provider
access, verified tenant data, reviewer approval and complete IND qualification
remain outstanding.
