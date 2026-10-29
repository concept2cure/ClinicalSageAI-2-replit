# RR4: the review route on a QMS controlled document, and QMS approvers (D2, 2026-10-29)

This is slice RR4 of `docs/design/REVIEW_ROUTING_2026-10-23.md`. It builds on:
- RR1a (`../2026-10-29-RR1a/`): routes, members and signatures;
- RR1b (`../2026-10-29-RR1b/`): the route form components;
- RR3 (`../2026-10-29-RR3/`): reassign and hand back.

It covers §2.7–§2.13, NEW-4 for QMS, decision D-Q (§7) and findings B4, B5, B7 and M (§8). Launch row **D2**.

What a QMS controlled document now does:
- **It is sent for review on a route.** The route names one QMS approver and zero or more reviewers. Every reviewer signs (meaning REVIEWED) before the approver's turn opens. The approval is the existing signed approval, and it closes the route.
- **Every exit from review closes the route on the same transaction:** Return for revision, retirement and withdrawal.
- **QMS approvers are a per-organization designation, made by an administrator in Admin and access.** Until anyone is designated, the Approver role stands in.

| Commit | What |
|---|---|
| `5985619e5` | Server: D-Q designation (column pair, policy, governed route), the QMS route (send, review signature through `signGovernedAct` with `precheck`/`afterSign`, approval and retirement hooks, Return for revision, withdraw/resend/reassign/hand-back), refusals on the edit paths while a route is open. 18 DB tests, 4 hook unit tests; existing QMS tests moved onto a routed send. |
| `06b7e840d` | Client: the route form and round in the Quality register (`SopRegister.tsx`), the route sheet, and the QMS approver control in Admin and access. |
| `618059d34` | Found in acceptance: the approver list shows a non-designated Approver disabled with the reason, instead of omitting them; the register's sheet close is 44 px at phone width. |
| `3f46aa2a0` | OQ-006 v0.8: the protocol revised for the route and for the controlled create it had not followed since 2026-10-14 (red first, below). |
| this commit | Evidence, and OQ-006 §4 brought to the execution at `3f46aa2a0`. |

## After the merge with origin (2026-10-29)

RR4 was merged with `origin/concept2cure-v2`. Upstream brought QMS changes: the quality-record routes moved to `mdx-qms-records.ts`, supplier and nonconformance signatures were added, and training lapses arrived. The coordinator resolved three textual conflicts:
- `mdx-qms.ts`: both import sets kept;
- `migration-set.mjs`: upstream's `20261029e` before RR4's `20261029f`;
- `qmsApproval.ts`: RR4's side kept. `sendQmsDocumentForReview` was the pre-RR4 unrouted send, which the server now refuses and which has no caller. A duplicated `UNCONFIRMED_REVIEW` was dropped.

RR4 then fixed two tests:
- **`qmsReviewRoute.test.tsx`.** Upstream's register now renders `<TrainingExpiry />`, which reads `useTrainingExpiring`. The test's `../hooks` mock gained it, exactly as upstream's own SopRegister tests did. The route form remains the only send for review, and upstream added no other send.
- **`ControlledDocumentWorkbench.integration.test.tsx`, "authors an empty template section…".** It fails on origin alone, and passed at `4e054413d`. The cause is timing. The first test pays for the cold `React.lazy` import of the real workbench's module graph, and on the merged tree that outlasts the 5 s test budget: the DOM is still "Loading the document editor…". With a longer timeout all 3 pass. The module is now loaded once in `beforeAll`; every test still renders through the lazy boundary, and no assertion changed.

On the merged tree, with the fixture database and the instance database brought to the merged set by `scripts/db/deploy-migrate.mjs` (`green/merged/`, `gates-merge.txt`):
- DB: **14 files, 162 passed**.
- Client: **32 files, 316 passed**.
- Server unit (now also every `server/services/qms/__tests__` and QMS route test): **88 files, 1713 passed, 6 failed**, the same 6 pre-existing failures.
- Every gate and the full typecheck: exit 0.
- **OQ-006 v0.8: 22 pass, 0 fail, 0 deviation, 0 not-executed** (`oq/green-merged/`). Its record names `4e054413d`, because it ran on the staged merge before the merge commit.

## What already exists

Everything below was found first, then extended or reached. Nothing was rebuilt beside it.

Searches run:
- `qms_approver`, `quality approver`, `QA approver`, `approver_designat`, `designat` over `server/`, `shared/`, `client/src`, `migrations/`, `db/migrations/`;
- `in_review`, `return for revision`, `returnQms`, `sendForReview`, `REVIEW_ROUTE` over `server/services/qms`, `server/routes/mdx-qms*.ts`, `client/src/concept2cure/quality`;
- `git log --all --diff-filter=D` on `*qms*approver*`, `*QmsReview*` and `*ReviewRoute*`. Nothing was deleted under these names.

| Existing piece | What it did before RR4 | What RR4 did with it |
|---|---|---|
| `public.organization_users` (`shared/schema.ts` `organizationUsers`) | The org membership row: role, scopes, state. | **Extended**, not a new table: `qms_approver_designated_at` / `_by` and a pair CHECK (`migrations/20261029f_qms_approver_designation.sql`, additive and conditional, placed before the final pair, Rule 1). |
| `checkSigningAuthority` (`server/services/part11/signing-authority-gate.ts`) | The one signing-authority rule. | **Reached**: a designee must hold it (`MEMBER_CANNOT_SIGN`). |
| `recordGovernedAction` (governed ledger) | Chained ledger rows for governed changes. | **Reached**: `qms-approver.designate` / `.remove` on `organization-member:<id>`, with the reason. |
| `review_routes`, the `unified_tasks` route columns, `enterRouteWriter` and the trigger guard (RR1a) | Routes for Vault versions. | **Reached** for `qms-document:<id>` subjects. Same tables, same guard. |
| `validateRouteMember` (`server/services/review/review-route-member.ts`) | Refuses the author, contributors, non-signers and other organizations. | **Extended**: an approver on a QMS target must hold QMS approval (`MEMBER_NOT_QMS_APPROVER`). |
| `separation-of-duties.ts` | Author resolution per subject type (switch). | **Extended**: `qmsDocumentAuthors` (author + controlled-text contributors + authored-copy authors). The switch became the `COMPOSITE_AUTHORS` map, to stay under the complexity limit. |
| `sendReviewRoute`, `closeRouteTaskOnSignature`, `openApproverStep`, `closeReviewRoute`, `reassignMember`, `handBackMember` (`server/services/review/review-route.ts`) | The Vault route lifecycle; reviewers were mandatory. | **Reached and extended**: `parseRouteRequest(raw, {reviewersOptional})`, an approver at step 1 when there are no reviewers, the ledger scope by subject type (`routeLedgerScope`: QMS → `qms`/`quality`). No QMS copy of any of them. |
| `readRouteCandidates` (`review-route-candidates.ts`) | The Vault picker read. | **Converged**: its body became `listRouteCandidates` + `namingOf`, used by Vault and QMS. |
| `signGovernedAct` (`server/routes/governed-signed-act.ts`) | The one signed-act route wrapper. | **Extended** with `precheck` (before authority and the credential) and `afterSign` (on the signing transaction, before COMMIT). |
| `approveQmsDocumentSigned` / `retireQmsDocumentSigned` (`server/services/qms/document-approval-signature.ts`) | The signed approval and retirement. | **Reached**: an optional `route` hook pair, called on their own transaction. The approval digest function is shared with the review (`qmsSignedContent`), so one digest covers both. |
| `qms-document` binder (`server/services/part11/governed-target-binders.ts`) | Bound QMS approvals. | **Extended** to bind an `in_review` row, through the same `qmsSignedContent`. |
| `updateControlledQmsDocument` (`controlled-document-service.ts`) | `PATCH status:'in_review'` with a reason. | **Extended**: the send carries `route` and is refused `REVIEW_ROUTE_REQUIRED` without one. Revision is refused `QMS_ROUTE_OPEN` while a route is open. |
| `training-controlled-text.ts` | The registry-only controlled-text save, which demotes to draft. | **Extended**: refused `QMS_ROUTE_OPEN` while a route is open. |
| Trigger `qms_authoring_content_guard` (`db/migrations/20261014_qms_controlled_authoring_content.sql`) | Refuses authored-section writes unless the QMS document is draft. | **Reused as is.** A second gate written in `document-lock` duplicated it and was reverted; the DB test asserts the trigger's refusal. |
| `SopRegister.tsx` / `ControlledDocumentWorkbench.tsx` (`client/src/concept2cure/quality/`) | Send for review was a reason dialog. | **Extended**: the route form replaces that dialog. A round line goes under the status, and a "Review route" chip opens the sheet. `sendQmsDocumentForReview` (`qmsApproval.ts`) was removed, and its replacement is named there. |
| `PeoplePicker`, `DueDateField`, `ReasonField` (`client/src/concept2cure/v2/editor/reviewFields.tsx`, RR1b) | The route form fields. | **Reused unchanged.** |
| `memberLine`, `routeHeadline` (`VaultReviewRoute.tsx`), `RouteHistory` (`VaultRouteReassign.tsx`), `vaultRouteCandidates.ts`, `vaultRouteText.ts` | Vault's round rendering. | **Imported unchanged** by `QmsReviewRoute.tsx`. They were not moved, because another session was editing Vault surfaces (design issue 1). |
| `EsignModal` (`client/src/concept2cure/_shared/components/EsignModal.tsx`) | The signing dialog. | **Reached** for the review signature (meaning REVIEWED). |
| `AdminAccess.tsx` member drawer | Role, state, SSO, factor, groups. | **Extended**: a "QMS approver" row and the designate/remove control (`AdminQmsApprover.tsx`). |
| `mdx-admin.ts` members read | Members with role and state. | **Extended**: `qmsApprover`, `qmsApproverDesignated`, `qmsApprovers.standIn`. |
| OQ-006 (`docs/validation/OQ-006-QMS.md`, `tests/validation/oq/qms/run.mjs`) | v0.7, last executed at v0.6. Red on today's product (below). | **Revised** to v0.8 with a dated revision row, re-executed (`oq/`). |

## Red → green

Red was run against a `git archive 67b61128f` export (the base of this slice) with the new tests copied in. Green was run at the working tree of `3f46aa2a0`.

| Suite | Red (`red/`) | Green (`green/`) |
|---|---|---|
| `tests/db/review-route-qms-rr4.dbtest.ts`: D-Q, route rule, signing and digests, exits, withdraw/grandfathering, reassign/hand-back, cross-tenant, authored document | 15 failed, 3 skipped (`qms-route-rr4.dbtest.txt`) | in `dbtests.txt` |
| `server/routes/__tests__/governed-signed-act-hooks.test.ts`: precheck before authority and credential; afterSign on the transaction, with a throw rolling back | 4 failed (`governed-signed-act-hooks.txt`) | in `server-unit.txt` |
| `client/.../quality/__tests__/qmsReviewRoute.test.tsx` (6), `client/.../v2/__tests__/adminQmsApprover.test.tsx` (3) | 9 failed (`client-route-form-panel-admin.txt`) | in `client.txt` |
| DB: RR4 + RR1a, RR1b, RR3, the route guard, every QMS DB suite, admin change audit, vault lifecycle, memberships | n/a | **14 files, 162 passed** (`dbtests.txt`) |
| Client: all of `quality/`, Admin access, the Vault route and inbox suites | n/a | **31 files, 313 passed** (`client.txt`) |
| Server unit: every server test that touches QMS, review routes, the signed act, separation of duties, tenant users and admin | n/a | **83 files: 1652 passed, 6 failed**, the 6 pre-existing (below) (`server-unit.txt`) |

The RR1a–RR3 suites were re-run after every commit of this slice, since RR3 warned about work lost in merges. They pass at HEAD: `review-route-vault*.dbtest.ts` and `review-route-guard.dbtest.ts` are in `dbtests.txt`. At the base, before any change, the same RR1a–RR3 and QMS suites passed: 102 tests.

Selected assertions that the design names:
- **The review digest equals the approval digest.** In the "two reviewers, then the approver" and "authored document" tests, each reviewer's `bound_payload_digest` equals the approval signature's and `metadata.approval.contentDigest`, including for a document authored in the canonical editor.
- **The precheck runs before the credential.** A refused precheck (`ROUTE_NOT_NAMED`, `ROUTE_STEP_NOT_OPEN`, `REVIEW_INCOMPLETE`) consults no authority and no password (hook test). The DB test shows no `electronic_signatures` row.
- **afterSign runs on the same transaction.** A throw after the signature row rolls back the act and the row (hook test). The task-close ledger row cites `esig:<id>` (DB test).
- **`run` locks `qms_documents FOR UPDATE`** (`lockQmsDocument`).
- **A withdrawn route never falls back to the old rule.** After a withdrawal, approval is refused `ROUTE_WITHDRAWN` until a new route is sent.
- **Grandfathering.** A document already in review with no route approves by today's rule, until someone names a route.

## How the tests were run

- **Unit and client tests:** `RLS_ENFORCE=off npx vitest run <files>`.
- **DB tests:** the RR1a README's method.
  - Provision a deploy-shaped database with `scripts/db/provision-test-db.sh` and rename it `platform_ci_vault_fixture_rr4`.
  - Set `TEST_DATABASE_URL` (owner), `APP_DATABASE_URL` (`app_service`), `C2C_VAULT_LEGACY_FIXTURE_DATABASE` and `RLS_ENFORCE=on`.
  - Run `npx vitest run --config vitest.db.config.ts <files>`.
- The full file lists are at the head of each green transcript's command and in the table above.

## Gates (`gates.txt`)

All exit 0 at `3f46aa2a0`, and again after this commit:
- `ci:pushed-lint-warnings`: no file changed its warning count;
- `ci:pushed-lint-errors`;
- `ci:sql-interpolation`;
- `ci:undefined-css-classes`;
- `ci:untracked-imports`;
- `ci:sign-ceremony`: 29 baselined sites, exactly as baselined;
- `ci:tenant-isolation:no-regression`: 0 above baseline;
- `ci:migration-set-order`: 440 migrations, sweep last;
- `ci:migration-drop-safety`;
- `ci:launch-scope-api`;
- `ci:validation-traceability`.

Full typecheck: `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p tsconfig.check.json` exits 0. No baseline was raised.

## OQ-006 (`oq/`)

The QMS OQ protocol is `docs/validation/OQ-006-QMS.md` (runner `tests/validation/oq/qms/run.mjs`).

**Red (`oq/red/`).** v0.7 on this installation gave **5 pass, 3 fail, 13 not-executed**:
- OQ-QMS-02 expected 422 and got 400 `QMS_CREATE_INVALID`;
- OQ-QMS-03 and OQ-QMS-06a were refused, because v0.7 creates a SOP without the project and reason the controlled create has required since 2026-10-14;
- every dependent step was not executed.

So the protocol had been stale since 2026-10-14, before RR4. RR4 adds its own change: a send now needs a route.

**v0.8** is a dated revision row in the protocol. It lists every changed step:
- OQ-QMS-02, 03, 04, 06a and 06c create with the project and author the text;
- new OQ-QMS-04b: a send without a route is refused `REVIEW_ROUTE_REQUIRED`, and the routed send opens round 1 on the signer;
- 05b: the route is complete on the approval signature; the digest is recomputed with the authored content restored from the signed version record;
- 06 and 06b: SOP B stays `in_review`;
- 06c: `MEMBER_IS_AUTHOR` at naming, `QMS_INVALID_STATE` at approval (was 403 `QMS_SELF_APPROVAL`, now legacy-only);
- 07: 400 `QMS_REASON_REQUIRED`;
- 10: digest as 05b's;
- 14: `?program=`.

**Green (`oq/green/`).** **22 pass, 0 fail, 0 deviation, 0 not-executed** at `3f46aa2a0`, recorded in the protocol's §4.

Posture of the OQ run:
- `RLS_ENFORCE=on`, `app_service`;
- `ALLOW_DEV_AUTH=0` (dev-login 404);
- both synthetic identities (`oq-runner@validation.local`, `oq-signer@validation.local`) sign in with password and TOTP;
- the signer approves as the Approver-role stand-in, since organization 6 designates no one.

Still owed through change control, and not done here:
- a URS-006 revision (the route, the designation, Return for revision);
- TM-001;
- VSR-001 §8 wording.

## Acceptance (`acceptance/`)

`rr4-acceptance.mjs` drives Chromium (playwright-core) against a private instance of the working tree.
- **Instance:** `localhost:5198`, database `c2c_rr4_instance` from `provision-test-db.sh`, `NODE_ENV=development`, `RLS_ENFORCE=on`, runtime role `app_service`.
- **Accounts:** synthetic only, `rr4-*@example.test`, in a synthetic organization. No real account was used.
- **Secrets:** the password comes from the environment and is in no file here. A scan of this folder for the password, the JWT secret and the TOTP secrets found nothing.

Runs: `desktop/` (1440×900) and `phone/` (390×844). Both are green, with no page errors.
1. **The administrator designates a QMS approver.** Before, the drawer reads "Yes, as an Approver until QMS approvers are designated". The designation needs a reason, and the form says that it ends the stand-in. Afterwards the drawer reads "Designated" (01–02).
2. **The author sends an SOP for review** with one reviewer and the designated approver (03–05).
   - The approver list offers only the designee. Ann Approver and the others are shown "not offered", with the reason.
   - The author is not offered, being unable to sign.
   - The row then reads "Waiting for Rae Reviewer.", and the sheet lists both members with their due dates.
3. **The reviewer signs, then the approver approves** (06–12).
   - The reviewer's row reads "Your turn: sign the review."; they sign (`POST …/review` 201).
   - The row then reads "You signed at …; waiting for Quinn QA.".
   - The approver's row reads "Your turn: approve."; the existing signed approval succeeds (200), and the SOP is Effective.
   - The round is complete, with both members signed.
4. **A second SOP is returned for revision** by the reviewer, with a reason. It is Draft, and the row reads "Returned by Rae Reviewer: …" (13–14).

At 390×844: the register's sheet has no horizontal overflow, and no control is under 44 px. The phone run designates a different member (Ann Approver), so each run starts from its own state. The designation is undone between runs through the governed API.

## Decisions taken where the brief or the design left room

- **Where the designation lives.** In `organization_users`, the existing membership table: one row per member per organization fits it exactly. A new table was not needed.
- **When the stand-in ends.** It is per organization: the first designation ends the Approver-role stand-in for everyone, and the admin form says so before the designation is made.
- **What a removed designation does to an open route.** The approval re-checks the designation (`QMS_APPROVER_NOT_DESIGNATED`). An approver whose designation was removed must be reassigned.
- **Who may Return for revision.** On a live route: the sender, or a member whose turn it is. On a legacy document: the author or an administrator. Anyone else gets `QMS_RETURN_NOT_PERMITTED`. The return writes a `return-for-revision` transition row and resets the authored copy from IN_REVIEW to draft.
- **Revision of an in-review document.** Revision is also an exit from in_review, and the design did not list it. It is refused while a route is open (`QMS_ROUTE_OPEN`); the route is withdrawn or returned first.
- **Access for route members.** Members get REVIEWER/APPROVER `doc_permissions` on the authored copy only when the sender can manage permissions. Otherwise the member reads through their existing access.

## Design issues for the coordinator

1. **The Vault route components were not generalized.** `QmsReviewRoute.tsx` imports `memberLine`, `routeHeadline`, `RouteHistory` and the candidate and text helpers from `v2/surfaces/Vault*`, because another session was editing the Vault surfaces. A follow-up should move them into a neutral module. Nothing is duplicated; the import direction is just wrong.
2. **Several approvers on one QMS route** are still refused `ROUTE_SHAPE_NOT_AVAILABLE`, until RR2.
3. **`QMS_SELF_APPROVAL` is now reachable only for a legacy document** (in review before routes); naming the author is refused first. No API creates such a document now.
4. **The register at 390 px is a horizontally scrolled table**, and the page header wraps word by word. This was there before RR4; the route sheet itself is clean at phone width.
5. **Admin's `C2CForm` close is 30 px** (`journey-v2.css .de-x`). This was there before RR4 and was not changed here; the acceptance check on Admin excludes it.
6. **OQ-006 had been stale since 2026-10-14**, and no execution since then had reached the signed approval. URS-006 and TM-001 still need a revision through change control.
7. **Notifications.** QMS route tasks reach my-work and the notice tray as Vault's do, and the tray's behaviour was not changed.
8. **An administrator who withdraws** reads as "an administrator" in the history. This is inherited from RR1a.
9. **Run-scoped evidence.** The OQ and acceptance organizations were seeded by a session-local fixture script, which is not in the repository. A product-side seeding path for validation organizations is still owed (it was already owed before RR4).

## Pre-existing failures, not caused by RR4

Both fail identically at the base export:
- `server/routes/ind-lifecycle/__tests__/dispatch-verdict-parity.pglite.test.ts` (5 tests);
- `server/services/part11/__tests__/one-signing-authority-policy.test.ts`: it flags the `isSigningAuthorized` call in `review-route-member.ts`, which RR1a added.

One run of the server suite also failed `route-writer-setting.gate.test.ts`. That run was concurrent with `ci:pushed-lint-warnings`, which briefly writes `__eslint_ratchet_prev__.*` copies of changed files into the tree, and the gate counted the copy of `review-route.ts` as a second setter. Re-run alone, it passes (`green/server-unit.txt`). So the ratchet and that gate must not share a tree at the same time.

`npm run validation:oq:selftest` needs a live identity (`VALIDATION_USER_EMAIL`), so it does not run without one. It covers `harness.mjs`, which this slice did not change.
