# W5 — Vault filing confirmation (2026-10-06)

Launch rows: D2–D7, existing Vault/Authoring → Submission Center filing path.
This evidence improves the existing launch workflow; it does not qualify the
whole IND workload or complete those launch rows.

## Defects and repair

Vault accepted a nonempty leaf response as a successful filing without checking
that it named the requested source document, sequence, section and lifecycle
operation. Lost replies allowed immediate retry. Pending placement fields stayed
editable, and callbacks from a previous source could confirm the next document.
The UI ignored the existing service's audit outcome.

Both dialogs now use one leaf receipt matcher and audit-warning implementation
in the existing shared `filingTarget.tsx`. Authoring retains its existing snapshot
source checks. Vault confirms only the matching positive safe-integer leaf ID,
sequence, canonical section, lifecycle operation and `vault_documents` UUID.
Malformed/mismatched responses, lost replies and uncertain server failures block
repeat filing in the open dialog and show a confirmation warning. A known
pre-write refusal preserves the server verdict and permits retry.

The existing Vault surface passes its existing navigation callback, so "Check
filing status" reaches Submission Center. Fields are disabled during the write,
after confirmation, and while reconciliation is needed. A source-document or
project switch mounts a fresh dialog and invalidates old write callbacks; a
receipt for the old source cannot refresh or confirm the new source.

A matching receipt confirms placement even if its audit entry is missing or not
confirmed in retrievable history. In that case, the UI warns that governed filing
is incomplete and still refreshes confirmed placement. It does not fabricate a
rollback or claim the audit gap is repaired.

No new module, model, endpoint, store, integration or production dependency.
Server approval, tenancy, immutable-sequence and placement checks remain the
write authority. Vault still files the PDF itself, without creating a snapshot.

## Regression evidence

Before implementation, `vaultPlaceIntoSubmission.test.tsx` failed **17 tests**
and passed 38. The failing cases demonstrated uncertain outcomes, malformed and
mismatched receipts, ignored audit outcomes, stale source callbacks and unlocked
pending fields. The repaired behavior and existing filing regressions passed
**132 tests across 8 files**:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
 client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmission.test.tsx \
 client/src/concept2cure/v2/__tests__/documentAuthoringPlaceIntoFiling.test.tsx \
 client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmissionDialog.test.tsx \
 client/src/concept2cure/v2/__tests__/vaultPlaceFromVault.test.tsx \
 client/src/concept2cure/v2/__tests__/filingTargetOwnProject.test.tsx \
 client/src/concept2cure/v2/__tests__/filingTargetIsolation.test.tsx \
 client/src/concept2cure/v2/__tests__/submissionMutationOutcome.test.ts \
 tests/golden-journeys/ind-authoring.journey.test.ts
```

The real Vault surface test proves recovery navigation is wired; it mocks API
responses. The IND golden journey uses existing PGlite infrastructure. These
are not browser/live-service fault qualification.

Production client/server build, changed-file ESLint warning ratchet, test-import
and native canvas-path gates run with unchanged baselines. Added complexity was
removed into helpers within the existing file; the lint baseline was not raised.
The unchanged zero-error TypeScript gate is checked on the published commit in
CI; no local memory-limited full typecheck is claimed.

## CI and qualification still open

Predecessor `c2081449ece019b465c2bac49f773c0320144483` passed full TypeScript,
ESLint, validation/audit, browser smoke, Semgrep and CodeQL. Its main CI unit,
integration and coverage jobs were still running while this evidence was
prepared. An earlier Integration Tests job (`112534678131`, predecessor
`44ddfa3cdd2111bbc0ba460fd46ebe0cef26b1a9`) failed in `npm test`; the connected
GitHub log service repeatedly returned `Transport closed`, preventing diagnosis.
That failure is not claimed repaired by this change.

Blocking retry is confined to the open dialog; closing and reopening is a new
user action. This is not global exactly-once placement. A write already sent may
commit after a source switch. The recovery control opens the existing Submission
Center; it does not automatically prove whether an uncertain write committed.
The server commits placement before separately attempting its audit write;
that policy and any audit repair remain unchanged. Live provider access, verified
tenant data, reviewer approval and complete IND qualification remain outstanding.
