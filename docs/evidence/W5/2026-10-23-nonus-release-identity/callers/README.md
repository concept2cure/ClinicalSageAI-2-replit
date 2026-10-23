# W5 / D7 — existing release callers and continuation

## What already exists

`submission-service.ts` already owns governed freeze/dispatch, independent
unsent FDA renewal, waiver/disposition, transmit claims, package assembly,
pre-wire binding checks and chained audit. `ectd-compile.ts` already passes FDA
captured identity to that assembler. `SubmissionSeqWorkspaces.tsx` and
`SubmissionCenter.tsx` already reach server-owned renewal eligibility through
the existing Part 11 sign-and-act chain. The contract inventory in the parent
README names the canonical reader, P-44 number writer and version-1 proof.
This scope completes these callers; no new approval control, number writer,
region vocabulary, schema or dependency was added.

## Completed behavior

- Governed packageability uses captured recorded facts for every recognized
  region. Real release no longer judges a non-US placeholder dry run. Unknown
  regions and missing proof are refused. FDA DUNS/contact requirements remain
  US-only; other regional IDs are never borrowed from the FDA registry.
- Freeze takes the existing identity helper with `{forUpdate:true}`;
  claim/waiver/disposition use its default share lock. The helper locks
  organization, then actual submission; callers lock sequence next, validate
  its actual parent and program anchor, then lock program/sponsor and compare
  the binding. Freeze never upgrades a submission share lock to update.
- A successful transmit claim carries a required captured proof. Assembly uses
  that immutable snapshot, checks proof echo and current binding before wire,
  and includes the proof in existing metadata/audit for non-US as for US.
  Every newly introduced pre-wire refusal leaves/releases the claim unsent.
- The normalized application number the operator typed must equal the captured
  number under claim locks. A valid later signature over B cannot send B when
  the operator typed A against an earlier unlocked read. Gateway metadata uses
  the captured number after that equality check.
- Recognized non-US unsent dispatches use the existing independent renewal act.
  Only null/pending/rejected qualify; in-flight, sent, acknowledged, unreadable
  and unknown-region states remain refused. Full gates, spent ledger and CAS
  remain required, and generic lifecycle transitions stay forward-only.
- Existing compile passes projected regional proof and the recorded market
  number to the assembler; missing market number or unknown region refuses.
- Existing UI behavior already supports this server-authorized continuation.
  Production UI changed one comment only; see `ui/README.md`.

## Executed verification

Final scoped runs and commands are pinned in `verified-inputs.json` and
`verified-inputs.sha256`. Those working-tree pins were captured after the final
runs with no intervening owned production edit. They are not a full-suite or
agency qualification claim.

| Result | Outcome | Scope |
|---|---|---|
| `verified-caller-cohort.txt` | 119/119, 10 files | Actual JP/EU renewal with current applicant drift, original signature retained, independent creator/signer, chained audit and single-use signatures; captured packageability; actual waiver/disposition ordering and parent refusal; transmit proof/echo/typed-number race; existing release gates, filing order, voiding and local TLS delivery uncertainty safety |
| `verified-compile-cohort.txt` | 49/49, 4 files | Actual handler sends JP/EMA market number/projection with no FDA facts; missing number/unknown region refuse; existing FDA, sequence/type/history/converter behavior |
| `native-freeze-lock.txt` | 2/2, real PostgreSQL | Existing two-connection leaf/freeze serialization; executed before later transmit-only typed-number correction, with freeze/lock functions unchanged. Root archives integrated native proof separately |
| `ui/verified-ui-cohort.txt` | 38/38, 2 files | FDA/EMA/JP existing re-sign → fresh action → readiness continuation; independent signer/gate refusal, unresolved receipt and no automatic retry; jsdom API/password seams |
| `verified-lint.txt`, `verified-compile-lint.txt` | 0 errors | 16 existing production warnings in caller/compile lint; compile test lint clean |

Local TLS checks use synthetic endpoints and certificates. They prove claim
handling for known non-delivery versus delivery uncertainty; no real agency was
contacted. PGlite package tests use the actual existing assembler/packager and
chained audit writer; readiness/provider/transport seams are named by each test.
The separate tamper-proof audit store is absent in these small fixtures and its
secondary warning is visible; required chained transaction audit assertions pass.

## Fail first and exploratory results retained

- `fail-first.txt`: 20 failed / 23 passed on unchanged baseline caller
  production (`submission-service.ts` hash matches baseline `dd749f3e5`). These
  expose missing regional captured packageability/proof/echo, missing claim
  parent/order checks and unreachable renewal. Pins are in
  `fail-first-input-sha256.txt`. The initial renewal fixture incorrectly named
  the new column `market_application_number`; it was corrected to the existing
  `submissions.application_number` before the final run. Renewal eligibility
  assertions failed before that fixture number could establish coverage.
- `shadow-fail-first.txt`: 4 failed / 2 passed against the old lock paths after
  packageability edits. Order checks and the new submission-lock injection were
  absent; final actual service tests cover missing/swapped parents and both
  acts' order. Pins are in `shadow-fail-first-input-sha256.txt`.
- `typed-number-fail-first.txt`: 2 failed / 18 passed. FDA and JP each reached
  the wire sentinel with typed A while a later valid signature/claim captured B.
  Under-lock typed-number equality fixes both. Pins are in
  `typed-number-fail-first-input-sha256.txt`.
- `first-green-attempt.txt`: 43 passed / 6 failed, all six renewal cases exposed
  the fixture column-name mistake above. `lint-first.txt` also exposed one test
  formatting error, corrected before final lint.
- `second-green-attempt.txt`: interrupted after old transmit-guard mock rows
  omitted the newly required submission anchor/parent. That early refusal left
  a separate local TLS test waiting for a request; the owned run was stopped,
  mock rows were completed, and final 119/119 includes all those safety cases.

Human witnessing, real transport qualification and agency acceptance remain
unexecuted. Root owns the final compiler/build/canonical publication evidence.
