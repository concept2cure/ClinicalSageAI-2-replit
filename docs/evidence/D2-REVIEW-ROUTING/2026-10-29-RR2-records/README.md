# RR2 records: an interim approval is its own record, and the Vault sign-off lines name every signer (D2, 2026-10-29)

This fixes the two record defects in RR2's design issues 1 and 2 (`../2026-10-29-RR2/README.md`). It follows `docs/design/REVIEW_ROUTING_2026-10-23.md` §2.12 and §8 (B6). Launch row **D2**, workstream W2 (review routing), 21 CFR Part 11 §11.50.

1. **Part 11: an interim approval was recorded as a final one.** On a route with several approvers, every approval but the last leaves the SOP or the Vault version in review. That earlier approval was written with the final approval's signature type. So:
   - the audit trail said "Controlled document approved (e-signature)";
   - the controlled-document register named it as the approval of an SOP still in review. The red run shows `approval_signer_name` "Quinn Qa", `approval_signature_id` 51, `status` in_review (`red/qms-records.detail.txt`).
2. **The Vault "Review signed by" line named one reviewer.** It reads `review_signature`, which the append-only guard admits once per round, so it named only the signature that completed the review.

| Commit | What |
|---|---|
| `cef786a3f` | Gate repair, separate so it can be dropped: `ci:tenant-isolation:no-regression` was red at `37c17a3f0` (from `1371823ee`, MR-08). The classifier's filing UPDATE in `vault-placement.service.ts` had no organization predicate; it now has one. `vault-processing-sweep.dbtest.ts` is 16 of 16. |
| `6549fe2b5` | The interim approval as its own record (QMS and Vault), and every reader fixed. |
| `b8f8aca1c` | The Vault sign-off lines from the round. |
| this commit | Evidence, and dated notes in the design (§2.12) and in RR2's README. |

## What already exists

Searches run before any design:
- `qms-document-approval`, `regulated-document-lifecycle`, `LIFECYCLE_SIGNATURE_TYPE`, `signature_type`, `SIGNED_EVENT`, `linkedSignatures`, `approvalsRecorded`, `approvalsRequired`, `of 2 required`, `interim`, `partial approval`, `approval share`, `review_signature`, `Review signed by`, `signOffLine`, `LifecycleSummary`, `reviewSignOffs`, `lineage`, `by-target`, `approval_signature_id` and `approved by`;
- over `server/`, `shared/`, `client/src`, `migrations/`, `db/migrations/`, `scripts/`, `tests/` and `docs/validation/`;
- `git log --all --diff-filter=D` on `*approval-share*`, `*interim*`, `*SignOff*` and `*signoff*`. Nothing was deleted under these names.

| Existing piece | Path | What it did | What this change did |
|---|---|---|---|
| The QMS approval writer | `approveQmsDocumentSigned` (`server/services/qms/document-approval-signature.ts`) | RR2: every approval was a `qms-document-approval` signature. An earlier one wrote no stamp and no status change, and its share was only in the ledger payload. | **Fixed in place.** An earlier approval is a `qms-document-interim-approval` signature. Its manifest states `approvalsRecorded` and `approvalsRequired` (covered by the §11.200 hash), and its compliance statement says it does not approve. The last one keeps `qms-document-approval` and states its share. The choice is one helper, `approvalSignatureRecord`. |
| The QMS route's share | `qmsApprovalRoute.before` (`server/services/qms/qms-review-route.ts`) | Counted the approvers inline | **Converged** onto `shareOfNextApproval` (`server/services/review/approval-share.ts`), which the Vault uses too |
| The Vault lifecycle signature | `recordLifecycleSignature` (`server/routes/document-lifecycle.ts`), `routedSignOff` (`document-lifecycle-review-route.ts`) | Every approval was `regulated-document-lifecycle`, and its share was recorded nowhere | **Fixed the same way.** An earlier approval is `regulated-document-lifecycle-interim-approval`, and every routed approval states its share in the ledger payload and the manifest. The routed sign-off rolls back if the share it recorded disagrees with what the route then says. |
| Route verification | `routeStanding`, `verifiedSignature` (`review-route-standing.ts`) | Verifies a member's signature by meaning, signer, digest and target, not by type | Unchanged. The meaning stays APPROVED, so an interim signature still counts on its route. |
| The P0-18 guard | `migrations/20261001_qms_document_signature_required.sql` | Effective only on the transaction that writes a `qms-document-approval` | Unchanged. The final approval keeps that type, and an interim one cannot satisfy it. **No migration.** |
| The audit trail | `linkedSignatures`, `SIGNED_EVENT` (`server/routes/audit-trail-ledger.routes.ts`); also the admin console's audit band (`mdx-admin.ts`), which imports it | Labelled every `qms-document-approval` "Controlled document approved (e-signature)". A Vault approval took the audit row's own name. | **Fixed.** An interim approval reads "Controlled document approval signed, 1 of 2 required; the document is not yet approved (e-signature)", or "Version approval signed, …; the version is not yet approved (e-signature)" for a Vault version. This holds for the new type and for a stored row. |
| The controlled-document register (compliance report) | `queries/controlled-documents.ts` | The latest approval of the version, the revoked count and the in-force approval took any `qms-document-approval` | **Fixed.** Interim approvals are excluded from all three, and a new column, `interim_approvals`, lists each one as "name · k of n required · time" |
| The electronic-signature register (compliance report) | `queries/electronic-signatures.ts` | Type and meaning only | **Fixed.** Adds `approval_share` ("1 of 2") and `interim_approval` columns. |
| The other six compliance reports | `access-review`, `authentication-events`, `administrative-changes`, `audit-trail-integrity`, `retention-legal-holds`, and the full audit trail (`/api/audit/export/signed`) | Read no signature type or label (the full trail exports raw audit rows) | No change needed; see "Not changed" |
| The §11.50 read by target | `GET /api/part11/signatures/by-target` (`server/routes/part11-compliance.ts`), the read OQ-QMS-05b and an inspector use | Raw rows | **Fixed.** Adds `approvals_recorded`, `approvals_required` and `interim_approval`. |
| The QMS register "approved by" line | `readQmsReleaseApprovals`, `judgeApproval` (`current-release-approval.ts`, 5b7a6a79c), `register-signatures.ts`, `RegisterSignatureLine.tsx` | Takes exactly one `qms-document-approval` whose signer and time are the document's `approver_id` and `approved_at`, which only the final approval stamps | **Not defective**, so not changed. A DB test pins it: no line while 1 of 2, and the last approver once effective. |
| Training and periodic review | the same exact reader; `periodic-review.ts` (its own type) | Final approval only | Unchanged |
| Lineage | The QMS version lineage (`GET /qms/documents/:id/versions`, `qms_document_versions.signature_id`) and the Decision Lineage surface (`/api/decision-lineage`) | The first records only the signed version, whose signature is the final approval. The second reads its own store, not `electronic_signatures`. | Unchanged |
| Exports | Compliance CSV and sealed snapshot (`csv.ts`, `snapshot-export.ts`); the report package's Vault approval (`report-os/report-package.ts`, `lifecycle.approval`) | The first two are built from the report sections. The third is the final approval. | Fixed through the reports; the others unchanged |
| The Vault sign-off line | `readVaultLifecycles` (`server/services/vault/vault-lifecycle.ts`), `LifecycleSummary` (`client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx`) | One line from `review_signature` and one from `approval_signature` | **Completed.** `roundSignOffs` returns every reviewer (and, once approved, every approver) who signed on the round. The client shows one line per signer. A version with no route, an unread route, or a sign-off carried from Authoring keeps today's line. `review_signature` and the append-only guard are untouched. |
| OQ helpers | `tests/validation/oq/qms/signed-acts.mjs` `isApprovalRow` | Keys on `qms-document-approval` | Unchanged: OQ-006 names one approver, whose approval is the final one |

## Existing rows: which approach, and why

**Approach: no stored signature is rewritten. Readers derive "interim" from the route, as k < n at the time of signing.** Signatures are immutable, and the brief forbids rewriting them.
- k is the number of the route's approvers whose stamped signature was signed at or before this one, by `(signed_at, id)`.
- n is the number of approvers the route names.

The derivation is one SQL fragment, `approvalShareJoin` (`server/services/review/approval-share.ts`), which every SQL reader above joins. A signature that states its share in its manifest (every routed approval from this change on) is read from the manifest instead.

Why the route, and not the QMS ledger payload's `approvalsRecorded`:
- **One derivation for both subjects.** The Vault ledger never recorded a share.
- **It stays stable after signing.** The member rows are written only by the route (the `20261023` guard). A reassignment keeps the row. Adding a reviewer cannot add an approver and is refused once an approval is signed.
- **Same rule as the writer.** It is the rule `shareOfNextApproval` applies under the row lock.

A stored approval whose co-approver never signed (the route was then withdrawn) stays interim. A signature on no route is read as final, which every one stored before RR2 is.

## Red → green

Red runs are at `37c17a3f0` with only the new test cases added. Unit tests ran with `RLS_ENFORCE=off`. DB tests used the RR1a method, below.

| Behaviour | Test | Red | Green |
|---|---|---|---|
| The audit trail labels an interim approval k of n: the new QMS type, a stored QMS row read from its route (earlier interim, last approved), a stored row whose co-approver never signed, and a Vault interim (typed and stored). A review is not relabelled. | `server/routes/__tests__/audit-trail-ledger.routes.test.ts` (new `describe`, moved out of the existing one after the red run for the function-length limit) | `red/ledger-labels.txt`: 4 of 4 fail; the stored row reads "Controlled document approved" | `green/unit-and-client.txt` |
| QMS: the earlier approval is `qms-document-interim-approval` with 1 of 2; the last is `qms-document-approval` with 2 of 2 | `tests/db/review-route-qms-rr2.dbtest.ts` | `red/qms-records.dbtest.txt` | `green/dbtests.txt` |
| QMS readers on the real path while 1 of 2 and after 2 of 2: the record history label, the controlled-document report (no approval while in review, `interim_approvals` names Quinn Qa), the e-signature register (`interim_approval`, `approval_share`), the by-target read, and the QMS register line | same | `red/qms-records.detail.txt` (8 reader assertions fail). `red/qms-by-target.dbtest.txt`: the by-target assertions, with only `part11-compliance.ts` reverted. | same |
| QMS: an earlier approval stored as `37c17a3f0` wrote it (the real writers, the final type, no share in the manifest) is read as interim by every reader, and the route still counts it, so the next approval is the last | same | same | same |
| Vault: the earlier approval is `regulated-document-lifecycle-interim-approval` with 1 of 2 in the manifest and the ledger; the record history labels it k of n, never as the approval | `tests/db/review-route-vault-rr2.dbtest.ts` | `red/vault-records.dbtest.txt` | `green/dbtests.txt` |
| Vault: two reviewers and two approvers; each line names everyone who signed, with printed name, meaning and UTC time. A reviewer added after the review was signed off is on the line, and `review_signature` is not rewritten. | same | same: `reviewSignOffs` is undefined, and `review` names only Remy R2 | same |
| No route, an unread route, a carried sign-off or a sign-off from another round: today's line | `server/services/vault/__tests__/vault-lifecycle-round-unread.test.ts` | `red/vault-signoff-lines.unit.txt` | `green/unit-and-client.txt` |
| The client shows one line per reviewer and per approver | `client/src/concept2cure/v2/__tests__/vaultLifecycle.test.tsx` | `red/client-signoff-lines.txt` | same |

**One RR2 test was changed, and why.** RR2's two-approver QMS test asserted that both approvals were `qms-document-approval`, which was RR2's decision 2 and is the defect itself. It now asserts `['qms-document-interim-approval', 'qms-document-approval']`. Its other assertions are unchanged.

**The checks were made to fail** (`green/mutation-*.txt`):
- **M1:** read the share from the manifest only, without the route. Every stored-row case fails: three ledger unit cases and the stored-row DB case, on the trail, the report, the register and by-target. The rows written now still pass.
- **M2:** drop the interim exclusion from the report's approval columns. The stored-row case fails, with the SOP in review named as approved.

Both were restored before the green runs.

Regression on the final tree:
- `green/dbtests.txt`: **19 files, 208 passed, 4 failed.** This covers every review-route suite (RR1a, RR1b, RR2, RR3, RR4 and the guard), every QMS DB suite, `compliance-reports`, `vault-lifecycle`, `canonical-documents-append-only`, `mdx-qms-request-rls`, `task-filing-home`, `admin-change-audit` and `memberships`.
  - The 4 failures are QMS retirement. These tests send the meaning `APPROVED`, which P-51 (`cd95dc9e6`, earlier today) refuses (`ESIGNATURE_COMPONENT_MISSING`: the meaning must be 'retirement').
  - They fail the same way at `37c17a3f0` with this change stashed (`green/preexisting-retire-failures-at-base.txt`). This change does not touch retirement.
- `green/unit-and-client.txt`: the server unit files that reach a changed module, the review and Vault lifecycle unit tests, every `quality/` client suite and the v2 Vault and review client suites.

## How the tests were run

- **Unit and client:** `RLS_ENFORCE=off npx vitest run <files>`.
- **DB:** the RR1a README's method.
  - `scripts/db/provision-test-db.sh` built a fresh deploy-shaped database: install-fresh and deploy-migrate, pgvector, and `app_service` NOSUPERUSER NOBYPASSRLS.
  - It was renamed to the recorded-disposable `platform_ci_vault_fixture_rr2rec`.
  - It was run with `RLS_ENFORCE=on`, `TEST_DATABASE_URL` as the owner, `APP_DATABASE_URL` as `app_service` and `C2C_VAULT_LEGACY_FIXTURE_DATABASE` set: `npx vitest run --config vitest.db.config.ts <files>`.
  - The stored-row case writes its legacy signature through the real `recordGovernedAction` and `persistGovernedActionSignature`, on the owner's transaction, with the route writer's setting (`c2c.review_route_writer`) set for that one transaction only. The code that wrote that shape no longer exists.

## Gates (`gates.txt`)

All exit 0 before each commit, and over the commits. No baseline was raised:
- `ci:pushed-lint-warnings`, `ci:pushed-lint-errors`, `ci:sql-interpolation`, `ci:undefined-css-classes`, `ci:untracked-imports`, `ci:sign-ceremony`, `ci:tenant-isolation:no-regression`;
- the full typecheck, `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p tsconfig.check.json`.

Two refusals while building were fixed, not baselined:
- `approveQmsDocumentSigned` reached complexity 18. The record choice moved into `approvalSignatureRecord`.
- The ledger test's `describe` passed 100 lines, so the new cases became their own `describe`.

`ci:tenant-isolation:no-regression` was red at `37c17a3f0` on a file outside this change, so it was repaired in its own commit (`cef786a3f`).

## OQ (`oq/`)

This change alters no step's expected result in OQ-002 v0.15 or OQ-006 v0.8:
- both send routes with one approver, whose approval is the final one and keeps its type;
- the manifest gains `approvalsRecorded`/`approvalsRequired`;
- the by-target read gains three columns.

So neither protocol is revised. Both were executed against a private instance of the working tree:

| Protocol | Result |
|---|---|
| OQ-002 Vault v0.15 | **24 pass, 0 fail, 0 deviation, 0 not-executed** (`oq/vault/transcript.txt`, record in `oq/vault/OQ-VAULT/`) |
| OQ-006 QMS v0.8 | **21 pass, 1 fail, 0 deviation, 0 not-executed** (`oq/qms/`). The fail is **OQ-QMS-10**: "signed retire expected 200, got 400". The step signs a retirement with the meaning `APPROVED`, which P-51 now refuses. The same run against `37c17a3f0` gives the same 21 pass and the same OQ-QMS-10 fail (`oq/qms-at-base/`). The revision OQ-QMS-10 needs belongs to P-51, not to this change. |

**Instance:**
- `localhost:5211`, database `c2c_rr2rec_instance` from `provision-test-db.sh`;
- `NODE_ENV=development`, `RLS_ENFORCE=on`, runtime role `app_service`;
- dev-login refused (`ALLOW_DEV_AUTH=0`; `/api/auth/dev-login` 404).

**Identities:**
- `oq-runner@validation.local` (admin), `oq-signer@validation.local` (approver role, the QMS stand-in, D-Q) and `oq-approver@validation.local` (approver), in a synthetic organization. They were seeded by `scripts/seed-admin.mjs`, and the launch modules were granted by `scripts/ops/provision-launch-modules.ts`.
- Each enrolled TOTP through the product's own `/api/auth/mfa/setup` and `/mfa/enable`. The instance ran with dev-login only for that enrolment, and was then restarted with it refused.
- Every sign-in was by password and authenticator code.
- The OQ-006 project was created through the product's intake (`POST /api/c2c/projects`) as the run identity.

The password, the TOTP secrets and the JWT secret lived only in the session scratchpad. A scan of this folder for each of them, and for bearer tokens, found none. The instance was stopped afterwards.

## Not changed, and why

- **The audit row's action stays `c2c.work.approve` for an interim approval,** in the full audit-trail export as everywhere.
  - Each approval is an approve act by its signer, and the row's payload says `toStatus: in_review` with the share.
  - Renaming the command would change `HIGH_RISK_COMMANDS` and every reader of `approve` rows. This is for the coordinator if wanted.
- **The meaning stays APPROVED** on an interim approval. It is what the signer declared (§11.50(a)(3)). The route verifies its members by meaning, and the brief allows a distinct type or a distinct meaning. The type is the distinct record.
- **`review_signature` is still written once per round,** and the append-only guard is untouched. The lines come from the round.

## Decisions taken where the brief left room

1. **The approval line too.** Item 2 names the review line. The approval line had the same defect: on a two-approver version it named only the last approver. It now comes from the round the same way, once the version is approved. While 1 of 2, there is no approval line, as before.
2. **The line is from the round only when the stored sign-off is one of the round's signatures.** That is the proof that the sign-off was made on this route. A version that entered review before the cutover, or one carried from Authoring, keeps its stored line.
3. **The gate repair (`cef786a3f`) is its own commit,** so the MR-08 lane can take or drop it.

## Pre-existing failures, not caused by this change

- The four QMS retirement DB tests above, and OQ-QMS-10 (P-51 `cd95dc9e6`). The tests and the protocol still send `APPROVED`.
- `ci:tenant-isolation:no-regression` at `37c17a3f0` (`1371823ee`), repaired in `cef786a3f`.
