# W5 / D7 — authoring filing-placement confirmation

## Existing-build findings

Authoring creates a filing copy and then requests a submission leaf. The shared
mutation reader discarded HTTP status/outcome semantics and said a lost request
was not saved. The dialog treated any failed PUT as a definite refusal and said
nothing was placed, even if the response was lost after the server committed.
It trusted a leaf ID without checking sequence, section, source or lifecycle,
and discarded the server's auditTrail outcome. A document/project change could
leave the old dialog mounted and allow the old chain to continue or announce a
placement against the new selection. Malformed section data became an empty
saved document.

## Existing-path repair

mutateVerbatim keeps status, machine code and an unconfirmed flag. Common definite
refusals retain their server message; missing replies, malformed JSON, timeout,
5xx and OUTCOME_UNKNOWN remain uncertain. No transport fallback says the change
was not saved. Returned infrastructure details are redacted before display.
This metadata is consumed by Authoring here; other workspaces keep their existing
behavior, with the safer shared transport fallback.

The authoring dialog checks positive safe-integer snapshot IDs and the snapshot's
existing metadata.source/metadata.docId lineage. A copy with missing or mismatched
lineage is not placed. The leaf receipt must match sequence, canonical section,
coauthor document table/ID and lifecycle operation, with a positive safe-integer
leaf ID. A malformed/mismatched or lost receipt does not confirm a placement.
The dialog retains uncertainty, disables another write in that open dialog and
offers Check filing status through the existing Submission Center navigation.
A known refused leaf still states the actual partial state: copy created, leaf
refused. An uncertain copy states no leaf request was made and does not deny that
a copy might exist.

A confirmed placement is not rolled back or presented as unplaced when its audit
receipt is missing, persisted:false, or chained:false. The UI reports the placement
and an audit warning, with an error-toned toast. Missing or non-retrievable audit
history requires follow-up before treating the filing as complete. This patch does
not change the server's existing placement-before-audit policy or repair a missing
audit row.

Document/project identity keys the dialog; cleanup invalidates the old async chain.
After an old read or snapshot reply, no subsequent write is started. An already-sent
write can still commit, but its late response cannot toast or mutate the new dialog.
A synchronous latch prevents overlapping chains. Inputs and the close control are
disabled during a write. A completed placement is not repeatable in that same open
dialog. Closing/reopening remains an explicit new action; no exactly-once promise,
automatic retry or new idempotency protocol is introduced.

## Validation

Red: 21 regressions failed and 18 cases passed across the initial two files. Final
green: 121 tests passed across 8 files, run with
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run and these paths:

- client/src/concept2cure/v2/__tests__/submissionMutationOutcome.test.ts
- client/src/concept2cure/v2/__tests__/documentAuthoringPlaceIntoFiling.test.tsx
- client/src/concept2cure/v2/__tests__/submissionCenterGovernedWorkspaces.test.tsx
- client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmission.test.tsx
- client/src/concept2cure/v2/__tests__/vaultPlaceFromVault.test.tsx
- client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmissionDialog.test.tsx
- client/src/concept2cure/v2/__tests__/dispatchWorkspaceHonesty.test.tsx
- tests/golden-journeys/ind-authoring.journey.test.ts

Client harnesses cover lost/malformed receipts, wrong placement fields, invalid
snapshot IDs and lineage, three audit warning states, and pending read/snapshot/leaf
replies after document/project changes. They do not prove live network-fault behavior.
The existing IND journey uses real PGlite SQL. Production build, changed-file warning
ratchet (4 files, no warning count changes), test-import resolution, canvas-path gate
and git diff --check passed. The unchanged zero-baseline GitHub TypeScript gate checks
the published commit; no local full-tsc pass is asserted.

No new dependency, model, schema, API endpoint, store, module or provider dispatch was
added. Full IND, production and agency qualification remain open.
