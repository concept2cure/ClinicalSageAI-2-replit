# P-35: a critical Shadow Review finding is closed by a named person's signature

**Decision:** `docs/LAUNCH_DEFINITION_OF_DONE.md` § P-35, decided 2026-10-15. The dispatch gate blocks on every open critical Shadow Review finding across every run of the sequence. Before this change nothing in the product could close one.
**Rows:** D2 (and D5). **Date:** 2026-10-15.
**Status:** landed, failing first. The server act, its door, its precheck, its record and the Shadow review tab are all in place. See "Not done" for what the readiness view and revocation still owe.

## What changed

| Requirement in P-35 | Where it is enforced |
|---|---|
| Each open critical is closed on its own by a Part 11 signature on `ectd-sequence:<id>`, intent `shadow-finding-disposition`, with the finding named in the payload | `submission-service` `dispositionShadowFinding`. Gate 1 (`governedSignatureVerdict`) now takes the payload check from `shadowFindingDispositionPayloadRefusal`. A signature for finding A cannot close finding B, and cannot close A in a different way. |
| Meaning approval or responsibility | `INTENT_MEANING_REFUSAL` in Gate 1 now holds the waiver's and the disposition's meaning rules side by side (`shadowFindingDispositionMeaningRefusal`). A `review` or `release` meaning is refused. |
| By a person with signing authority who did not author the sequence | The sign route checks signing authority and separation of duties. The act checks separation of duties again (`independentSignerRefusal`, renamed from the waiver's `waiverSignerRefusal` and shared by both acts). |
| `accepted`: the finding stands and the signer accepts going forward with it | `shadowFindingDisposable` offers it on every open critical of a non-deleted run of this sequence and organization. |
| `fixed`: offered only when a completed Shadow Review ran after the finding's run. That review need not be clean. | `LATER_COMPLETED_RUN` in `server/services/ectd/shadow-finding-disposition.ts`. It counts only a `complete`, non-deleted run of the same sequence created after the finding's run (ordered by time, then id). Failed, running and earlier runs do not count. A later run's own findings do not matter. |
| The signer's reason | The signature's own reason (`electronic_signatures.signature_purpose`, falling back to the manifest's `reason`) is copied to `shadow_review_findings.disposition_reason`. If no reason can be read, nothing is recorded. |
| A later review never closes an earlier critical by itself | No code changes a finding's status except this act. The pglite suite pins that a later clean, completed run leaves the earlier critical open and the dispatch blocked. |
| In the audit chain and on the finding | Everything is written in one transaction under the sequence row lock (`recheckUnderSequenceLock`, now shared with the waiver). That transaction does three things: it re-checks eligibility and the leaf manifest; it runs a compare-and-set UPDATE (only an open critical of this sequence changes) that sets `status`, `disposition_signature_action_id`, `disposed_by`, `disposed_at` and `disposition_reason`; and it writes a chained `SHADOW_FINDING_DISPOSITIONED` row (resource `ectd_sequence`, details `{findingId, runId, disposition, signatureActionId, signatureId}`). |
| Signature used once | The `SHADOW_FINDING_DISPOSITIONED` row is in `signatureSpentBy`'s spent list. A partial unique index `(organization_id, disposition_signature_action_id)` backs it up. |
| A refused act voids its signature (P-23) | `voidingSignatureOnRefusal` with intent `shadow-finding-disposition`, which writes `GOVERNED_SIGNATURE_VOIDED` with `step: 'shadow-finding-disposition'`. A disposition signature cannot freeze, dispatch or waive. A freeze or waiver signature cannot close a finding, and that refusal does not void it. |
| A non-critical finding is not part of this act | It is refused 409 with "…is minor, not critical…". It gets no offer on the read and no control on the screen. |
| No AnA tool can close a finding | `server/services/ana/__tests__/ana-cannot-disposition-shadow-finding.test.ts` checks the tool registry and scans the AnA and MCP source. |
| The readiness view names who closed each critical and how | **Partly.** The Shadow review tab names who, how, when, why and under which signature. The Dispatch tab does not yet (see "Not done" 2). |

The schema change is `migrations/20261015b_shadow_finding_disposition.sql`. It is additive and `IF NOT EXISTS` throughout, the FK to `users(id)` is guarded on `pg_constraint`, and it drops nothing. It sits in `C2C_MIGRATION_FILES` after the 20261015 waiver entry and before the final tenant-sweep pair. It is mirrored in `shared/schema/shadow-review.ts`. Because Drizzle names every model column in an INSERT, `shadow-review-output-validation.pglite.test.ts` now applies the file over its hand-built table, the same way P-34 did for its own columns.

## API contract

**`POST /api/submissions/sequences/:seqId/shadow-review/findings/:findingId/disposition`** (`requireRole('regulatory-author')`)
- Request: `{ signatureActionId: string (1–128), disposition: 'accepted' | 'fixed' }`. The reason is the signature's own reason.
- To sign first: `POST /api/c2c/actions/sign` with target `ectd-sequence:<seqId>`, payload `{ intent: 'shadow-finding-disposition', meaning: 'approval' | 'responsibility', findingId: <number>, disposition: 'accepted' | 'fixed' }`, the reason (at least 8 characters) and re-authentication.
- 200: `{ sequenceId, findingId, runId, disposition, signatureActionId, signatureId, dispositionRecord }`.
  - `dispositionRecord` is the finding's disposition as it reads back: `{ disposition, disposedBy, disposedByName, disposedAt, reason, signatureActionId, signatureId, meaning, signatureState: 'in-force'|'revoked'|'not-found' }`.
  - It is `null` only if the read-back failed after the commit.
- 400 `VALIDATION` (body). 400 `BAD_REQUEST` (sequence or finding id). 401 `AUTH_REQUIRED`. 404 `NOT_FOUND` (sequence).
- 403 `GOVERNED_REQUIRED`: the signature is missing, has the wrong intent or meaning, is spent, void or revoked, belongs to another actor, no longer binds the leaves, names another finding or disposition (or none), or records no reason.
- 403 `FORBIDDEN`: the signer authored the sequence.
- 409 `SHADOW_FINDING_NOT_DISPOSABLE`: the finding is not an open critical of a run of this sequence, or `fixed` was asked with no completed review after the finding's run. The reason is in `error.message`.
- 409 `INVALID_STATE`: the leaves changed during the act, the finding moved under the lock, or the author is unresolved.
- Every refusal except a malformed request voids the caller's own unspent signature with this intent.

**`POST /api/submissions/sequences/:seqId/governed-precheck`** with `{ step: 'shadow-finding-disposition', findingId, disposition }`
- If either `findingId` or `disposition` is missing, the answer is 400.
- 200: `{ step, cleared, refusal, shadowFindingDisposition: { findingId, runId?, offered: ('accepted'|'fixed')[], laterCompletedRunId, reason } }`.

**`GET /api/submissions/shadow-review/:runId/findings`**
- Each row now also carries:
  - `disposition`: the view above, or `null` while the finding is open;
  - `dispositionsOffered`: what the act would accept now, by the act's own rule;
  - `laterCompletedRunId`.
- The read runs on the request's own connection (`requestPgClient`). A failed read is an error, never a finding shown as open.

## Client

`client/src/concept2cure/v2/surfaces/ShadowFindingDisposition.tsx` now renders the Shadow review tab's findings list (moved out of `ShadowReviewWorkspace`, with the row markup unchanged).

What it offers:
- **Accept risk** and, when the server offers it, **Mark fixed** (each a Part 11 e-signature). These appear only on an open critical the server offers them on, and only to a signer who is not the author or unresolved. The signer state is read from dispatch-readiness, the same answer the Dispatch tab uses.
- When **Mark fixed** is not offered, the row says when it will be.
- The sequence's author is told why nothing is offered.

How the chain runs. It is the parent's governed chain, as for the waiver:
1. precheck;
2. `EsignModal` (approval or responsibility). The target line says "closes critical finding #N "<title>" as risk accepted / as fixed: state in the reason what changed";
3. sign with intent `shadow-finding-disposition` and `{findingId, disposition}`;
4. POST;
5. read the findings again.

What a closed critical shows: "Risk accepted by <name> on <time> under signature <id> (<meaning>). Reason: <reason>." A fixed one reads "Marked fixed by …", and a revoked signature is stated. Nothing says the AI resolved it.

How failure shows: a refusal shows the server's words ("Finding #N was not closed — …"). An unconfirmed outcome says it could not be confirmed. Neither shows success.

## Red, then green

- `red/01-server.txt`: the pglite suite failed to load (no module). Six route cases failed: the door returned 404, the precheck refused the step with 400, and the findings read carried no disposition. The AnA guard passed in red because no door existed yet; M6 shows it failing.
- `red/02-client.txt`: 9 of 10 failed (no controls). The "older server" case passes in red by design; C4 shows it failing.
- `green/01-new-suites.txt`: 22/22 pass (13 pglite, 7 route, 2 AnA).
- `green/02-regression.txt`: the full set ran 1579 passed and 4 failed.
  - All 4 were pre-existing `ipAddress` ctx assertions.
  - The two in `submissions-leaf-remove-and-precheck.test.ts` were then fixed here at the coordinator's request. `ipAddress` is now asserted, and the precheck options are compared key for key with `toStrictEqual`, including `findingId` and `disposition`. A new case pins the disposition passthrough.
  - The two in `submissions-program-anchor.test.ts` remain. That file is not part of P-35 and was not touched.
- `green/03-mutations.txt`: nine server gates, each mutated, shown failing its case, then restored:
  - M1: spending
  - M2: payload binding
  - M3: `fixed` eligibility
  - M4: separation of duties
  - M5: meaning
  - M6: AnA reach
  - M7: void on refusal
  - M8: severity
  - M9: precheck passthrough
- `green/04-migration-gates.txt`: these all pass:
  - `ci:migration-drop-safety` and its selftest
  - `ci:migration-set-order`
  - `ci:model-migration-agreement`
  - `ci:migration-reachability`
  - `ci:migration-deploy-path`
  - `ci:migration-guard-order`
  - `ci:migration-prefix-collisions`
  - `ci:column-reachability`
  - `ci:insert-columns-declared`
  - `ci:sql-interpolation`
  - `ci:launch-scope-api`
  - `ci:route-ownership-matrix:check`
  - `ci:server-error-leaks`
  - `ci:drizzle-tenant-scope`
  - `ci:tenant-column-types`

  The migration is also applied twice in PGlite.
- `client-green/shadowFindingDisposition.green.txt`: 10/10, three runs in a row.
- `client-green/surface-suite.green.txt`: all 33 client test files that import `SubmissionSeqWorkspaces`, `SubmissionCenter` or the new module pass, 290/290.
- `client-green/guard-mutations.txt`: seven client guards, each mutated, shown failing, then restored:
  - C1: open criticals only
  - C2: Mark fixed only when offered
  - C3: sign payload
  - C4: older server
  - C5: author
  - C6: unconfirmed
  - C7: POST body
- `client-green/lint-and-gates.txt`:
  - ESLint shows no per-file increase over HEAD on any touched file, and every new file is clean.
  - The client gates pass, including `ci:undefined-css-classes`, `ci:check-client-api-calls` and `ci:sign-ceremony`.
  - `ci:check-test-imports` fails on a pre-existing import in `submission-leaf-source-evidence.pglite.test.ts`, which is not a P-35 file.
  - The scoped typecheck reports no error in a touched file.

## Not done, or owed

1. **A revoked disposition signature does not reopen the finding for the gate.** The findings read reports `signatureState: 'revoked'`, and the screen says "The signature it was closed under has since been revoked". But `countOpenShadowCriticals` counts `status = 'open'`, so the gate still treats the finding as closed. Fixing this means changing the assessor's count to also count an `accepted`/`fixed` critical whose `disposition_signature_action_id` resolves to a withdrawn signature (`isSignatureWithdrawn`). The assessor is the coordinator's file, so it was not edited here. The P-34 revocation hazard (revoking the newest live signature on the target whatever its intent) applies to this signature too.
2. **The Dispatch tab does not list dispositioned criticals.** P-35 asks that "the readiness view names who closed each critical and how". The Shadow review tab does this per finding, but the dispatch-readiness answer does not carry dispositioned criticals. The assessor could expose them (for example with `withShadowFindingDispositions` over the sequence's runs), and `DispatchWorkspace` would render the same `FindingDispositionNote`.
3. A disposition does not lapse when the leaves change later. P-35 does not ask for this. The signature binds the leaf manifest when it is checked at the act and again under the lock.
4. The `SC_FIND_STATUS` chip still reads "Accepted" rather than "Risk accepted"; the note beside it says "Risk accepted by …". The finding status `waived` still has no writer and is not used by this act.

## On integration, same day: a closure stands only while its signature is in force

Open item 1 above (a revoked disposition signature did not reopen the finding for the gate) was a hole, and a second one was behind it. The finding could not be closed again either: only `status = 'open'` was disposable. So a revoked closure would have blocked dispatch forever, with nothing able to clear it. One rule now applies everywhere (`closureStands` in `shadow-finding-disposition.ts`): a closed critical counts as closed only while its status is a disposition and the signature that closed it is in force.

- **The gate.** `criticalsStandingOpen` is the assessor's count. The assessor's own drizzle count is deleted. It counts every open critical and every closed one whose closure no longer stands. The structural gate names each reopened critical by finding and signature (`reopenedCriticalSentence`), in `gate`, `freezeGate` and `dispatchGateOnSigning`.
- **The offer and the act.** Such a critical is offered again, and the reason says why. The act's UPDATE compare-and-sets on the status and closing signature it judged. A finding re-closed since it was judged is zero rows. The earlier closure stays on the audit chain.
- **The read and the screen.** Each row carries `standsOpen`. The Shadow review tab offers on it, shows the chip as Open, and the note says "so it blocks dispatch again".
- **Harnesses.** Seven test harnesses each hand-wrote the Shadow Review tables, and none had the 2026-10-15 columns. They now use one `SHADOW_REVIEW_PGLITE_DDL` (`createIndPgliteDb({ shadowReview: true })`). `server/db/__tests__/shadow-review-pglite-ddl.contract.test.ts` holds it to the deploy path's migrations column for column; mutation H1 shows it failing. The waiver suite, the NDA journey and the lineage walk apply `20261015b`.
- `reopen/green.txt`:
  - the P-35 suite, 16/16, three new cases;
  - the client suite, 11/11, one new case;
  - the DDL contract, 2/2;
  - regression: 68 files, 909 tests.
- `reopen/mutations.txt`: R1, R2, R3b, R4, C1, C2 and H1 each fail their case, and every file was restored byte-identical. R3 is kept with a note: its failures are an unbound-parameter SQL error, and R3b is the real test of the compare-and-set.
