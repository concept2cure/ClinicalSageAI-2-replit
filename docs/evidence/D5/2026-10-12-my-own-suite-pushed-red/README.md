# This lane pushed a suite red — the same mistake it had just criticised

**Row:** D5. **Session:** `…01P6GWSv`. **Date:** 2026-10-12.

## What happened

Yesterday this lane fixed a production defect in `5abe8101`: approving or
locking an artifact answered **409 ARTIFACT_CHANGED to every caller**, because
`validatedStatusChanges` admitted only the canonical columns while the status
route added `metadata`. Part of that fix was a new error — a wrong column set is
a server-side contract breach (`ARTIFACT_ACT_CONTRACT`), not a conflict — and the
evidence for it said this, of the lane that wrote the hardening:

> *"the route-level suites that did catch it were left red."*

`server/services/__tests__/artifact-signed-target-binding.test.ts` asserts the
refusal code for every unsafe act. Its harness defaulted to `ARTIFACT_CHANGED`.
Changing the code for a wrong column set made **5 of its cases fail**, and
`5abe8101` was pushed without running it.

So: the same mistake, by the lane that had just named it. The suite was created
by `c91dba526` — the very commit whose hardening broke the route — so both
sessions in this story shipped a change without running a suite that covered it.

It was not caught by the 16 suites verified for `5abe8101` because those were
found by grepping for `artifact-signed-act`, `artifact-approval-act`,
`commitSignedArtifactAct` and `ARTIFACT_ACT_MEANING`. This file names none of
them: it drives the act through a CommonJS harness
(`fixtures/artifact-signed-target-harness.cjs`) over a JSON case table. A grep
for the module under test does not find a test that reaches it indirectly.

## The change — test fixtures only; no production file touched

The repair is not "make the test match the code". The 5 cases pin something
worth pinning — *a supplied status update cannot inject content, change the
tenant, or be empty* — and the code they expected is now the wrong one for that
condition. So the harness learns the distinction instead of losing it:

- `fixtures/artifact-signed-target-harness.cjs` honours a per-case
  `expectedCode` (default `ARTIFACT_CHANGED`), **and reports the case name** in
  the assertion. The names are truncated in reporter output —
  `'approved: supplied status update cann…'` — which is exactly why identifying
  the five took an instrumented run rather than a read.
- `fixtures/artifact-signed-target-cases.json` marks those five
  `"expectedCode":"ARTIFACT_ACT_CONTRACT"`.

**The suite is now stronger than before, and the proof of that is the two cases
that did NOT change.** `approved/locked: supplied status update cannot change
status` supplies `{status:'draft'}` — a *canonical* column with a wrong value —
and still expects `ARTIFACT_CHANGED`. So the table now holds both halves of the
distinction `5abe8101` introduced:

| Supplied | Verdict | Why |
|---|---|---|
| a non-canonical column (`content`, `organizationId`), or nothing at all | `ARTIFACT_ACT_CONTRACT` | the caller's column set is wrong — our defect, 500, logged |
| the canonical columns with a different value (`status:'draft'`) | `ARTIFACT_CHANGED` | the row moved under the caller — the signer's to retry, 409 |

Before, all seven collapsed into one code, and the one they collapsed into was
the one that tells a signer "The document changed while it was being signed" —
the false message `5abe8101` existed to remove.

## Proof

| | Before | After |
|---|---|---|
| `artifact-signed-target-binding` | 5 failed / 106 passed | **111 passed** |
| The signed-act family (5 suites) | — | **245 passed** |

**Shown still to bite.** With `validatedStatusChanges` reverted to throwing
`ArtifactActConflictError` for a wrong column set — the pre-`5abe8101`
behaviour — the suite fails exactly those **5 cases, each named**:

    approved: supplied status update cannot inject content: refusal code
    approved: supplied status update cannot change tenant: refusal code
    locked:   supplied status update cannot inject content: refusal code
    locked:   supplied status update cannot change tenant: refusal code
    approved: null update payload refuses: refusal code

The diagnostic was reverted from a scratch copy and `git diff --stat` confirmed
`artifact-signed-act.ts` clean.

## What this changes about how this lane verifies

Grepping for the module under test is not sufficient coverage discovery: a
harness-driven, data-table suite reaches the code without naming it. Before
changing an error code or a thrown type again, this lane should search for the
*behaviour* — the code string itself (`ARTIFACT_CHANGED`) across all test and
fixture files, `.cjs` and `.json` included — not only for the module's name.
That search is what found this, after the fact, in a full-suite run.
