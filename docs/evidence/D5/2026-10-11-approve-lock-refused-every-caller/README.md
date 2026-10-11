# Approving and locking were refused for every caller: the act and its route disagreed on one column

**Row:** D5 (Part 11: the governed approval path works, and never tells a user
something untrue). **Session:** `…01P6GWSv`. **Date:** 2026-10-11. **Found by**
triaging trunk CI run 13267 (head `275707c7`, 2026-10-10), where 8 of the Test
job's 25 failures were in this lane's files.

## What was wrong

Two defects, one cause.

**1. Every approve and every lock was refused.** `commitSignedArtifactAct`
(`server/services/artifact-signed-act.ts`) gained a hardening pass in
`c91dba52` ("commit-time signature hardening"): `validatedStatusChanges` now
admits *only* the canonical approval/lock columns, comparing the caller's
`updateData` against `artifactStatusUpdate()` key for key. The status route
(`server/routes/c2c/artifacts.ts`) builds `updateData` from that same helper —
and then adds one more key, `metadata`, the governance harness block it
republishes for the new lifecycle state. One extra key failed the key-set
check, so:

- `review → approved` and `approved → locked` threw `ArtifactActConflictError`
  **before any lock was taken**;
- the route answered **409 ARTIFACT_CHANGED** to every caller;
- the whole signed approval path — the one this lane built on 2026-09-28 — was
  dead on trunk from `c91dba52` until now.

Its own tests caught it: 6 cases of
`artifact-approval-ceremony.pglite.integration.test.ts` and 2 of
`artifact-status-lock-covers-approval.test.ts` were red on trunk. They were
pushed red.

**2. The refusal told the user something false.** The message was *"The
document changed while it was being signed. Reload it and sign again."* The
document had not changed. Two of our own modules disagreed about a column, and
the sentence sent to the signer asserted a fact about their document that was
untrue. Reloading could never help. That is the "fail closed, never fabricate"
rule broken at the point where it matters most — a §11 signing refusal.

## The change

- **The harness metadata is its own input.** `SignedArtifactActInput.metadata`
  is a named, documented field; the act merges exactly that one key into the
  write. `updateData` stays canonical, so the hardening's invariant holds: no
  other column can ride in. The route passes `statusMetadata` there and no
  longer mutates `updateData`.
- **A wrong column set is no longer a conflict.** New
  `ArtifactActContractError` (`ARTIFACT_ACT_CONTRACT`) is thrown when the
  supplied columns are not the canonical set, naming which are extra and which
  are missing. `ArtifactActConflictError` is kept for what it means: the same
  columns with different values, i.e. the row moved under the caller, which is
  the signer's to retry.
- **The route answers 500 for its own defect**, logs the detail (it stays out
  of the response — this router forwards results to a tenant client,
  `ci:server-error-leaks`), and says: *"This document could not be signed
  because of a problem on our side. Nothing was signed, and the problem has
  been logged."*

## Proof

| Case | Trunk (`275707c7`) | Change |
|---|---|---|
| Approve, re-authenticated | 409 ARTIFACT_CHANGED | 200, signed |
| Approve with a verified TOTP | 409 | 200, `password+totp` |
| Approve with no stored version row | 409 | 200, the version recorded and signed |
| Lock, re-authenticated | 409 | 200, locked with its snapshot |
| A signature or provenance write that fails | 409 (never reached the rollback case) | 500, all rolled back |
| `…lock-covers-approval`: the locked and approved writes | `expected undefined to be defined` | both recorded |
| An extra column on `updateData` | 409, "the document changed" | `ArtifactActContractError`, nothing written |
| A canonical column missing | 409, "the document changed" | `ArtifactActContractError`, nothing written |

- `red.txt`: the 8 failures as trunk produces them, before the change.
- `green.txt`: 18/18 in the ceremony suite, 30/30 with the lock suite, and
  297/297 across the 16 suites that touch the signed act, the approval act or
  the status route.
- The two new contract cases were shown failing by making
  `validatedStatusChanges` throw the old conflict error: both then report *"a
  wrong column set was reported as a conflict"*.
- The positive metadata case drives the real route, so it pins that the harness
  block is still republished on a signed status change — the behaviour that
  would have been lost by simply dropping `metadata` from the write.

Gates: `ci:sign-ceremony`, `ci:server-error-leaks`, `ci:discarded-audit-write`,
`check:security-patterns`, `ci:error-envelope`, `ci:step-presentation`,
`ci:tenant-isolation:no-regression` and the requestDb audit all pass. Scoped
typecheck clean; no changed file gained an ESLint warning.

## Note for the lane that wrote the hardening

The hardening itself is right, and it is kept: an act that writes arbitrary
columns is not a signed act. What made it fail closed against its own caller
was that the canonical set was defined in one module and assembled in another,
with no test driving the route through it — the route-level suites that *did*
catch it were left red. `metadata` is now part of the act's declared contract,
so the next column to be added has one obvious place to be declared.
