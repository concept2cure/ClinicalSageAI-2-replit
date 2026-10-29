# RR2: reviewers one after another, more than one approver, and adding a reviewer, on Vault and QMS routes (D2, 2026-10-29)

Slice RR2 of `docs/design/REVIEW_ROUTING_2026-10-23.md` (§2.6, §2.8, §2.10, §2.12, §3, §4 NEW-4, §8). It builds on:
- RR1a (`../2026-10-29-RR1a/`): routes, members, signatures;
- RR1b (`../2026-10-29-RR1b/`): the route form and round;
- RR3 (`../2026-10-29-RR3/`): reassign and hand back;
- RR4 (`../2026-10-29-RR4/`): the QMS route and QMS approvers.

Launch row **D2**, Veeva gap 4.

What a route can now do, on a Vault version and on a QMS controlled document:
- **Reviewers one after another.** Each reviewer is a step. A step opens, and only then is its person told, when every member of the steps before it has a verified signature. Each step has its own due date. A waiting step is blocked, so the due sweep and the tray's triage leave it out, and its signature is refused before the credential.
- **More than one approver.** Every named approver signs (NEW-4: no N-of-M), and they are parallel among themselves (§3).
  - Vault: the routed `/sign`. QMS: `POST /approve`.
  - Under the subject's row lock, only the last required signature moves the stage. An earlier approver reads "Approved (k of n required)".
  - `/advance→approved` is still refused (`ROUTE_APPROVAL_BY_SIGN`) while approvers are outstanding.
  - The design specifies no sequential approval order (§3: "Approvers are always the step after the last reviewer, and are parallel among themselves"), so none was built.
- **Adding a reviewer to an open route** (§2.10; RR3 left it open).
  - It is a governed act with a reason, by the sender or an administrator, through the one validator.
  - The approvers wait again and are told.
  - It is refused once any approval is signed (`ROUTE_APPROVAL_STARTED`).

| Commit | What |
|---|---|
| `8e8bab76c` | Cleanup (b): the member validator asks `checkSigningAuthority`, the one signing policy. `one-signing-authority-policy.test.ts`, red at the base, is green. The test was not weakened. |
| `488b15e1e` | Cleanup (a): the round's rendering pieces that `QmsReviewRoute.tsx` imported from `v2/surfaces/Vault*` move, unchanged, into the neutral module `client/src/concept2cure/v2/reviewRoute/`. Nothing still reached was deleted. |
| `24f28558f` | Server: sequential steps and step due dates, `openReadySteps`, several approvers (Vault and QMS), `addRouteReviewer` and `…/review-route/members` (Vault and QMS), `?for=add`. The read-only rules moved to `review-route-rules.ts`. The client history says "added". |
| `99675ac29` | Client: the route form (order, Earlier and Later buttons, step dates, several approvers), the round text, the approval share in both signing dialogs, and Add a reviewer (Vault round and QMS sheet). |
| this commit | Evidence. |

## What already exists

Everything below was found first, then extended, reached or converged. Nothing was rebuilt beside it.

Searches run:
- `sequential`, `review_order`, `reviewer_step_due_at`, `reviewStepDueDates`, `stepOf`, `stepOpen`, `openApproverStep`, `ROUTE_SHAPE_NOT_AVAILABLE`, `approvalComplete`, `of 1 required`, `add a reviewer`, `addReviewer`, `review-route/members`, `ROUTE_APPROVAL_STARTED`, `re-block`, `reorder`, `moveUp`, `Earlier`, `drag` over `server/`, `shared/`, `client/src`, `migrations/` and `tests/`;
- `git log --all --diff-filter=D` on `*Reorder*`, `*StepOrder*`, `*AddReviewer*`, `*ReviewerOrder*`, `*Sequential*` and `*MultiApprov*`. Nothing was deleted under these names.

| Existing piece | Path | What it did before RR2 | What RR2 did |
|---|---|---|---|
| Route header columns | `migrations/20261023_review_routes.sql`: `review_order`, `reviewer_step_due_at timestamptz[]` | Created by RR1a and never written | **Reached.** The send writes the order and the step instants. **No migration** in RR2. |
| `routeStanding` | `server/services/review/review-route-standing.ts` | Steps, `stepOpen`, `reviewComplete`, `approvalComplete` for any shape, from verified signatures | Unchanged in what it decides. The history reads `review-route.add`. |
| The send's shape gate | `parseRouteRequest`, `routeOrder` in `review-route.ts` | Refused sequential and several approvers (`ROUTE_SHAPE_NOT_AVAILABLE`) | **Opened.** Sequential takes `reviewStepDueDates` (one per reviewer, running forward); approvers 1..n. Moved with the other read-only rules to `review-route-rules.ts`, which `review-route.ts` re-exports. |
| Step and due placement | `stepOf`, `writeMemberRow`, `dueInstants` | Reviewers step 1, approver step 2, one review date | Sequential steps 1..n, approvers n+1. Each member's task carries its own step's due instant (the end of that day in the sender's time zone, §2.11). |
| Opening the next step | `openApproverStep` (`review-route.ts`) | Opened the approvers when the review completed | **Generalised in place** as `openReadySteps`. After every review signature (Vault and QMS) it opens whoever's turn has come and tells only them ("It is your turn: review …"). No copy. |
| Vault routed sign | `routedSignOff` (`server/routes/document-lifecycle-review-route.ts`) | Wrote `review_signature` on completion; advanced on `approvalComplete` | The approval part was already general. `afterReview` calls `openReadySteps`, and an added reviewer's signature does not rewrite `review_signature` (decision 1). |
| `reviewSignatureRefusal` | `server/services/regulatory/canonicalDocumentStore.ts` | Refused any review once the round's sign-off existed | `{ routed: true }`: on a live route, the route refuses a second signature by the same person (§2.8, "admits one review signature per named reviewer"). |
| QMS approval | `approveQmsDocumentSigned` (`server/services/qms/document-approval-signature.ts`), route hooks in `qms-review-route.ts` | One approver: the signature made the document effective, and `after` required `approvalComplete` | The route says whether this signature `completes`. An earlier approval writes the one signature and its `approve` ledger row (`toStatus: in_review`, `approvalsRecorded/approvalsRequired`), with no status change, stamp or sealed copy. The last one makes it effective on its own transaction. |
| The member validator | `validateRouteMember` (`review-route-member.ts`) | Asked `isSigningAuthorized` itself (the policy test's red) | Asks `checkSigningAuthority` on its transaction (`activeSigner`). Called unchanged for an added reviewer, as at a reassignment. |
| The picker's read | `readRouteCandidates` and the QMS `readCandidates` | `?for=reassign` asks as a reassignment | `?for=add` asks the same way. |
| The route's acts | `onRecord` (Vault), `onDocument` (QMS) | Withdraw, return, reassign, hand back | Adds `POST …/review-route/members`, on the same transaction shape and lock order. |
| Round rendering | `memberLine`, `routeHeadline`, `RouteHistory`, the candidate shape, the text helpers (in `v2/surfaces/Vault*`) | Imported by QMS from the Vault surfaces | **Moved** to `v2/reviewRoute/` (`routeRound.ts`, `RouteHistory.tsx`, `routeCandidates.ts`, `routeText.ts`). Extended there: k-of-n in signing order, "Waits for {earlier reviewer}", `approvalShare`, `mayAddReviewer`, `waitingApprovers`. |
| Form fields | `PeoplePicker`, `DueDateField`, `ReasonField` (`v2/editor/reviewFields.tsx`) | One approver, one review date | **Reused unchanged.** The approver picker is `multiple`. The order and step fields are one new shared component, `RouteOrderFields.tsx`, and the shape rule is `routeShape.ts`; both forms use them. |
| Not offered for a role | `NotOfferedForRole` in `VaultRouteReassign.tsx` | The reassign sheet's list of who is not offered, and why | **Moved** to `v2/reviewRoute/AddReviewer.tsx`; the reassign sheet and the add sheet both import it. |
| My work and the due sweep | `server/services/tasking/my-work.ts`, `server/jobs/taskDueSweep.ts` | A blocked route member: `waitingOn`, not overdue, not swept (RR1a) | **Reached unchanged.** A waiting sequential step is blocked, so it is left out of both; a DB test shows it. |

Why `v2/reviewRoute/` and not `_shared/`: `eslint.config.js` lints only `client/src/concept2cure/v2/**`, so moving code into `_shared/` would have taken it out of the lint gate.

## Red → green

| Behaviour | Test | Red (`red/`) | Green (`green/`) |
|---|---|---|---|
| The one signing-authority policy | `server/services/part11/__tests__/one-signing-authority-policy.test.ts` (unchanged) | `one-signing-authority-policy.txt`: `review-route-member.ts: 1 call(s), 0 allowed` | `one-signing-authority-policy.txt`, 5 of 5. The RR1a–RR4 DB suites after the fix: `dbtests-after-policy-fix.txt`, 79 of 79, including `MEMBER_CANNOT_SIGN`. |
| Vault, sequential: steps 1..n with their own dates (header and tasks); only step 1 open and told; a later step cannot sign, is not overdue in Tasks, and is not swept; each step opens on the previous signature and only it is told; `review_signature` only on the last; refusals (dates missing, backwards, approval before the last step, past), with nothing written | `tests/db/review-route-vault-rr2.dbtest.ts` | `vault-route-rr2.dbtest.txt`: 9 of 9 fail (`ROUTE_SHAPE_NOT_AVAILABLE`, no `/members`, no `?for=add`) | `dbtests.txt` |
| Vault, two approvers: the first leaves the version in review and the route open; "1 of 2" in the round; `/advance→approved` refused; a second signature by the first refused; the last approves and supersedes the earlier version; one digest | same | same | same |
| Vault, add a reviewer: re-blocks the approver, tells them with the reason; `review-route.add` by printed name; history; the approver is refused until the new reviewer signs; on a sequential route the new reviewer is the next step and the approvers move after it; refused (no reason, neither sender nor admin, someone named, the uploader, another organization's account and version, due after the approval, an approval started), with the rows and the ledger unchanged; `?for=add` read | same | same | same |
| QMS: sequential (the second reviewer refused before the credential, no attempt counted, told on the first's signature); two QMS approvers (the first: `in_review`, no `approver_id`, no `metadata.approval`, no periodic review task, `approve` row with 1 of 2; the last: effective, route complete, one digest); add a reviewer re-blocks the approver; refused once an approval is signed | `tests/db/review-route-qms-rr2.dbtest.ts` | `qms-route-rr2.dbtest.txt`: 4 of 4 fail | `dbtests.txt` |
| The history says "added … as a reviewer" (without it an `add` entry throws in `historyLine`) | `client/src/concept2cure/v2/__tests__/reviewRouteRound.test.ts` | `client-history-add.txt` (TypeError) | `client.txt` |
| The round text (k of n in signing order; "Waits for Rae Reviewer"; the completed headline), `approvalShare`, the form's shape rule and Earlier/Later | same | `client-rr2.txt` (`routeShape` missing) | same |
| Vault form: sequential with Earlier/Later (44 px class), step dates, two approvers, the body sent; Add a reviewer (the sheet reads `?for=add`, posts person, date and reason); not offered after an approval or to another reader; the approve dialog says "Your approval is 1 of 2 required" | `client/src/concept2cure/v2/__tests__/vaultReviewRouteRR2.test.tsx` | `client-rr2.txt`: 3 of 4 fail; the fourth pins what must not be offered, so it passes by design | same |
| QMS form: two QMS approvers and sequential, PATCH body; Add a reviewer from the route sheet; the approve dialog's "1 of 2" | `client/src/concept2cure/quality/__tests__/qmsReviewRouteRR2.test.tsx` | `client-rr2.txt`: 3 of 3 fail | same |

Regression, all green:
- `green/dbtests.txt`: **18 files, 187 passed**. RR2's two suites; RR1a's two, RR1b's, RR3's, RR4's; the route guard; every QMS DB suite in RR4's list; `admin-change-audit`, `memberships`, `vault-lifecycle`, `canonical-documents-append-only`, `task-filing-home`.
- `green/server-unit.txt`: RR4's 88 server files plus the review, route-guard, lifecycle, notification and jobs tests: **154 files, 2610 passed, 5 failed**. The 5 are RR4's pre-existing `dispatch-verdict-parity.pglite.test.ts`. The policy test that RR4 also listed as pre-existing is now green.
- `green/client.txt`: every `quality/` suite and the v2 vault, review, open-work and admin QMS approver suites: **88 files, 766 passed**. `green/client-after-move.txt` is the same set after cleanup (a) alone: 84 files, 748 passed.

The RR1a–RR4 suites were re-run after every commit. No merge was made in this slice: the branch was not pulled, and nothing was pushed.

## How the tests were run

- **Unit, PGlite and client tests:** `RLS_ENFORCE=off npx vitest run <files>`.
- **DB tests:** the RR1a README's method.
  - `scripts/db/provision-test-db.sh` built a fresh deploy-shaped database (install-fresh and deploy-migrate, pgvector, `app_service` NOSUPERUSER NOBYPASSRLS).
  - It was renamed to the recorded-disposable `platform_ci_vault_fixture_rr2`.
  - Run with `RLS_ENFORCE=on`, `TEST_DATABASE_URL` as the owner, `APP_DATABASE_URL` as `app_service` and `C2C_VAULT_LEGACY_FIXTURE_DATABASE` set, by `npx vitest run --config vitest.db.config.ts <files>`.
- One test ("the due sweep leaves it alone") backdates a waiting member's due date. It does so as the owner, with the route guard trigger disabled around that one UPDATE and re-enabled in `finally`, then runs the real `runTaskDueSweep`.

## Gates (`gates.txt`)

All exit 0 at `99675ac29`, and before each commit:
- `ci:pushed-lint-warnings` (no file gained a warning);
- `ci:pushed-lint-errors`;
- `ci:sql-interpolation`;
- `ci:undefined-css-classes`;
- `ci:untracked-imports`;
- `ci:sign-ceremony` (29 baselined sites, exactly as baselined);
- `ci:tenant-isolation:no-regression`;
- the full typecheck, `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p tsconfig.check.json`.

No baseline was raised.

Two refusals while building, each fixed rather than baselined:
- The ceremony gate refused an approval stamp moved into a helper with no signature row. It went back inline beside its signature.
- The complexity and length limits were met by splitting `review-route.ts` (the rules module) and two components.

## OQ (`oq/`)

RR2 changes no step of OQ-002 v0.15 (`docs/validation/OQ-002-VAULT.md`) or OQ-006 v0.8 (`docs/validation/OQ-006-QMS.md`):
- both send parallel routes with one approver, which keep their exact request and response;
- the QMS approve answer gains only `meta.approvalComplete`.

So neither protocol is revised. Both were executed against private instances of the working tree:

| Protocol | Instance | Result |
|---|---|---|
| OQ-002 Vault v0.15 | `:5201`, RR3's instance database `c2c_rr3_instance` brought to HEAD's set by `deploy-migrate`; identities `oq-runner`, `oq-signer`, `oq-approver@validation.local` | **24 pass, 0 fail, 0 deviation, 0 not-executed** (`oq/vault/transcript.txt`, record in `oq/vault/OQ-VAULT/`) |
| OQ-006 QMS v0.8 | `:5202`, RR4's instance database `c2c_rr4_instance`, the same; identities `oq-runner`, `oq-signer@validation.local` | **22 pass, 0 fail, 0 deviation, 0 not-executed** (`oq/qms/transcript.txt`, record in `oq/qms/OQ-QMS/`) |

Posture:
- `NODE_ENV=development`, with dev-login refused (`ALLOW_DEV_AUTH=0`; `/api/auth/dev-login` 404);
- `RLS_ENFORCE=on`, runtime role `app_service`;
- sign-in by password and authenticator code.

A scan of this folder for every OQ and acceptance password, TOTP secret and the JWT secrets found none, and found no bearer token.

Still owed through change control, not done here: OQ-002/OQ-006 and URS-VAULT-013/URS-006 do not yet name sequential reviewers, several approvers or adding a reviewer. Steps for them are a protocol and URS revision.

## Acceptance (`acceptance/`)

Drivers: `rr2-vault-acceptance.mjs` and `rr2-qms-acceptance.mjs` (Chromium, playwright-core), each run at 1440×900 (`*/desktop/`) and 390×844 (`*/phone/`). Every run is green, with no page errors.

**Instances:** the two above, restarted with `ALLOW_DEV_AUTH=1` for the browser runs. These synthetic accounts have no second factor, and the instance otherwise challenges them by e-mail. This is RR3's and RR4's acceptance posture: the signature still re-verifies the password on its transaction. The OQ runs above had dev-login refused.

**Accounts:** synthetic only.
- `rr3-*@example.test`, in RR3's synthetic organization, plus one new approver `rr2-approver2@example.test` ("Ava Approver"), seeded in that organization and its project.
- `rr4-*@example.test`, in RR4's synthetic organization, where Quinn QA and Ann Approver are both designated QMS approvers.

The password came from the environment. jm.smith and sarah.chen were not used. Both instances were stopped afterwards.

**Vault (`acceptance/vault/*/run.log`):**
- Run A, two reviewers in sequence and two approvers, through the form:
  - The sender picks Rae then Rob, chooses "One after another" and moves Rob earlier. The list reads "Step 1 · Rob Reviewer", "Step 2 · Rae Reviewer". The sender dates each step, names Ann and Ava as approvers, and sends: "Waiting for Rob Reviewer." (01–02)
  - Rae is not told yet. Her Tasks row waits, and the version says "Rae Reviewer · reviewer · Waits for Rob Reviewer · due …", with no Sign review offered (03–04).
  - Rob signs. Rae's Tasks then say "It is your turn: review …", and she signs (05).
  - Ann's approval dialog says "Your approval is 1 of 2 required" (06). After she signs, the version is still In review, and her line reads "Approved (1 of 2 required)": "You signed at …; waiting for Ava Approver." (07)
  - Ava approves. The version is Approved: "Approved: every named reviewer and every named approver signed.", with Ann "1 of 2" and Ava "2 of 2" (08).
- Run B, adding a reviewer mid-route:
  - Rae has signed, so it is Ann's turn. The sender opens Add a reviewer. The sheet says Ann waits again, and the sender picks Ria with a date and a reason (09).
  - The round reads "Waiting for Ria Reviewer.", and Ann reads "Waits for the review" (10). Ann's Tasks say "Waiting on a new reviewer: …" (11).
  - Ria signs, then Ann approves. The version is Approved, and the history includes the addition (12).

**QMS, two designated approvers (`acceptance/qms/*/run.log`):**
- The author sends an SOP in the register's route form, naming Rae as reviewer and both QMS approvers (01–02).
- Rae signs the review.
- Quinn's approval dialog says "Your approval is 1 of 2 required" (03). After Quinn signs, the SOP is still Under review, and Quinn's line reads "Approved (1 of 2 required)": "You signed at …; waiting for Ann Approver." (04)
- Ann approves, and the SOP is Effective (05). The route's own read shows it complete, with all three members signed.

At 390×844, every checked surface had 0 px horizontal overflow and no control under 44 px: the route form (with the Earlier and Later buttons), the round, the add-reviewer sheet, the QMS route form and the route sheet.

## Decisions taken where the brief or the design left room

1. **An added reviewer after the review first completed (Vault).** The append-only guard on `canonical_documents` admits `review_signature` once per round. It returns to NULL only on `in_review → authoring`, so the column cannot be rewritten. The column therefore keeps the signature that first completed the review. The added reviewer signs on the route (`reviewSignatureRefusal(…, { routed: true })`). The approvers wait on the route, whose step authority decides, not the column. A test shows the approval refused (`REVIEW_INCOMPLETE`) while the column is set. Every signature is in the round and in the trail.
2. **What an earlier QMS approval writes.** It is the one signed approval: the same `qms-document-approval` type, meaning APPROVED, and digest, with its `approve` ledger row saying `toStatus: in_review` and `approvalsRecorded/approvalsRequired`. It makes no status change, no `approver_id`/`approved_at`/`metadata.approval` stamp and no sealed authored copy, and schedules no periodic review. Only the last approval is the "release" approval that `current-release-approval.ts` and training read (it keys on `approver_id` and `approved_at`).
3. **Adding a reviewer:**
   - The new reviewer is step 1 on a parallel route, and the next step on a sequential one.
   - Their due date is required, at or after the last step's, and at or before the approval's. The approval date does not move.
   - Approvers whose turn had come are blocked again and told. Approvers already waiting only change step. A handed-back approver keeps waiting on the sender.
   - The new task id is the send's form, with a suffix if reassignment already gave that id to someone.
4. **"One after another" needs two reviewers in the form.** With one reviewer the order is moot, so it is offered only at two or more. The server also admits a sequential route of one.
5. **A sequential reviewer reassigned while waiting** gets the RR3 naming notice "Review requested: …", with the body "Your review opens once the reviewer before you has signed". "It is your turn" follows when their step opens. This follows RR3's precedent for a waiting approver.
6. **Order is fixed once sent.** Steps cannot be reordered on an open route; adding a reviewer appends a step. Reordering would need its own governed act.

## Design issues for the coordinator

1. **The Vault's lifecycle sign-off line names one reviewer.** It reads `review_signature` ("Review signed by …"). With several reviewers, or a reviewer added after completion, it names only the one who completed the review first; acceptance run B shows "Review signed by Rae Reviewer" while Ria also reviewed. The round lists every reviewer. Whether that line should defer to the round is a §2.12 call.
2. **A partial QMS approval in two readers.**
   - `audit-trail-ledger.routes.ts` labels every `qms-document-approval` signature "Controlled document approved (e-signature)", including an earlier approver's while the SOP is still in review.
   - The controlled-documents compliance report's latest-approval lateral can show an approval signature on a version that is still in review.
   Both are true of the signature, but a reader may take "approved" to mean effective. A distinct label, or the ledger's `toStatus`, would say it. Not changed here: a new signature type would be a Part 11 decision.
3. **Sequential approvers** are not in the design (§3: parallel among themselves), so they were not built. If wanted, they need a design decision.
4. **The protocols do not cover RR2.** OQ-002/OQ-006 and URS-VAULT-013/URS-006 need steps for sequential reviewers, several approvers and adding a reviewer, through change control.
5. **Acceptance and OQ reused the RR3 and RR4 instance databases**, brought to HEAD by `deploy-migrate`, rather than freshly provisioned ones. Their enrolled synthetic identities were needed. The DB tests used a freshly provisioned database.
6. **Disabled Earlier/Later look enabled.** `.sp-ask` has no disabled style, so the Earlier button on step 1 and Later on the last step look the same as live ones (they are disabled and announced). This is a small styling follow-up in `journey-v2.css`.
7. **`review-route.ts` was at its 500-line limit.** Its read-only rules moved to `review-route-rules.ts`. The route-writer gate (`route-writer-setting.gate.test.ts`) still finds one setter.

## Pre-existing failures, not caused by RR2

- `server/routes/ind-lifecycle/__tests__/dispatch-verdict-parity.pglite.test.ts`: 5 tests, as RR4 recorded.
