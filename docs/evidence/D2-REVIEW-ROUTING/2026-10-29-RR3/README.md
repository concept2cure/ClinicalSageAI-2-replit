# RR3: reassign a named reviewer or approver on an open route, and hand back (D2, 2026-10-29)

Slice RR3 of `docs/design/REVIEW_ROUTING_2026-10-23.md` (§2.5, §2.10, §2.11, §2.12; findings B9, B11, M2, M3, M6), built on RR1a (`../2026-10-29-RR1a/`) and RR1b (`../2026-10-29-RR1b/`). Launch row **D2**, Veeva gap 4.

On a Vault version's open route:
- the sender or an administrator gives an unsigned member's assignment to another person, with a reason;
- a named member hands their own assignment back to the sender, with a reason, and the sender then reassigns it;
- the version's round shows the naming history by printed name.

The QA item "nothing reassigns or withdraws" is closed for Vault.

| Commit | What |
|---|---|
| `792ebe834` | **Fix, found first:** RR1a's `assignTaskInTx`, its route guard on PATCH assign and auto-assign, and its marker clearing had been lost in merges. Restored (below). |
| `ccefb0dee` | Server: `reassign` and `hand-back` acts, `?for=reassign` picker read, standing tells a hand-back from a return, naming history in the round read, my-work for a handed-back member. |
| `18c718e3c` | Client: Reassign (a sheet), Hand back, the naming history. Two modules moved out of `VaultReviewRoute.tsx` unchanged to stay under the file-length limit. |
| this commit | Evidence. |

## What already exists

Everything below was found first, then extended or reached. Nothing was rebuilt beside it.

Searches run:
- `reassign`, `handBack`, `hand-back`, `handedBack`, `delegat`, `TaskAssign`, `Reassign` over `server/` and `client/src`;
- `git log --all --diff-filter=D` on `*eassign*`, `*andBack*`, `*hand-back*` and `*delegat*`. Nothing was deleted under these names.

| Existing piece | Path | What it did | What RR3 did |
|---|---|---|---|
| Named reassignment | `assignTaskInTx` in `server/services/tasking/task-assignment.ts` (RR1a) | Admission, compare-and-set UPDATE, markers cleared, `task.assign` row; `routeOwned` reserved "for RR3" | **Restored**: lost at HEAD (below). Reassignment goes through it, route-owned. |
| The route's one writer | `server/services/review/review-route.ts` | send, close on signature, open the approver step, close the route | Adds `reassignMember` and `handBackMember`. Withdraw and return now record the actor's printed name. |
| The member validator | `validateRouteMember` (`review-route-member.ts`) | Built for send, add and reassignment; actor check already present (`MEMBER_IS_ACTOR`) | Called unchanged at reassignment: the route's sender as sender, the reassigning actor as actor, every current member as named. |
| Route standing | `routeStanding` (`review-route-standing.ts`) | `outcome` typed `'handed back'`, but every act read as `returned` | Reads the act's command, so a hand-back is told apart from a return. `readRouteRounds` adds `history`. |
| The picker's read | `GET …/route-candidates/:vaultId` (`review-route-candidates.ts`, RR1b) | The validator's answer per member and role, as at a send | `?for=reassign` asks the validator as a reassignment would. |
| Routed acts and their transaction | `server/routes/document-lifecycle-review-route.ts` (`onRecord`, `lockedStanding`, `memberRefusal`) | Withdraw and return under the record's row lock; notices after COMMIT | Adds `POST …/review-route/reassign` and `…/hand-back` on the same `onRecord`. A handed-back member's signature is refused (`ROUTE_HANDED_BACK`). |
| Governed reason | `requireGovernedReason` (`server/routes/governed-reason.ts`) | `REASON_REQUIRED` | Used by both acts. |
| Governed ledger | `recordGovernedAction` (`server/routes/c2c/actions.ts`) | Chained pair on the subject's target | Writes `review-route.reassign` and `review-route.hand-back`, which the round's history reads back. |
| Tasks tray | `readMyWork` (`server/services/tasking/my-work.ts`), `OpenWork.tsx` | `waitingOn` for blocked route members | A handed-back member waits on "the sender to reassign it". A reassigned task leaves the old assignee's tray, because the tray reads by assignee. |
| Notices | `notifyTaskEvent`, server-only `task_*` (RR1b) | `task_assigned`, `task_update` | New member: `task_assigned` ("Review requested", "It is your turn: approve", "Approval requested"). Old member: `task_update` with the reason. Sender on a hand-back: `task_update`. |
| Round panel and acts | `RouteRoundPanel`, `RouteActDialog`, `memberLine`, `routeHeadline` (`client/.../surfaces/VaultReviewRoute.tsx`, RR1b) | Members, Remind, Withdraw/Return | Reassign on each unsigned member. Hand back becomes a third reason-only act in `RouteActDialog`. Hand-back lines and headlines. |
| Picker and reason fields | `PeoplePicker`, `ReasonField`, `reviewReasonProblem` (`client/.../editor/reviewFields.tsx`, RR1b) | The one searchable people list and governed reason | The reassign sheet uses both. Nothing copied. |
| Dialog and sheet | `useDialog`, `de-bd de-sheet` | Focus trap, Escape, bottom sheet at ≤ 600 px | Reused by the reassign sheet and the hand-back dialog. |
| Generic task reassignment UI | `client/.../surfaces/TaskAssignmentControls.tsx` | Task board reassignment through `assignTask` | **Not used for route members, deliberately.** RR1a's guard refuses route rows there (`canAssign` false, `ROUTE_TASK_OWNED_BY_ROUTE`). Its roster is write roles plus project access, not the route validator. Route reassignment is the route's act, on the version. |

New files, each the one implementation of what it holds:
- `client/.../surfaces/VaultRouteReassign.tsx`: the reassign sheet and the history list;
- `client/.../surfaces/vaultRouteCandidates.ts`: the candidates read, moved unchanged;
- `client/.../surfaces/vaultRouteText.ts`: the round's text helpers, moved unchanged;
- `tests/db/review-route-vault-rr3.dbtest.ts`;
- `client/.../__tests__/vaultReviewRouteReassign.test.tsx`.

### RR1a's reassignment was lost in merges (fixed in `792ebe834`)

At `57ac612a9`, `server/services/tasking/task-assignment.ts` had no `assignTaskInTx`, no route guard and no marker clearing. Merges `a5f137f03`, `416df4131` and `63236b89a`, between parallel sessions, resolved the file to the side that carried only `54ca90814`'s organization-scoped recipient read.

So three of RR1a's own tests were red at HEAD (`red/rr1a-assign-guard-lost-in-merge.txt`):
- PATCH assign answered `CONFLICT_STALE` instead of the route refusal;
- **auto-assign handed a route member to someone else** (only the database trigger stops that in a deployed database);
- the reminder markers survived a reassignment.

Restored from `d2a1ab000` with `54ca90814`'s recipient read kept. Green: `green/rr1a-assign-guard-restored.txt` (91 passed). No other RR1a/RR1b file lost lines (checked file by file against `d2a1ab000`).

## Red → green

| Behaviour | Test | Red | Green |
|---|---|---|---|
| PATCH assign and auto-assign refuse a route member; a reassignment clears the markers | `server/routes/__tests__/route-task-guard.pglite.integration.test.ts` (RR1a's) | `red/rr1a-assign-guard-lost-in-merge.txt` | `green/rr1a-assign-guard-restored.txt` |
| Reassign keeps the task id, role and step, clears the markers, and writes `task.assign` and `review-route.reassign` (route id, from, to, role, reason, both printed names) | `tests/db/review-route-vault-rr3.dbtest.ts` | `red/vault-route-rr3.dbtest.txt` (17 of 17 fail; server change stashed) | `green/dbtests.txt` |
| New member told (`task_assigned`); old member told with the reason; the task leaves the old tray and enters the new; the new member signs, the old one gets `ROUTE_NOT_NAMED` | same | same | same |
| An administrator who did not send it reassigns the waiting approver; it stays blocked, opens when the review completes, and the new approver approves | same | same | same |
| Refused, with nothing written (rows and ledger compared): no reason; neither sender nor admin; a signed member; a task not on the route; the actor naming themselves; an author; a reviewer of this content as approver; someone already named; another organization's account; another organization's version; a returned route | same | same | same |
| Hand back: reason required; `review-route.hand-back` stamped on the member row; task blocked; sender told; member stays named; their signature refused (`ROUTE_HANDED_BACK`); review not complete; reassignment reopens it and cites the hand-back; the new member completes the review | same | same | same |
| Hand back refused for someone not named, a signed member, another organization | same | same | same |
| The round's naming history by printed name (send with everyone named, hand-back, reassign from/to), UTC times, reasons | same | same | same |
| The reassign picker's read refuses the route's sender (as author), the reader (`MEMBER_IS_ACTOR`) and everyone named (`MEMBER_ALREADY_NAMED`) | same | `red/reassign-picker.dbtest.txt` (handler not passing `for=reassign`) | same |
| Reassign offered to the sender and an admin on each unsigned member, never a signed one, nobody else; the sheet offers only the admitted, says why the others are not, waits for a person and a reason, posts them, says a refusal; an unread list offers no one; Hand back asks a reason; a handed-back member gets no signature and the round says who waits on whom; the history lines | `client/.../__tests__/vaultReviewRouteReassign.test.tsx` | `red/client-reassign-hand-back-history.txt` (8 of 8 fail) | `green/client.txt` |

Regression:
- `green/dbtests.txt`: RR3's suite with RR1a's two, RR1b's, `vault-lifecycle`, `canonical-documents-append-only` and `task-filing-home`; 79 passed.
- `green/server-unit.txt`: 15 files, 173 passed.
- `green/client.txt`: 46 files, 370 of 371 passed. The one failure is a timing-dependent search test in `vaultSurfaceAnaContext.test.tsx` that also fails at the base (1 of 3 runs there, 0 of 3 at `18c718e3c`). Recorded in that file.

## How the tests were run

- Unit, PGlite and client tests with `RLS_ENFORCE=off`.
- Database tests as RR1a's README records:
  - a fresh deploy-shaped database from `scripts/db/provision-test-db.sh` (install-fresh and deploy-migrate, pgvector, `app_service` NOSUPERUSER NOBYPASSRLS);
  - renamed to the recorded-disposable name `platform_ci_vault_fixture_rr3` (`C2C_VAULT_LEGACY_FIXTURE_DATABASE`);
  - run with `RLS_ENFORCE=on`, `TEST_DATABASE_URL` as the owner and `APP_DATABASE_URL` as `app_service`.

## Gates

`gates.txt`, each exit 0:
- `ci:pushed-lint-warnings` (no file changed its warning count);
- `ci:pushed-lint-errors`;
- `ci:sql-interpolation`;
- `ci:undefined-css-classes`;
- `ci:untracked-imports`;
- `ci:sign-ceremony`;
- the full typecheck (`NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p tsconfig.check.json`).

Also run: `ci:tenant-isolation:no-regression` (0 findings). No baseline was raised.

These gates diff `origin...HEAD`, so they see only committed files. Each commit was therefore linted file by file (and the tree-wide gates and typecheck run) before it was made, and the gates were re-run over the commits after.

`ci:launch-scope-api` fails on one path, `/api/csr/jobs` from `CsrBuildProgress.tsx`. That came from `7b209818a`, before RR3, and none of RR3's paths are listed.

## Vault OQ protocol (`oq-vault/`)

RR3 changes no step of OQ-002 v0.15 (`docs/validation/OQ-002-VAULT.md`), so the protocol is not revised.

`node tests/validation/run-all.mjs vault` against the private instance below: **24 pass, 0 fail, 0 deviation, 0 not-executed** (`oq-vault/green/transcript.txt`, record in `oq-vault/green/OQ-VAULT/`).

Posture:
- `RLS_ENFORCE=on`, runtime role `app_service`;
- `NODE_ENV=development` with dev-login refused (`ALLOW_DEV_AUTH=0`; `/api/auth/dev-login` 404);
- identities `oq-runner@validation.local` (admin), `oq-signer@validation.local` (reviewer) and `oq-approver@validation.local` (approver), in a synthetic organization;
- each enrolled a TOTP factor through the product's own `/api/auth/mfa/setup` and `/mfa/enable`, and signed in by password and authenticator code.

No secret is in the record: a scan of this folder for the password, the TOTP secrets, the JWT secret and bearer tokens found none.

## Acceptance (`acceptance/`)

### The instance

- A private instance of the working tree at `18c718e3c` on `:5197`.
- A fresh database from `provision-test-db.sh` (`c2c_rr3_instance`); `RLS_ENFORCE=on`, runtime role `app_service`.
- Driven by Playwright (chromium from `/opt/pw-browsers`) with `acceptance/rr3-acceptance.mjs`, at 1440×900 (`desktop/`) and 390×844 (`phone/`).
- Synthetic accounts in a synthetic organization seeded for this run: Sam Sender (admin), Rae, Rob and Ria Reviewer (reviewer role, project members), Ann Approver (approver role, project member). Launch modules came from `scripts/ops/provision-launch-modules.ts`.
- Their password came from the environment and is not in this folder. jm.smith and sarah.chen were not used.
- The instance was stopped afterwards.

### Two postures on the same instance

As RR1b's runs did, the browser acceptance ran with `ALLOW_DEV_AUTH=1`: a password sign-in, with the second factor skipped. Signing still re-verifies the password in the transaction. The OQ run then ran with it refused (above).

### Each run (`*/run.log`, numbered screenshots; `-detail.png` is the element)

1. The sender uploads a version and sends it on a route naming Rae and Rob as reviewers and Ann as approver. This goes through the API; the form is RR1b's acceptance.
2. The sender sees Reassign on each member and reassigns Rae's review to Ria in the sheet:
   - the sheet says "4 members are not offered, and why";
   - the reason is given;
   - the round reads "Waiting for Ria Reviewer and Rob Reviewer."
3. Rae's Tasks no longer list the review, and she has "Review reassigned: …". Ria's notice opens the version ("Your turn: sign the review."), and she signs ("You signed at …; waiting for Rob Reviewer.").
4. Rob hands back, with a reason. He reads "You handed this back; waiting for Sam Sender to reassign it." and is offered no Sign review.
5. The sender's Tasks have "Handed back by Rob Reviewer: …", and the round reads "Rob Reviewer handed their assignment back: reassign it."
6. The sender reassigns Rob's review to Rae. Rae signs, and Ann approves on the route: "Approved: every named reviewer and the approver signed."
7. The naming history lists, by name, time and reason:
   - Sam Sender sent it naming Rae, Rob and Ann;
   - Sam Sender reassigned the review from Rae to Ria;
   - Rob handed back his review;
   - Sam Sender reassigned the review from Rob to Rae.

On the phone, the round, both reassign sheets and the hand-back sheet were checked: horizontal overflow 0 px, and no control under 44 px. Page errors: none on either run.

## Decisions taken where the brief or the design left room

1. **Lock order for reassignment.** Reassignment reads the standing under the record's row lock without locking the member rows. Every route writer takes the record lock first, so the read is current. `assignTaskInTx` then locks the project and then the task, the same order as a generic assignment, so a refused generic assignment on the same task cannot deadlock against it. Hand-back, which touches no project, locks the member rows as withdraw and return do.
2. **A handed-back assignment is `blocked`.** The member's row carries the act, and their task waits on the sender, so it is neither reminded (the sweep skips blocked route tasks) nor triaged as overdue. Reassignment returns it to `pending`, or to `blocked` for an approver whose step is not open, clears the act from the row (the ledger keeps it), and cites it in `review-route.reassign` (`handedBackActId`).
3. **Hand back is open to any unsigned member**, whether or not their step is open. An approver can hand back before the review completes.
4. **A returned member is refused twice.** Return closes the route, so a reassignment after it is `ROUTE_NOT_OPEN`. `ROUTE_MEMBER_RETURNED` is the member-level backstop.
5. **The picker's read for a reassignment** (`?for=reassign`) asks the validator exactly as the reassignment does. So the sheet offers exactly whom the server admits, and says why each other member is not offered.
6. **Notice titles.** Reassign to a reviewer: "Review requested: …". To an approver whose step is open: "It is your turn: approve …". Otherwise: "Approval requested: …". The old member gets "Review reassigned: …" or "Approval reassigned: …" with the reason. The sender on a hand-back gets "Handed back by {name}: …".

## Design issues for the coordinator

- **"Add a reviewer" is not in this slice.** The design's RR3 also names adding a reviewer to an open route (re-blocking the approvers, `ROUTE_APPROVAL_STARTED`). The brief for this session named reassign and hand back only, so adding a reviewer remains open.
- **Merges dropped RR1a's code** (above). Three merges between parallel sessions on the one branch resolved a file to the side without RR1a's change, and nothing failed until a test was run. The merge commits are green by construction. A merge that drops a recorded test's subject is not caught by any gate that only looks at changed files.
- **The Vault's uploaded-files row has no width at 390 px.** The document name renders 0 px wide (`.vd-dr-name`), so at a phone's width a document cannot be opened from the Vault's own list. RR1b's phone run could still click it. The acceptance opened the version through the Vault's deep-link target, as a route notice does, and says so in `phone/run.log`. This is outside RR3's files.
- **MFA challenge secret mismatch in development.** `mfaService.ts` signs the challenge with `JWT_SECRET`, but `verifyJwtWithRotation` prefers `JWT_SECRET_<ENV>`. The repository's `.env` sets `JWT_SECRET` and `JWT_SECRET_DEV` to different values, so a password-and-TOTP sign-in fails with `MFA_002` on a development instance. The OQ instance set `JWT_SECRET_DEV` equal to `JWT_SECRET` to proceed. Outside RR3.
- `review-route.ts` is 630 lines. ESLint passes it, but the pre-commit hook warns at 500. The design names it the one writer of route rows (§2.1, §2.3; `route-writer-setting.gate.test.ts` pins where the setting is set), so the RR3 acts were kept in it. Whether to split it is the coordinator's call.
- URS-VAULT-013 and OQ-002 do not yet name reassignment or hand back. Whether they should is a protocol and URS revision, outside this slice.
