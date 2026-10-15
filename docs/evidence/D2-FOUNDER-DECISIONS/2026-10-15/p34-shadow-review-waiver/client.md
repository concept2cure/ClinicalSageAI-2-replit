# P-34: Shadow Review waiver, client half (D2)

**Decision:** P-34, `docs/LAUNCH_DEFINITION_OF_DONE.md` "### P-34". Shadow Review stays a dispatch gate. A provider outage
can be answered by a Part 11 signed waiver on the sequence. The waiver answers only "no review has run" and never waives a
finding. The verdict reads *cleared, not assessed by Shadow Review*.
**Row:** D2 (launch catalog: Submission Center). **Lane:** client only. The server half is built in parallel against the same contract.
**Date:** 2026-10-15. **Base:** `18d58cbb2`.

## What the person sees

| Where | Before | After |
|---|---|---|
| Dispatch tab, newest run failed in an outage, user may sign, sequence not dispatched | "No completed Shadow Review… gate blocks." No way forward. | Same blocker, plus one line: *"Shadow Review run #91 failed on <time> because every AI provider was unavailable, so a signed waiver is offered. It lets the dossier go forward without an AI adversarial review, and it waives no finding."* Then **Waive Shadow Review — AI provider unavailable (Part 11 e-signature)**. |
| Dispatch tab, server says not eligible (newest run failed for something else) | (no field) | No button. The server's `reason`, verbatim. |
| Dispatch tab, older server (fields absent) | today's note | Unchanged. Nothing offered, nothing claimed. |
| Waiver **active** | n/a | Gate header: *"Dispatch gate clear — not assessed by Shadow Review (waived)"*. The shadowPresence gate's `notAssessed` note, rendered as the server sent it. The word "reviewed" appears nowhere on the tab. |
| Waiver **lapsed / revoked / undetermined** | n/a | Each has its own sentence (leaves changed after signing / revoked, clears nothing / could not be determined, none relied on). |
| Shadow review tab, `waived` run row | unknown status chip | Chip *"Waived — not reviewed"*. Risk cells show "—". Findings are not read. *"Run #92 records a waiver, not a review…"* |
| Shadow review tab, failed run | "did not complete" | Same, plus *"Run #91 failed because <the server's clause for its failureCode>."* When the readiness says eligible for this run, a words-only pointer to the Dispatch tab. No second control. |

The chain is SubmissionCenter's existing governed path, one branch longer:
`governed-precheck {step:'shadow-waiver'}` → EsignModal (meanings **responsibility, approval** only; target line
*"the dossier goes forward without an AI adversarial review, because Shadow Review run #N failed; no finding is waived"*)
→ precheck again → `POST /api/c2c/actions/sign {target:'ectd-sequence:<id>', payload:{intent:'shadow-waiver', meaning}}`
→ `POST /sequences/:id/shadow-review/waive {signatureActionId, failedRunId}` → the Dispatch tab is read again (it is
remounted under a `readinessBump` key, because a waive changes no sequence status).

A refusal (409 `SHADOW_WAIVER_NOT_ELIGIBLE`, 403 `GOVERNED_REQUIRED`, any definite 4xx) is shown in the modal's alert in the
server's words, followed by "Nothing goes forward on that signature." An answer with no definite verdict (a dropped
connection, a 5xx, or a 200 without `waiver.state === 'active'`) reads *"Whether the Shadow Review was waived could not
be confirmed…"*. That follows `SequenceAssembleTestPackage`'s `r.unconfirmed || !r.error` rule. Neither path produces
"Signature applied" or a success notice.

AnA gets no waive handler (P-34: "No AnA tool can waive"). The surface-action bus is untouched.

## Files

- `client/src/concept2cure/v2/surfaces/ShadowReviewWaiver.tsx` (new). Types, the offer, the state notes, the waived/failed
  run notes, `submitShadowWaiver`, and the ceremony words. 0 ESLint warnings.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`. `GovernedKind += 'shadow-waiver'`,
  `ReadinessAssessment extends WaiverReadiness`, `RUN_STATUS.waived`, `ShadowRunRow.failureCode`, the waived and failed
  branches in ShadowReviewWorkspace, and in DispatchWorkspace the note → `<ShadowPresenceNote>` + `<ShadowWaiverOffer>`
  with the gate-header mark. The none-state note text is unchanged (it moved into the new module).
- `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`. The label maps, `GovernedFlow.waiver`, `precheckRefusal` /
  `requestGoverned` carry the waiver, the `runWaiver` branch, the Dispatch key, and the EsignModal action, target line and meanings.
- `client/src/concept2cure/v2/__tests__/shadowReviewWaiver.test.tsx` (new, 17 tests).

No CSS added. Existing classes only.

## Red → green

| | Result | File |
|---|---|---|
| Red (HEAD code + new test) | **14 failed**, 3 passed | `client-red/shadowReviewWaiver.red.txt` |
| Green (new test) | **17 passed** | `client-green/shadowReviewWaiver.green.txt` |
| Green (every test file importing the two surfaces, 34 files) | **336 passed** | `client-green/surface-suite.green.txt` |
| Guard mutations (5) | each caught by a named test | `client-green/guard-mutations.txt` |
| ESLint per file, HEAD vs now | 5→5, 8→8, new files 0 | `client-green/lint-and-gates.txt` |
| Client gates (css classes, class vocabulary, text ramp, chip tones, internals-in-copy, empty-state honesty, action-overclaim, success-before-ok, sign-ceremony, client-api-calls, unreferenced-modules) | all pass | `client-green/lint-and-gates.txt` |

The three tests that pass at red are the negatives: absent fields, the author, and dispatched each offer nothing. They
pass at HEAD because nothing is offered at all. `guard-mutations.txt` shows that removing each guard turns its test red.
That run is what makes them tests of the guards.

Kept green: `dispatchWorkspaceHonesty`, `dispatchWorkspaceDispatchGate`, `dispatchWorkspaceFreezeGate`,
`submissionCenterGovernedWorkspaces`, and all `submissionCenter*` / `SubmissionSeqWorkspaces` consumers (listed in the suite file).

## Contract the server must meet (client reads it this way)

1. `GET …/dispatch-readiness` carries `shadowReviewWaiver.state` ∈ {none, active, lapsed, revoked, undetermined}. Any other
   value, or an absent field, is treated as unknown. `shadowReviewWaivable.eligible === true` **and** a numeric
   `failedRunId` are both required to offer. The offer is also withheld when the waiver is already `active`.
2. When `active`, the shadowPresence entry of `gates[]` (`key: 'shadowPresence'`) carries `notAssessed`. If it is absent,
   the client composes a sentence from `signerName`, `signedAt`, `signatureActionId` and `failedRunId`.
3. Separation of duties is read from the existing `signer.state`. `author` and `unresolved` hide the button.
4. `POST …/shadow-review/waive` 200 is confirmed by `waiver.state === 'active'` in the body (the route test's shape). A
   top-level `state` or a `shadowReviewWaiver` key is also accepted.
5. Failure words mirror `server/services/shadow-review/shadow-review-failure.ts` (`SHADOW_REVIEW_FAILURE_CODES` /
   `FAILURE_CLAUSE`) word for word. That module imports the gateway and cannot be bundled for the browser. **Follow-up:**
   move the code set and its clauses to `shared/constants/` so the client imports them, and the copy goes away.
6. The time of the failed run comes from the existing runs read (`GET …/sequences/:id/shadow-review`, the row's `createdAt`).
