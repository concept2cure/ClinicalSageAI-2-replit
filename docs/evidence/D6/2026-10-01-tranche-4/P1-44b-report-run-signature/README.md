# P1-44b and DP-67 (b): a final report is a signed record, and a failed delivery logs no letter

Row **D6**. Plan item P1-44b (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`, row P1-44, decided by the product owner 2026-10-01, ADR-0014) and finding DP-67 (b). 21 CFR Part 11 §11.10(e), §11.10(g), §11.50, §11.70; GDPR Art. 5(1)(c). Date 2026-10-01. Base `28e1eb43` (HEAD moved to `0812a990` during the work; that commit changes two docs files only).

## Where this started

Most of the finalize half was already on trunk. Commit `5540554e` ("finalizing a report is an electronic signature") made `POST /api/report-os/runs/:id/finalize` run the platform's signature ceremony (`signGovernedAct` in `server/services/part11/governed-signature-ceremony.ts`):

- a reason of 8 or more characters, a meaning from a closed list (authorship, approval, responsibility), and the password plus the second factor when one is enrolled;
- separation of duties against the run's requester;
- the status, the seal, the `report_os.run_finalized` chain row, the sign ledger pair and the `electronic_signatures` row (through the one writer, `persistGovernedSignSignature`), all on one transaction.

The same commit moved the canvas (`client/src/concept2cure/v2/surfaces/Insights.tsx`) to the shared `EsignModal`, with its meanings filtered from `esignMeanings.ts`. No other code path writes `status = 'final'` to `report_runs`, and run creation inserts only `partial` or `completed`. So the unsigned finalize door was already closed. This item did not redo that work.

**Which ceremony.** The task named `server/routes/governed-signed-act.ts`. Finalize stays on `services/part11/governed-signature-ceremony.ts`. The header of `governed-signed-act.ts` says it has no separation of duties, and that a domain which models authorship should follow the protocol-signature pattern instead. That pattern is the services ceremony, and `report-run` authorship is modelled (`separation-of-duties.ts`, `report_runs.requested_by`). Moving finalize would have dropped three things:

- the separation-of-duties refusal (a requester approving their own run);
- the per-act list of meanings;
- the 503 when a signature cannot be recorded.

What the services ceremony lacked was signing authority, so this item adds that (see "What was wrong", item 1). Two ceremony modules still exist; that is residual R3.

## What was wrong

Each of these was reproduced red on the unfixed code.

1. **A role with no signing authority could finalize, and so sign (§11.10(g)).** Finalize checked its tier (owner, admin, manager, `requireRole(REPORT_FINALIZE_ROLES)`), but never checked the platform's signing policy (`services/part11/signing-authority.ts`, by default admin, approver, reviewer). Every other signing route checks that policy. Against PostgreSQL, a `manager` with the right password finalized a member's run and got **signature row 687** (`red/dbtest-finalize-and-export.txt`).
2. **A run with no snapshot was made final with its seal dropped.** `writeFinalize` set the status, then wrote the seal only `if (latest)`. A run whose snapshot insert had failed became final and signed, but its seal was kept nowhere (`red/finalize-authority-and-seal.txt`, "refuses a run with no snapshot").
3. **A signed final report could not leave the platform.** The external-PDF delivery refused every final report with `409 E_SIGNATURE_REQUIRED`, "report runs cannot be e-signed yet", even though finalize had signed it. Shown against the database with a real finalize signature (`red/dbtest-finalize-and-export.txt`), and in the unit tests (`red/delivery-signature-and-logs.txt`).
4. **DP-67 (b): a failed delivery logged the letter.** `recordDelivery` logged `error.message`. When a delivery record or a learning memory is refused, drizzle throws `DrizzleQueryError`, and its message is the statement plus every parameter: the record, with the subject, the message and the recipients. The logger's masking does not remove letter text, and it scans no string longer than 2,048 characters. Against PostgreSQL, a trigger refused the record and the subject appeared in the log line (`red/dbtest-delivery-log.txt`). The route's outer `serverError` call also logged the raw error text.
5. **The signature row binds the ledger chain hash, not the seal.** For a `report-run:<id>` target, `deriveGovernedTargetBinding` falls back to `binding_basis = 'governed-action-sha256-chain'`, so `bound_payload_digest` is not the seal hash (`red/R1-binding-columns.txt`). The seal is named in the signature manifest (`act.sealHash`, covered by the §11.200 attribution hash), but not in the binding columns. The fix belongs in `server/services/part11/signature-persistence.ts`, which this item does not own. It is residual **R1**, with a patch.

## What changed

**`server/routes/report-os.ts`**

- **Signing authority.** `hasSigningAuthority` reads the signer's role from the membership row (`resolveSignerOrgRole`), never from the token or the body, and applies `isSigningAuthorized`. If the role has no authority, the answer is **403 `ESIGNATURE_NO_AUTHORITY`**, sent before the run is read or a password is compared. That spends no guess and writes nothing. If the membership cannot be read, the answer is a 500 with no detail.
- **The seal is kept.** `writeFinalize` reads and locks the latest snapshot first. A run without one is stopped (`FinalizeStopped('no-snapshot')`). The answer is **409 `RUN_HAS_NO_SNAPSHOT`**, everything is rolled back, and nothing is signed or recorded.
- **Deliveries recognise the finalize signature.** `finalizeSignatures` makes one read, scoped to the organization, joining `report_runs`, the latest `report_snapshots` (the kept seal) and `electronic_signatures` on `signed_target = 'report-run:' || r.id`. A signature counts only when two things hold:
  - it is not withdrawn (`isSignatureWithdrawn`: revoked, superseded or invalid);
  - its manifest's `act.sealHash` equals the seal the run carries now.

  `signatureDecision` applies the gate per run. Then:
  - A signed final report goes out with **no second ceremony**.
  - A final report without a standing signature is refused, and the refusal names the run: "Report run 42 has no standing signature over its seal…".
  - The delivery record (`signatureIds`, also accepted by the list schema) and the `report_os.delivery_exported` chain row name the signatures the export relied on.
- **DP-67 (b).** Every log line on the delivery path now carries ids and the error code only:
  - `failureCode` reads the error's own code, or the SQLSTATE from a wrapped query error's `cause`.
  - `recordDelivery` logs `{ deliveryId, channel, code }`.
  - The route's outer catch passes `textlessFailure(error)` to `serverError`, so the canonical 500 envelope is unchanged and its log line holds the code but no text.
  - I checked the other steps on the path (`loadDeliveryReports`, `projectsInOrg`, `submissionInProject`, `writeCorrespondence`, `captureLearningMemory`, `writeReportEvent`). None of them logs.

**`server/services/report-os/scheduling/delivery.ts`, `types.ts`.** `decideDelivery` now takes the report's `signatureId` and decides the whole rule. A final or sealed report sent externally is `allowed` only when it carries a signature, and `DeliveryDecision.signatureId` names that signature. `describeDeliveryAudit` carries `signatureId`. The scheduled worker (`worker-register.ts`) only ever sends non-final runs, so it is unaffected.

**Client.** No change was needed. A 403 `ESIGNATURE_NO_AUTHORITY` and a 409 `RUN_HAS_NO_SNAPSHOT` both reach the signing dialog as the server's sentence (`finalizeRefusalNote` → `serverMessage`). A new case in `insightsFinalizeSigned.test.tsx` pins this.

**Not changed.** `scripts/ci/sign-ceremony-baseline.json`: `report-os.ts` was never in it. No migration was needed.

## Tests (red on the unfixed code, then green)

Each red run used the final test text against the HEAD source. The source was swapped in with `git show HEAD:…`, then restored and checked byte for byte with `sha256sum -c`.

| File | Red | Green |
|---|---|---|
| `server/services/report-os/scheduling/__tests__/scheduling.test.ts`: the gate allows a signed final report, refuses an unsigned one and names the signature | `red/scheduling-gate.txt`, 6 failed / 23 | `green/scheduling-gate.txt`, 23/23 |
| `server/routes/__tests__/report-os-audit-recording.test.ts`: signing authority from the membership (owner and manager refused under the default policy; a viewer membership under an admin token refused; no membership refused; an unreadable membership is a 500); the policy admitting the tier lets each role finalize; a run with no snapshot refused; the signature manifest names the seal | `red/finalize-authority-and-seal.txt`, 9 failed / 32 | `green/finalize-authority-and-seal.txt`, 32/32 |
| `server/routes/__tests__/report-os-delivery-recording.test.ts`: a signed final run exported, with the record and chain row naming the signature; the read scoped to org and runs; a signature over another seal, revoked, superseded, invalid, or with no kept seal does not count; bundles; DP-67 (b) for the correspondence, record and chain-row refusals and a failure before the transaction | `red/delivery-signature-and-logs.txt`, 11 failed / 27 (the record case fails on `Transmittal of the readiness digest` appearing in the log) | `green/delivery-signature-and-logs.txt`, 27/27 |
| `tests/db/report-os-registry-seed.dbtest.ts` (PostgreSQL 16, `app_service`, `RLS_ENFORCE=on`): a manager without authority is refused with the right password; the admin's signature row is live and names the seal; that signed final report is exported with no second ceremony, and the chain row names the signature | `red/dbtest-finalize-and-export.txt`, 2 failed / 11 (signature 687 written; 409 on export) | `green/dbtest-finalize-and-export.txt`, 11/11 |
| `tests/db/report-os-delivery-recording.dbtest.ts`: a delivery record refused by a real trigger produces a 503, and no log line carries the subject, the letter or a recipient (code `P0001`); a final run with no signature is refused, naming the run | `red/dbtest-delivery-log.txt`, 2 failed / 6 | `green/dbtest-delivery-log.txt`, 6/6 |
| `client/src/concept2cure/v2/__tests__/insightsFinalizeSigned.test.tsx`: the authority refusal is shown as the server's sentence and nothing is shown sealed | Green on both versions, because the client needed no change. Shown able to fail by mutating the client to map every 403 to the tier sentence: `red/client-finalize-dialog-mutation.txt`, 2 failed / 6. `Insights.tsx` was then restored byte for byte. | `green/client-finalize-dialog.txt`, 6/6 |

Neighbours, all green:

- `green/neighbours.txt`: every `report-os` route test, every `services/report-os` suite, and the three Insights canvas suites; 33 files, 382 tests.
- `green/dbtest-tenant-from-session.txt`: 13/13.

## Gates

| Gate | Result | Output |
|---|---|---|
| ESLint, changed files | 0 errors. `report-os.ts` has the same 7 warnings it had at HEAD (line numbers shifted). The other changed files have none, before or after. **0 new.** | `green/eslint-after.txt`, `green/eslint-before-HEAD.txt` |
| `check:security-patterns` | 0 violations across 2,977 files | `green/gate-check:security-patterns.txt` |
| `ci:server-error-leaks` | OK, 10 baselined sites, no file gained one | `green/gate-ci:server-error-leaks.txt` |
| `ci:sign-ceremony` | OK, 19 baselined sites, exactly as baselined | `green/gate-ci:sign-ceremony.txt` |
| `ci:launch-scope-api` | 282 paths, none refused | `green/gate-ci:launch-scope-api.txt` |
| `ci:unreferenced-modules` | **FAIL, not this item.** The one new module is `client/src/concept2cure/v2/surfaces/complianceReviewModel.ts`, an untracked file from another lane (P1-25/P1-43). None of this item's files is listed. | `green/gate-ci:unreferenced-modules.txt` |
| `ci:untracked-imports` | OK in the default mode, which compares against origin and so does not see uncommitted work. In `--all` mode it lists 21 findings, all in legacy scripts; none is in a changed file. The four modules newly imported here (`resolve-signer-role`, `signing-authority`, `signature-persistence`, `utils/logger`) are tracked. | `green/gate-ci:untracked-imports.txt`, `green/gate-ci:untracked-imports--all.txt` |
| Type check, narrowed (not the full project) | 0 errors. Covered: `report-os.ts`, `delivery.ts`, `types.ts`, `worker-register.ts`, the three changed server tests and the ambient declarations, plus their whole import graph. | `green/tsc-changed-files.txt` (empty), `green/tsconfig.p144b.json` |

No migration, so the migration gates do not apply.

## Residuals

- **R1. Bind the signature row to the seal (`server/services/part11/signature-persistence.ts`, not owned here).** The patch is `residual-R1-seal-binding.patch`. It adds:
  - `BINDING_BASIS.REPORT_RUN_SEAL = 'report-run-seal-sha256'`;
  - a `case 'report-run'` in `deriveGovernedTargetBinding` that reads `snapshot_metadata->'seal'->>'contentHash'` from the run's latest snapshot on the signing client, where finalize has just written it, and falls back to the ledger basis when there is no seal;
  - the dbtest assertion `binding_basis = 'report-run-seal-sha256'`, `bound_payload_digest = sealHash`.

  `binding_basis` is free text, so no migration is needed. Only eCTD code re-derives a binding, so no verifier changes behaviour. `git apply --check` passes on this tree. Applied in an isolated scratch copy of the repository (not a worktree or branch), the registry dbtest passed 11/11 with the binding assertion (`green/R1-binding-columns-with-patch-in-scratch-copy.txt`), and the part11 suites passed 110/110 (`green/R1-part11-suites-in-scratch-copy.txt`). Once R1 lands, the delivery check could also require the binding columns. It does not need to: the manifest check already holds for signatures made before and after R1.
- **R2. The canvas offers Finalize to roles the server now refuses (`server/middleware/orgMembership.ts` ~line 524, not owned).** Today `report:finalize` is derived from `REPORT_FINALIZE_ROLES` alone. It should also require `isSigningAuthorized(role)`. Then an owner or manager outside the signing policy is not offered a dialog that ends in "Your role does not permit applying an electronic signature". The server is already fail-closed; this is about the offer only.
- **R3. Two ceremony modules (`services/part11/governed-signature-ceremony.ts` and `routes/governed-signed-act.ts`, neither owned).** The services module also serves protocol finalization and reviewer dispositions, and it has no signing-authority step. Moving step 3a into it would close that gap for protocol signatures too; `hasSigningAuthority` in `report-os.ts` would then be removed. Merging the two modules into one, with separation of duties optional per act, is the zero-duplication end state.
- **R4. Product decision (founder).** Under the default signing policy (admin, approver, reviewer), owners and managers can no longer finalize a report. A deployment that wants them to sets `ESIGNATURE_SIGNING_ROLES`. This is the same policy that P0-10 applied to the 21 domain sign routes.
- **R5. Runs made final before `5540554e`** carry no signature and cannot be finalized again (`RUN_ALREADY_FINAL`). Their external export is refused and names the run, which is fail-closed by design. The path is to run the report again and finalize the new run.
- **R6. Register and plan.** Mark P1-44b and DP-67 (b) closed in `docs/security/SECURITY_AUDIT_2026-09-24.md` and in the plan's P1-44 and P1-53 rows. DP-67 (a), the duplicate intake, was closed earlier when `POST /correspondence/capture` was removed. Those files belong to the control tower.

## R1 applied by the control tower (2026-10-01)

`residual-R1-seal-binding.patch` applied as written: `BINDING_BASIS.REPORT_RUN_SEAL` and a `report-run` case in
`deriveGovernedTargetBinding` (`server/services/part11/signature-persistence.ts`), so the signature row's
`bound_payload_digest` is the run's seal content hash (basis `report-run-seal-sha256`), with the ledger hash as the
fallback only when no seal exists at signing time (which the finalize now refuses). `red/R1-binding-columns.txt` is
the unfixed binding; `green/R1-seal-binding-dbtest.txt`: `report-os-registry-seed.dbtest.ts` 11/11 on PostgreSQL
with the binding assertion, Part 11 suites 110/110.

## R2 applied by the control tower (2026-10-01)

`sessionPermissions` (`server/middleware/orgMembership.ts`) offers `report:finalize` only to a role in
`REPORT_FINALIZE_ROLES` that the signing policy also authorises (`isSigningAuthorized`), so the canvas no longer
offers Finalize to an owner or a manager the server refuses with `ESIGNATURE_NO_AUTHORITY`. The session-permissions
test now defines the finalize route as its guard plus signing authority. `R2/red/`: 3 of 26 failing on the unchanged
derivation (manager, owner, and the default-policy case); `R2/green/`: 26/26; middleware and report neighbours
523/523.
