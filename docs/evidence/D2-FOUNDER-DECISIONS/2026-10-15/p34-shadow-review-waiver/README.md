# P-34: the signed Shadow Review waiver (server half)

**Decision:** `docs/LAUNCH_DEFINITION_OF_DONE.md` § P-34, decided 2026-10-15. Shadow Review stays a dispatch gate. A signed human waiver is allowed when an AI provider outage stops the review.
**Row:** D2. **Date:** 2026-10-15.
**Status:** server half landed, failing first. The dispatch assessor does not call it yet (see "Not done").

## What changed

| Requirement in P-34 | Where it is enforced |
|---|---|
| A failed run records why it failed, from a closed set | `shared/constants/shadow-review-failure.ts` holds the vocabulary and imports nothing, so it is browser-safe. `server/services/shadow-review/shadow-review-failure.ts` holds the gateway classification. The code is stored in `shadow_review_runs.failure_code` (`migrations/20261015_shadow_review_waiver.sql`). |
| Only an outage is waivable: every provider failed (`provider_unavailable`) or was overloaded (`provider_overloaded`) | `WAIVABLE_SHADOW_REVIEW_FAILURE_CODES`. Not waivable: `rate_limited`, `invalid_ai_response`, `model_not_qualified`, `placement_refused`, `policy_blocked`, `token_limit`, `no_provider_configured`, `internal`. A run that failed before this change has a NULL code and is never waivable. If any rung of an "all providers failed" ladder was declined by a safety classifier, the run is `policy_blocked`, not an outage. |
| The failed run is in the audit chain | `runShadowReview` writes `AI_GENERATE_FAILED` on `shadow_review_run`, with details `{ failureCode, waivable, sequenceId, lens, promptVersion }`. |
| Offered only when there is no completed review, the newest run failed for an outage within 24 hours, and the sequence is draft/assembling/validated | `shadowReviewWaivable` in `server/services/ectd/shadow-review-waiver.ts`. The precheck and the act both ask it, and the act asks again under the sequence row lock. |
| A Part 11 signature on `ectd-sequence:<id>`: intent `shadow-waiver`, meaning responsibility or approval, by someone who did not author the sequence | The existing Gate 1 (`governedSignatureVerdict`) checks the intent, the actor, that the signature is unspent and not void, and the leaf-manifest digest. It also checks the meaning (`shadowWaiverMeaningRefusal`). Separation of duties is checked again when the waiver is consumed (`assertSignerIsNotAuthor`). |
| Used once | The `SHADOW_REVIEW_WAIVED` audit row spends the signature (`signatureSpentBy`). Two partial unique indexes back this up: one waiver per signature, and one waiver per failed run. |
| Lapses when the leaves change; a revoked or lapsed waiver blocks with its own sentence | `resolveShadowReviewWaiver` returns one of `active`, `lapsed`, `revoked`, `undetermined` or `none`. `evaluateShadowPresenceWithWaiver` turns that into the gate result. |
| Never waives an unacknowledged critical finding | The waiver touches the presence gate only. Critical findings are counted by the structural gate. This is pinned by a test. |
| The waiver is in the audit chain | The `waived` row and its chained `SHADOW_REVIEW_WAIVED` row are written in one transaction (`applySequenceChangeWithAudit`). |
| A refused waive voids its signature (P-23) | `voidingSignatureOnRefusal` with intent `shadow-waiver`. It writes `GOVERNED_SIGNATURE_VOIDED` with `step: 'shadow-waiver'`. |
| A waiver is not a release and cannot freeze or dispatch, and a freeze or dispatch signature cannot waive | The intent must match. `STEP_AUDIT_ACTION` and the release intent are unchanged. |
| No AnA tool can waive | `server/services/ana/__tests__/ana-cannot-waive-shadow-review.test.ts` checks the tool registry and scans the AnA and MCP source. |

## API contract

**`POST /api/submissions/sequences/:seqId/shadow-review/waive`** (`requireRole('regulatory-author')`)
- Request: `{ signatureActionId: string (1–128), failedRunId: positive integer }`. The reason is the signature's own reason.
- To sign first: `POST /api/c2c/actions/sign` with target `ectd-sequence:<seqId>`, payload `{ intent: 'shadow-waiver', meaning: 'responsibility' | 'approval' }`, the reason (at least 8 characters) and re-authentication.
- 200: `{ sequenceId, failedRunId, failureCode, signatureActionId, signatureId, waiver: ShadowReviewWaiverStatus }`. `waiver.state` is `'active'` once the record is written. Any other state means the record was written but could not be confirmed.
- 400 `VALIDATION` (malformed body). 400 `BAD_REQUEST` (sequence id). 401 `AUTH_REQUIRED`. 404 `NOT_FOUND`.
- 403 `GOVERNED_REQUIRED`: the signature is missing, has the wrong intent or meaning, is spent, void or revoked, belongs to another actor, or no longer binds the leaves.
- 403 `FORBIDDEN`: the signer is the sequence's creator (separation of duties).
- 409 `SHADOW_WAIVER_NOT_ELIGIBLE`: no waiver is on offer. The reason is in `error.message`.
- 409 `INVALID_STATE`: the leaves changed during the waive, or the author is unresolved.
- Every refusal except a malformed request voids the caller's own unspent `shadow-waiver` signature.

**`POST /api/submissions/sequences/:seqId/governed-precheck`** with `{ step: 'shadow-waiver' }`
- 200: `{ step: 'shadow-waiver', cleared, refusal, shadowWaiver: { eligible, failedRunId?, failureCode?, reason } }`.

**`GET /api/submissions/sequences/:seqId/shadow-review`**
- Returns every run, including rows with status `'waived'`.
- Each row carries `failureCode`, `waiverSignatureActionId`, `waivedFailedRunId`, `createdAt` and `updatedAt`.
- The eligibility window is measured from the failure time, `updated_at`.

**Resolvers and gate helper** (`server/services/ectd/shadow-review-waiver.ts`)
- `shadowReviewWaivable(q, { sequenceId, organizationId, now? }) → { eligible, failedRunId?, failureCode?, reason }`
- `resolveShadowReviewWaiver(q, { sequenceId, organizationId }) → { state: 'none'|'active'|'lapsed'|'revoked'|'undetermined', waiverRunId?, signatureActionId?, signatureId?, signerName?, signedAt?, failedRunId?, failureCode?, detail? }`. A failed lookup returns `undetermined`, never `active`.
- `evaluateShadowPresenceWithWaiver(shadowReviewRunCount, waiver) → { cleared, blockers, notAssessed? }`. A count above 0 clears the gate. An `active` waiver clears it with `notAssessed`: "Shadow Review waived under signature … by … because the AI provider was unavailable (run #…); this dossier was not adversarially reviewed." The text says "overloaded" when the failure code is `provider_overloaded`. Every other state blocks with its own sentence, and `none` gives `NO_SHADOW_REVIEW_BLOCKER` (the current presence-gate sentence, word for word).

**Runs that fail.** `runShadowReview` throws a `ShadowReviewError` whose code is the gateway's classification. The HTTP status comes from `GATEWAY_ERROR_HTTP_STATUS`:

| Code | Status |
|---|---|
| `PROVIDER_UNAVAILABLE` | 503 |
| `OVERLOADED` | 503 |
| `RATE_LIMITED` | 429 |
| `TOKEN_LIMIT_EXCEEDED` | 413 |
| `PLACEMENT_REFUSED` | 403 |
| `MODEL_NOT_QUALIFIED` | 403 |
| `INVALID_AI_RESPONSE` | 502 |

A fault on our side is `INTERNAL` and answers 500 "Request failed.". Before this change it was answered as `PROVIDER_UNAVAILABLE`. The prompt is now read inside the try, so a prompt-read failure no longer leaves a run stuck in `running`.

## Red, then green

- `red/01-failure-classification.txt`: 12 of 12 failed against HEAD's `runShadowReview`.
  - No failure code was recorded and no audit row was written.
  - Placement, governance and rate-limit refusals were answered `PROVIDER_UNAVAILABLE`.
  - A prompt-read fault was thrown raw and left the run `running`.
- `red/02-waiver-route-ana.txt`: the waiver suite failed to load because there was no waiver module. The waive route returned 404 and the precheck refused `shadow-waiver` with 400. The AnA guard passed in red because no door existed yet; M6 below shows it failing.
- `green/01-failure-classification.txt`: 13/13 pass.
- `green/02-waiver-route-ana.txt`: 31/31 pass (24 waiver, 5 route, 2 AnA).
- `green/03-mutations.txt`: seven gates, each mutated and shown failing its test, then restored:
  - M1: spending
  - M2: the waivable set
  - M3: lapse
  - M4: separation of duties when consumed
  - M5: meaning
  - M6: AnA reach
  - M7: void on refusal
- `green/04-regression.txt`: 1545 passed and 8 failed. None of the 8 is from this change:
  - 4 are exact-match context assertions that predate HEAD's `ctxOf` adding `ipAddress`.
  - 4 are a concurrent P-33 assessor edit (`MISSING_REQUIRED_SECTION` 1.2).
- `green/05-migration-gates.txt`: drop-safety (and its selftest), set-order, model–migration agreement, reachability, deploy-path, guard-order and prefix-collisions all pass. The migration was also applied twice in PGlite.

ESLint shows no per-file increase over HEAD, and the new files are clean. The touched files typecheck clean. Full `tsc` runs out of memory on a 15 GB host, so the check used scratch configs rooted at the touched files; the errors it reported are pre-existing ones in unrelated middleware.

## Not done, or owed

1. **The assessor change.** `assess-dispatch-readiness.ts` belongs to the later step. It should:
   - call `resolveShadowReviewWaiver` and `evaluateShadowPresenceWithWaiver` in place of `evaluateShadowPresenceGate`, and delete that function;
   - pass `notAssessed.shadowPresence` into `dispatchGateViews`;
   - expose the waiver on the assessment, so the `SEQUENCE_FROZEN` and `SEQUENCE_DISPATCHED` audit details can name it. P-34 requires "the freeze and dispatch that rely on it" to be in the audit chain.
2. **Revocation hazard (not changed).** `persistGovernedSignatureRevocation` (`signature-persistence.ts` around lines 922–931) revokes the newest live signature on the target, whatever its intent. A revoke aimed at a dispatch signature can therefore revoke a waiver, and the reverse. This needs a target-and-intent-safe revocation.
3. `SHADOW_REVIEW_WAIVER_WINDOW_HOURS` can only shorten the 24-hour window. It still needs a line in `.env.example`.
4. A frozen sequence whose waiver is revoked cannot be waived again (waivers are recorded before the freeze). Only a completed run clears it.

## Later the same day: the dispatch verdict reads the waiver (owed item 1, first half)

Commit `b544c9304` (with OQ-SUBC-15 in `7dbb2c44d`).

- `assess-dispatch-readiness.ts` computes its presence gate as `evaluateShadowPresenceWithWaiver(count, resolveShadowReviewWaiver(...))`. `evaluateShadowPresenceGate` is deleted. Its sentence lives once, as `NO_SHADOW_REVIEW_BLOCKER`.
- The `shadowPresence` gate view carries the waiver's not-assessed note.
- The assessment reports `shadowReviewWaiver` and, while no review has completed, `shadowReviewWaivable`. The client already read both, so the screen now shows them.
- The MCP readiness tool and the Dispatch Readiness AnA context carry every cleared-but-not-assessed gate's note verbatim. The surface's lead stops saying "proven clear" over one.
- `green/06-assessor-wiring.txt`: 84/84 pass:
  - the waiver PGlite suite (27, three new assessor cases);
  - the gate units (44);
  - the client not-assessed suite (10);
  - the MCP note (2).
- `green/07-assessor-mutations.txt`:
  - W1 (the gate ignores the resolved waiver) fails 2 cases.
  - W2 (the gate view drops the note) fails 1.
  - The file was restored byte-identical.
- Item 3 (`.env.example`) was done in `c3ff59ae6`.
- Item 2 (revocation by intent) is a separate change.

Still owed (the second half of item 1): the waiver's identity in the `SEQUENCE_FROZEN` and `SEQUENCE_DISPATCHED` audit details, and a re-check of the waiver under the transition lock. Both are in `submission-service.ts`.

## Later still: the step that relies on a waiver names it, and the lock asks again (owed item 1, second half)

- **The audit rows.** `SEQUENCE_FROZEN`, `SEQUENCE_DISPATCHED` and `ECTD_TRANSMITTED` carry `shadowReviewWaiver: { signatureActionId, signatureId, waiverRunId, failedRunId, failureCode }` when no review had completed and an active waiver cleared the presence gate (`waiverReliedOn`). A step on a completed review names none. P-34 asked for exactly this: "the freeze and dispatch that rely on it are in the audit chain".
- **The lock.** The assessment runs unlocked, seconds before the commit. Under the transition lock, on the transaction's client, `shadowReviewRefusalUnderLock` asks again about what the verdict relied on:
  - a waiver it relied on must still be active;
  - no critical may block that it counted as closed (P-35: a closure stands only while its signature is in force).
  A revocation in that window refuses the step 409 `DISPATCH_BLOCKED`, and the step's signature is voided (P-23).
- `green/08-reliance.txt`: `freeze-relies-on-waiver.pglite.test.ts` 4/4, over the real transition, assembly, lock, waiver resolution and critical count. The regression run passes 70 files, 922 tests.
- `green/09-reliance-mutations.txt`: each guard is removed alone, the suite fails its case, and the file is restored byte-identical.
  - W1: the row names no waiver.
  - W2: no re-check under the lock.
  - W3: the re-check skips the criticals.
  - W4: the re-check skips the waiver.
- Shared: `completedShadowReviewRuns` (text SQL, one definition) serves the offer and the lock. The freeze-gate and refused-step suites build the Shadow Review tables (`shadowReview: true`), as the lock now reads them.
