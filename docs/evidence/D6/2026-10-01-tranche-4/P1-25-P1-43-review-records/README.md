# P1-25 and P1-43: one governed review record (audit-trail review and access review)

Tranche 4, 2026-10-01. Row D6. Verified at HEAD `0812a990` plus this item's working-tree changes.

- **P1-25** is the audit-trail review: finding DP-21; EU GMP Annex 11 §9; FDA data-integrity guidance (2018) Q7.
- **P1-43** is the user access review: POLICY-AC-002 §4a; ADR-0014 §8, which asks for a quarterly review per organisation, with overdue reviews shown in the compliance reports.

## What was wrong

The product kept no record of either review.

- **Access review.** The user access review report said so in its own text: *"This report records no review decision, reviewer or sign-off. POLICY-AC-002 §4a keeps those in the access-review record."* No such record existed in the product. §4a pointed at Markdown files under `docs/evidence/D6/access-reviews/`, and none has been written.
- **Audit-trail review.** Nothing recorded one: no record, no reviewer, no sign-off, and nothing to show when one was overdue.

The red runs show the gap:

- `POST /api/audit/reviews` answered 404.
- Neither report had a review section.
- The surface offered no way to record a review.

## What changed

| Path | Change |
|---|---|
| `migrations/20261001_compliance_review_records.sql` (new) | `public.compliance_review_records`, with `organization_id INTEGER NOT NULL`. Columns: kind (`audit_trail` or `access`), period start and end, scope (jsonb), outcome, decisions (jsonb), reviewer, status (`draft` or `signed`), signature id, content hash, created at, signed at. Constraints are added by name only when absent. The guards are described under "The database guard" below. The file is additive and replayable: there is no DROP of anything another file creates, and it declares no RLS policy of its own because the sweep supplies it. |
| `scripts/db/migration-set.mjs` | One line, after `20261001_review_comments_record.sql` and before `UUID_TENANT_ISOLATION_NONPUBLIC`, so the tenant sweep gives the table `ENABLE`/`FORCE` RLS and `tenant_isolation_policy` (`green/migration-apply-twice.txt`). |
| `server/services/audit/compliance-reviews.ts` (new) | The draft schema. The content hash (`reviewContentHash`). Draft creation, with a chained `compliance.review_drafted` audit row on the same transaction. `signReviewAct`, the domain write that `signGovernedAct` runs. The access-review completeness check. The reads. |
| `server/routes/audit-compliance-reviews.ts` (new) | `GET /api/audit/reviews`, `GET /api/audit/reviews/:id`, `POST /api/audit/reviews` (draft), and `POST /api/audit/reviews/:id/sign`. Details are under "The routes" below. |
| `server/routes/audit-compliance-reports.ts` | Mounts the review routes inside `createComplianceReportRoutes` and hands them its own `sessionOrg` and `readerGate`. That means one gate, and no edit to `server/bootstrap/register-inline-routes.ts`. |
| `server/services/audit/compliance-reports/queries/review-record.ts` (new) | `latestSignedReview`: the latest signed review of a kind on or before an instant, with an `overdue` flag computed in SQL. `reviewSection` builds the report section from it. `GET /api/audit/reviews` calls the same function, so the screen and the reports cannot disagree. |
| `queries/access-review.ts` | Adds the `review` section ("Access review record"). Exports `readMembers` and `privilegedOf`, so that the completeness check reads the same "privileged" list the report prints. The purpose and the not-recorded sentence are corrected. |
| `queries/audit-trail-integrity.ts` | Adds the `review` section ("Audit trail review record"). Purpose updated. |
| `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx` (new) and `complianceReviewModel.ts` (new) | The "Periodic reviews" card and its **Record review** action. Details are under "The client" below. |
| `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx` | Renders the card under the catalog. |
| `client/src/concept2cure/v2/surfaces/complianceReportData.ts` | The `review_status` cell carries a tone (Overdue as an error, Current as ok). The word is always in the cell; the tone only repeats it. |
| `docs/security/policies/POLICY-IS-001-information-security.md` | New §3a, the audit-trail review: a quarterly procedure, recorded and signed in the product, with overdue reviews shown in the integrity attestation. Revision 0.3. |
| `docs/security/policies/POLICY-AC-002-access-control.md` | §4 row and §4a now point at the access-review record in the product. Platform operators (AWS, GitHub, secrets) stay on the Markdown record, because they sit outside any organisation. Revision 0.3. |

### The routes

- `GET /api/audit/reviews` returns the organisation's records, the latest signed review of each kind with `state` (`none`, `current` or `overdue`), and `canSign`.
- `GET /api/audit/reviews/:id` returns one record.
- `POST /api/audit/reviews` creates a draft.
- `POST /api/audit/reviews/:id/sign` is `signGovernedAct` with target `compliance-review:<id>` and domain `compliance`. It is mounted behind `signedActAttempts`. A meaning other than `review` is refused with 400 `SIGNATURE_MEANING_NOT_REVIEW` before the password is checked.

The gates:

- Reads use the compliance reports' own gate: a usable session organisation and `requireAuditReader`.
- Writes use the same organisation check, plus `requireAuditRecorder` and signing authority. Signing authority is `resolveSignerOrgRole` with `isSigningAuthorized`, the policy the ceremony itself enforces. A session that could not sign is therefore never left holding a draft.

### The database guard

- **Becoming signed needs a signature from the same transaction.** A row becomes `signed` only in the transaction that writes its electronic signature. That signature must be:
  - from the same organisation;
  - for target `compliance-review:<id>`;
  - by `reviewer_user_id`;
  - with meaning `review`;
  - with `manifest.act.contentHash` equal to `content_hash`;
  - not withdrawn;
  - written by this transaction (`created_at = LOCALTIMESTAMP`, the P0-18 pattern).

  This is checked at COMMIT by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger. The same check writes `signature_id`, which is the one change a signed row ever takes.
- **A signed row is fixed for every role, the table owner included.** No UPDATE except that binding, no DELETE, no TRUNCATE.
- **A draft carries no signature, hash or signing time** (CHECK).

### The client

- **Who sees it.** The card is shown only to members who may run reports. Nothing is read until it is opened.
- **Status.** It shows the server's status sentence for each kind. With none, it says "No … review recorded" and shows no date.
- **Decision lines.** For an access review, the lines are the privileged accounts of the user access review run on this screen. The draft names that sealed run by export id and data hash. For an audit-trail review, the lines are findings, each with what was done.
- **Signing.** The canonical `EsignModal` offers only the meaning *review*. A refusal is shown in the dialog with "Nothing was signed".

### Not changed, with reasons

- **`shared/constants/ui-surface-registry.ts`.** The routes are under `/api/audit`. The `compliance-reports` surface already claims that prefix (`ui-surface-registry.ui-v2.ts`), and it is `NEVER_GATED`. `ci:launch-scope-api --list` shows `never-gated /api/audit/reviews [compliance-reports]` (`green/gate-ci:launch-scope-api--list-review-paths.txt`). A second claim of a sub-prefix would only duplicate the first.
- **`EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`.** Its pinning tests do not allow the addition. Adding the two guard triggers for one run (then restoring the file byte for byte) failed two of them (`green/immutability-list-probe.txt`):
  - `provision-app-role-append-only.test.ts`: `expected [ 'public.compliance_review_records' ] to deeply equal []`. A guarded store must be on `APPEND_ONLY_TABLES` (`scripts/db/provision-app-role.mjs`, another lane's file) or on that test's `NOT_APPEND_ONLY` map.
  - `audit-immutability-triggers.pglite.test.ts`: `relation "public.organizations" does not exist`. Its harness applies every listed migration over minimal DDL.

  The exact change is listed under residuals.

## Tests

| Test | Red | Green |
|---|---|---|
| `tests/db/compliance-review-records.dbtest.ts`, real PostgreSQL as app_service with RLS on: the ceremony, its refusals and immutability | `red/review-records-and-reports.dbtest.txt`: 17 cases, all failing or skipped (404s) | `green/review-records-and-reports.dbtest.txt`: 17 of 17 |
| `tests/db/compliance-review-reports.dbtest.ts`: each report names the latest review, flags an overdue one, and gives no date when there is none | same file: 8 cases, all failing or skipped (no `review` section; 404) | same file: 8 of 8 |
| Mutants: the commit-time check dropped; the immutability guard function made a pass-through; the overdue interval widened from 3 to 6 months | — | `green/mutants.txt`: each mutant turns its cases red (2, 7 and 1 failures). After the migration is replayed, the triggers are back and 15 of 15 pass |
| `client/src/concept2cure/v2/__tests__/complianceReviewRecords.test.tsx`: the Record review action through the real surface and the real `EsignModal` | `red/client-record-review.txt`: 7 of 8 fail with the card unmounted. The 8th is the negative case "not offered" | `green/client.txt`: 51 of 51 across the three compliance report client suites |
| `server/services/audit/__tests__/compliance-reviews.test.ts`: draft rules and content hash | No red: these pins were written after the module, so a red run would only be an import failure | `green/server-unit.txt` |
| Existing pins updated for this change: `review-round-1.test.ts` (the not-recorded sentence) and `audit-compliance-reports.test.ts` (the `review` section in the run's audit row) | Both failed on the change before their update, as expected | `green/server-unit.txt`: 153 of 154. The one failure is explained below |
| Neighbours: `tests/db/compliance-reports.dbtest.ts` and `tests/db/qms-document-signature-required.dbtest.ts` | — | `green/neighbour-dbtests.txt`: 30 of 30 |
| Migration applied twice with the sweep, through `applyMigrationFiles` | — | `green/migration-apply-twice.txt` (scripts: `apply-one-file.mjs`, `mutants.sh`) |

The ceremony case asserts all of the following:

- The record, the signature and the ledger pair carry one `xmin`, so they were written by one transaction.
- `content_hash` re-derives from the stored row by the documented recipe.
- The signature manifest's `act.contentHash` equals it.
- The binding basis is `governed-action-sha256-chain`.

The one failure in `green/server-unit.txt` is `review-round-1.test.ts > the SCIM group handler is where the test thinks it is`. It is not this item's. That test reads `server/routes/scim.ts`, which another lane has uncommitted edits to: `git show HEAD:server/routes/scim.ts` has the `UPDATE organization_users SET role` literal twice, and the working tree has it zero times.

## Gates

All gates were run on the working tree and their outputs are in `green/`.

| Gate | Result |
|---|---|
| `eslint --max-warnings 0` on the 17 changed and new files | 0 problems (`green/eslint.txt`) |
| typecheck of the 17 files and their imports (not a full-project tsc) | 0 errors in this item's files (`green/tsc-subset.txt`; the 8 remaining are ambient declarations outside the subset, in untouched files) |
| `check:security-patterns`, `ci:server-error-leaks`, `ci:sign-ceremony`, `ci:unreferenced-modules`, `ci:migration-set-order`, `ci:migration-drop-safety`, `db:sync-manifest:check` | pass |
| `ci:untracked-imports` | pass, but it only compares commits. `--all` lists this item's three new modules as on disk but not in git; they must be committed with the files that import them |
| `ci:launch-scope-api` | fails on `/api/tenant-config/:p/claude-connector` (another lane's `ClaudeConnectorSetting.tsx`, untracked). This item's paths are `never-gated [compliance-reports]` |
| `ci:tenant-isolation:no-regression` | fails on `server/routes/setup.ts`, a file this item does not touch. `ci:tenant-isolation` passes |
| `ci:purge-coverage` (local `c2c_testdb`) | fails, and this item adds to it: `compliance_review_records` is a new org-keyed table the tenant purge cannot reach. `ana_record_blobs` and `ana_turn_records` were already listed. See residual 1 |
| `ci:migration-deploy-path`, `ci:column-reachability`, `ci:runtime-ddl`, `ci:json-operator-types`, `ci:drizzle-tenant-scope`, `ci:undefined-css-classes`, `ci:unauthenticated-fetch`, `ci:session-scoped-rls-bypass`, `ci:fixture-fallback`, `ci:no-mock-in-prod-routes`, `ci:fabricated-identity`, `ci:discarded-audit-write`, `ci:client-ip-single-source`, `ci:migration-prefix-collisions`, `ci:migration-reachability`, `ci:db-test-isolation`, `ci:internals-in-copy`, `ci:empty-state-honesty`, `ci:success-before-ok`, `ci:check-client-api-calls`, `ci:error-envelope`, `ci:route-ownership-matrix:check`, `ci:audit-route-mounts:no-regression`, `ci:tenant-isolation`, `ci:rls-allowlist-sync`, `ci:unbacked-tables`, `ci:writerless-stores`, `ci:dead-audit-tables`, `ci:insert-columns-declared`, `ci:model-migration-agreement`, `ci:check-unrun-tests`, `ci:check-test-imports`, `ci:tenant-entry-points`, `ci:tenant-column-types`, `ci:duplicate-table-ddl`, `ci:check-route-collisions` | pass |

## What remains

1. **Tenant purge (`ci:purge-coverage`).** Closed in the fix round below (DP-70): the record is retained, with the reason in the baseline, the migration header and both policies, and the tenant export is shown to return it.
2. **Binding basis of the signature.** The content hash is bound through the signature manifest, which `signature_hash` covers and the database checks. `bound_payload_digest`, however, is still the ledger chain hash (`governed-action-sha256-chain`), because `deriveGovernedTargetBinding` has no case for `compliance-review`. To bind it as its own basis:
   - add `COMPLIANCE_REVIEW_CONTENT: 'compliance-review-content-sha256'` to `BINDING_BASIS` in `server/services/part11/signature-persistence.ts`;
   - add a `case 'compliance-review':` that reads the row (id and organization_id, dates as `YYYY-MM-DD`) and returns `sha256CanonicalJson` of the members `reviewContentHash` uses;
   - restate the members there, or move the recipe to a module both files import (importing `compliance-reviews.ts` from there would be circular);
   - change the basis assertion in `compliance-review-records.dbtest.ts`.
3. **The immutability list.** To have the boot gate and the daily sweep require this table's guard, add `trg_compliance_review_records_guard` and `trg_compliance_review_records_no_truncate` to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`, and also:
   - add `'public.compliance_review_records': 'a draft is updated until it is signed; a signed row is fixed by trg_compliance_review_records_guard (20261001_compliance_review_records.sql)'` to `NOT_APPEND_ONLY` in `server/db/__tests__/provision-app-role-append-only.test.ts`;
   - add `organizations`, `users` and the table's prerequisites to the PGlite harness's `STORES_DDL`, or give that harness a guard for files whose foreign keys it cannot satisfy.
4. **Drafts.** There is no route to edit or discard a draft. A refused or abandoned draft stays as a `draft` row (the list shows it), and the client makes a new draft when the content changes.
5. **Separation of duties.** It is not enforced: an administrator may review an access list that includes their own account. POLICY-AC-002 §4a asks operators to review each other once there are two; tenant reviews have no such rule yet.
6. **Role history.** Superseded by the fix round below (DP-69): the lines and completeness are checked against current roles and memberships, at drafting and again at signing. A role on a past date is not reconstructed (role changes have been recorded since P1-41 and P1-49, but the review does not read them back), so a past role is not checked.
7. **Documents this item did not edit.** The remediation plan rows for P1-25 and P1-43, and the regulatory control map rows for Annex 11 §9 and §12 (`docs/security/`), still describe these controls as absent. The control tower updates them.
8. **Commit together.** The new files must be committed with the files that import them: the migration, the two server modules, the query module, the two client modules, the four test files, the fixture, and this directory.

## Fix round (2026-10-01): DP-69 and DP-70

Red runs are in `red/fix-round/`, green runs in `green/fix-round/`. All were taken on the shared working tree at HEAD `0812a990`.

### DP-69: what was wrong

A signed review read "Current" whatever period it covered. The check that every privileged account has a decision was made as of a period end the reviewer chose. The verifier reproduced this with three probes on this item's own stack, and each one was drafted and signed with 201:

- **(a)** An access review of 2000-01-01. It had one line, for user 999999, who is not a member, and it named an export id that never ran. Afterwards `GET /api/audit/reviews` said `current`, next due 2027-01-01.
- **(b)** An audit-trail review of 1999-01-01, with no findings and outcome `n/a`. Afterwards the integrity attestation said `Current`.
- **(c)** An access review ending yesterday, with one line, for a plain member. The member list was read as of the period end, so administrators who joined since then were not required.

The causes:

- **The draft schema.** It only required that the period end is on or after the start and no later than today.
- **The lines.** They were never checked against the organisation. `accessDecision` checked their shape only.
- **The run reference.** `scope.reportExportId` and `reportDataHash` were accepted without being looked up.
- **The clock.** `current` and `overdue` were computed from `signed_at`.
- **The copy.** The refusal text, POLICY-AC-002 §4a and the report note described the check as "as of the end of the period", but it uses current roles (DP-51).

### DP-69: what changed

| Path | Change |
|---|---|
| `server/services/audit/compliance-reviews.ts` | `assertReviewable` runs when a review is drafted, and again when it is signed. At signing it runs on the stored draft, under its row lock, after the draft has been read back through the same schema (`storedDraft`; a draft that no longer parses gets `REVIEW_RECORD_INVALID`). It checks four things, described in the next table. All the new refusals are 409, and each says "Nothing was recorded." or "Nothing was signed." |
| `server/services/audit/compliance-reviews.ts` (schema) | `scope.reportExportId` and `scope.reportDataHash` are required for both kinds. A missing reference gets 400 `REVIEW_INVALID`, naming the field. A reduce must leave a different role than the one reviewed. |
| `server/services/audit/compliance-reports/queries/review-record.ts` | `nextDueSql(periodEnd)` (period end plus three months) is the one definition of the due date. The latest review is the one covering the most recent period (`ORDER BY period_end DESC`). It is overdue once the report's date is past the whole of its due date. The section notes now say this, and say "current roles and memberships". |
| `server/services/audit/compliance-reports/catalog.ts`, `server/routes/audit-compliance-reports.ts` | `REPORT_RUN_ACTION` and `REPORT_RESOURCE_TYPE` move to the catalog, so the service can look a run up without importing a route module. The route imports them and re-exports them. |
| `shared/constants/compliance-review.ts` (new) | `ReviewKind`, and the report each kind names. One definition for server and client; the client's `SOURCE_REPORT` copy is gone. |
| `client/src/concept2cure/v2/surfaces/complianceReviewModel.ts`, `ComplianceReviewRecords.tsx` | An audit-trail review is not offered for signing until the integrity attestation has been run on the screen. The form's period starts the day after the last signed review of that kind ended (`periodFor`), so the form does not lead into a gap refusal. The card states when a review is due. |
| `docs/security/policies/POLICY-AC-002-access-control.md` §4a, `POLICY-IS-001-information-security.md` §3a | Describe what is checked and when. The due date runs from the end of the period reviewed. The records are kept at offboarding. Revision rows updated. |

The four checks:

| Check | Rule | Refusal |
|---|---|---|
| The period | It ended no more than three months ago, because a review of an older period would be overdue the day it is signed. It starts no later than the day after the last signed review of its kind ended, so no days go unreviewed. | `REVIEW_PERIOD_STALE` names the date the next review would have been due. `REVIEW_PERIOD_GAP` names the day to start from. |
| The named run | It is this organisation's `compliance.report_run` audit row for the matching report (user access review, or audit trail integrity attestation), with that export id and data hash. | `REVIEW_REPORT_NOT_FOUND` |
| The lines (access review) | Checked against the organisation's current roles and memberships; see "The decision on lines" below. | `REVIEW_LINE_MISMATCH`, with `lines: [{userId, problem, holds?, held?}]` |
| Completeness (access review) | Every account that holds an owner, admin, manager or platform role now has a line. The list as of any past period end is a subset of the current one: a membership row is only ever removed, and both lists read current roles. | `REVIEW_INCOMPLETE`, with `missingUserIds` |

### The decision on lines, and why it is not exactly "role equals current role"

The finding asked that every line be refused unless it names a member whose current role matches. Applied literally, that rule makes a carried-out change impossible to record:

- a removed account is no longer a member;
- a reduced account no longer holds the role it was reviewed in.

Yet the record's own field is "the change that carried it out", and POLICY-AC-002 §4a says a review is complete when every remove or reduce has landed. So each line is checked against the state the decision claims:

| Decision | Accepted when | Otherwise |
|---|---|---|
| keep | the account is a member and holds the line's role | `not_member` or `role` |
| reduce | the account is a member and holds the role the line says it keeps, so the change is in effect | `reduce_not_carried_out` if it still holds the reviewed role; `role` otherwise |
| remove, account still a member | it holds the line's role and its account is deactivated (the single-organisation SCIM path) | `remove_not_carried_out` |
| remove, account no longer a member | this organisation recorded the removal: a `member_removed` audit row, whose `previousRole` must equal the line's role, or a SCIM `scim.user.deactivated` event | `not_member`, or `removal_role` when the recorded role differs |

No line for a user id the organisation has no record of passes.

### DP-70: the tenant purge and the review records

- **Decision: retain.** A signed review is a quality-system record bound to an electronic signature, and the purge also keeps `electronic_signatures`. It evidences a regulated action, so it falls under the audit-trail retention in DPA §3.5 (GDPR Art. 17(3)(b); 21 CFR 11.10(c); Annex 11 §17).
- **Why not erase.** The signed-row guard refuses DELETE, so adding the table to `PURGE_CHILD_TABLES` would make the purge fail for every organisation with a signed review. Erasure would need a SECURITY DEFINER door like `purge_tenant_artifact_records`. That remains open as a product decision; see residual 4.
- **Where the reason is written:**
  - `docs/reports/purge-coverage-baseline.json`: the table, and the reason under a new `retained` key;
  - the migration header (a dated note, comment only);
  - POLICY-AC-002 §4a and POLICY-IS-001 §3a.
- **The export returns it.** `exportTenantFull` finds the table from the catalog. The DP-70 case runs the real export for organisation A and finds every one of its review records in it, signed ones included.
- **`ci:purge-coverage`:**
  - before (`red/fix-round/ci-purge-coverage.txt`): `ana_record_blobs, ana_turn_records, compliance_review_records`;
  - after (`green/fix-round/gate-ci:purge-coverage.txt`): `ana_record_blobs, ana_turn_records` only. Those two belong to other lanes, and the gate still exits 1 on them.

### Fix-round tests

| Test | Red, before the change | Green, after |
|---|---|---|
| `tests/db/compliance-review-fix-round.dbtest.ts` (new), on real PostgreSQL as app_service with RLS on. It has 26 cases: probes (a), (b) and (c) as found; each rule on its own with an otherwise valid review; the carried-out reduce and remove paths; the clock; the gap; three signing-time re-checks (a role changed after the draft, a period made stale after the draft, and a stored draft that no longer parses); and the DP-70 export | `red/fix-round/review-fix-round.dbtest.txt`: 19 of the first 25 failed, each with 201 where a refusal is due, or `current` where `overdue` is due. The 6 that passed are controls: the four carried-out paths, the accepted next period, and the export. The 26th case (a stored draft that no longer parses) was added after the change, for a branch the change added; its red is mutant M6 below | `green/fix-round/review-dbtests.txt`: 26 of 26 |
| `compliance-review-records.dbtest.ts` and `compliance-review-reports.dbtest.ts`. The shared fixture now makes memberships afresh each run, runs one sealed report of each kind, names it in every draft, and lays down old signed reviews through `laySignedReview`; the reports test's ceremony review starts on 2026-06-01, after its historic review | `red/fix-round/existing-suites-new-fixture-unfixed-code.txt`: 25 of 25 on the unfixed code, so the fixture change alone breaks nothing | `green/fix-round/review-dbtests.txt`: 25 of 25 (51 of 51 with the new file) |
| `server/services/audit/__tests__/compliance-reviews.test.ts`: the reference is required for both kinds, and a reduce must change the role | `red/fix-round/server-unit.txt`: 3 failed | `green/fix-round/server-unit.txt`: 136 of 136, with the compliance-report unit suites and the route test |
| `client/.../complianceReviewRecords.test.tsx`: an audit-trail review is not signed without the attestation run, and it names that run and starts the day after the last one ended | `red/fix-round/client.txt`: 2 failed | `green/fix-round/client.txt`: 53 of 53 across the three compliance-report client suites |
| Neighbours: `compliance-reports.dbtest.ts` and `qms-document-signature-required.dbtest.ts` | — | `green/fix-round/neighbour-dbtests.txt`: 30 of 30 |

**Mutants on the fixed code.** `mutants-fix-round.sh` undoes one piece at a time, runs the suite, and restores the file from a copy. The output is `green/fix-round/mutants.txt`, which ends with a sha256 check that both files came back byte for byte. Each mutant turns its cases red:

| Mutant | Cases that go red |
|---|---|
| M1: signing no longer re-checks the record | the three signing-time cases |
| M2: the clock runs from `signed_at` again | the overdue case |
| M3: completeness read as of an earlier day | probe (c) |
| M4: lines not checked | 6 line cases |
| M5: the named run not looked up | 4 run cases |
| M6: the stored draft is signed without being read back through the draft schema | the unparseable-draft case (it is still refused, by the run check, but with the wrong code) |

### Fix-round gates (`green/fix-round/`)

| Gate | Result |
|---|---|
| `eslint --max-warnings 0` on the 14 files this round touched | 0 problems |
| typecheck of those 14 files and their imports | 0 errors in this item's files; the same 8 ambient-declaration lines as round 1, in untouched files |
| `check:security-patterns`, `ci:server-error-leaks`, `ci:sign-ceremony`, `ci:unreferenced-modules`, `ci:untracked-imports`, `ci:migration-set-order`, `ci:migration-drop-safety`, `db:sync-manifest:check`, `ci:json-operator-types`, `ci:tenant-isolation`, `ci:empty-state-honesty`, `ci:internals-in-copy`, `ci:check-client-api-calls`, `ci:discarded-audit-write`, `ci:check-unrun-tests`, `ci:db-test-isolation`, `ci:check-test-imports`, `ci:runtime-ddl`, `ci:column-reachability`, `ci:fixture-fallback`, `ci:no-mock-in-prod-routes`, `ci:error-envelope`, `ci:success-before-ok`, `ci:migration-prefix-collisions`, `ci:migration-reachability` | pass |
| `ci:launch-scope-api` | fails only on `/api/tenant-config/:p/claude-connector`, another lane's untracked `ClaudeConnectorSetting.tsx`. `/api/audit/reviews` is `never-gated [compliance-reports]` |
| `ci:purge-coverage` | fails only on `ana_record_blobs` and `ana_turn_records`, which belong to other lanes. `compliance_review_records` is no longer listed |
| `ci:untracked-imports --all` | lists this item's new modules as on disk but not in git. They are committed together, with `shared/constants/compliance-review.ts` |

### What remains after the fix round

1. **`check-purge-coverage.mjs --write-baseline` drops the `retained` key.** It writes only `generatedAt`, `purgeChildTables`, `count` and `tables`. This item does not own the script. It should carry `previous.retained` forward and fail when a retained entry has no reason.
2. **`server/services/tenant/tenant-offboarding.ts`.** The module comment that lists what the purge keeps should name `compliance_review_records`, with the DPA §3.5 reason. This item does not own the file.
3. **The first review of each kind.** It has no earlier review to be continuous with, so its start date is the reviewer's choice. Only its end is bounded, to the last three months.
4. **Erasure instead of retention.** If the founder wants the records erased at offboarding, the path is a SECURITY DEFINER door like `purge_tenant_artifact_records`, after the export. ADR-0014 §6 says the export transfers the retention obligation to the tenant. DPA §3.5 keeps audit-trail records, and this item reads a signed review as one of those.
5. **What the lines cannot check:**
   - the role a reduced account held before the change (only the role now in effect is checked);
   - the role of an account removed through SCIM, because the SCIM event records none;
   - whether the named run's own period matches the review's period.
6. **Unchanged from round 1:** items 2 (binding basis), 3 (immutability list), 4 (no route to discard a draft), 5 (separation of duties), 7 (plan and control-map rows) and 8 (commit together).

## After the push: the C-33 replay (2026-10-01, evening)

`npm run test:proof-tier`, run by the control tower after the push, failed one contract:
`tests/schema-contract/tenant-isolation-sweep.contract.test.ts`, "C-33: the batch applies in set order, twice"
(`c33/red-c33-pass1.txt`: `pass 1: migrations/20261001_compliance_review_records.sql failed — column
es.superseded_by does not exist`). C-33 replays the set from `db/migrations/022_stability_v2.sql` (index 76) on a
PGlite fixture whose `electronic_signatures` comes from the drizzle journal, without the gate columns
`db/migrations/20260725_esig_gate_columns_port.sql` adds at index 41. This file's signature lookup,
`compliance_review_signature_of`, was `LANGUAGE sql`, whose body PostgreSQL checks at creation.

Fixed in the creating migration, in place, with a dated header note (CLAUDE.md Rule 1): the function is
`LANGUAGE plpgsql`, the same query, checked at its first call. Applying the port in the fixture instead was tried
and does not work: the port needs `submission_orchestrator_runs`, which the fixture does not have.

- `c33/green-c33.txt`: C-33, 19 passed.
- `c33/replay-local.txt`: the amended file applied to the local database as `postgres`; a second replay also exits 0,
  and the function is `plpgsql`.
- `c33/green-review-dbtests.txt`: the three review suites on PostgreSQL as `app_service` with RLS on, 51 passed,
  signing through the guard included.
- `db:sync-manifest:check`, `ci:migration-drop-safety`, `ci:migration-set-order`: OK.
