# A departing tenant's regulated records leave with it, after custody; the review-route guard admits a role

Launch row D6 (tenant offboarding, data erasure), with D5 for P-59. Date 2026-10-29.
Decisions: P-58 and P-59 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, decided under the founder's delegation of 2026-10-29),
and the lead's four decisions on the lane's open questions of the same day (below, "The lead's decisions").

The work:

- **complete** the tenant export (`server/services/tenant-export/tenant-full-export.service.ts`, `routes/tenant-export.ts`
  `GET /full`). It now returns every held record, the IVDR Part 11 histories included, with the integrity verdict of
  each hash chain and each signature's manifest, inside its digest.
- **reach** the platform's one signing ceremony (`signGovernedAct`, `routes/governed-signed-act.ts`) for a new act:
  the customer's administrator signs custody of that export (`GET`/`POST /api/tenant-export/custody`).
- **complete** the tenant purge (`server/services/tenant/tenant-offboarding.ts`). It erases the 18 tables held out of
  it on 2026-10-29, the five that name one of them, and `qc_deviations`. It does so only on a receipt whose custody is
  signed and not stale, and it writes one offboarding certificate.
- **converge** the held stores' guards onto the platform's door pattern (`ana_run_events_purger`, 20261008f;
  `purge_tenant_vault_seals`, 20261029d). Five SECURITY DEFINER doors are owned by a NOLOGIN role, and each store's
  guard is amended in place to admit that role's DELETE and nothing else.
- **converge** the seal-chain walk. Three copies of the loop (two in the report engine, one in the export) become
  one exported function, `sealChainBreaks`.
- **fix** the review-route guard (P-59). It admitted any transaction that set `c2c.review_route_writer`, and the
  runtime role sets that itself. It now admits the NOLOGIN role `review_route_writer`, which is current_user only
  inside seven reviewed doors, one per transition `review-route.ts` makes.
- **fix** the data return (P-58's data return finding, below). The export ran in the platform scope, where eight
  tables return none of a tenant's rows and nothing fails: the Vault's four and the knowledge graph's four. It now
  reads in the organization's own scope. Only an export read there records a receipt that custody and the purge
  accept. The purge now erases in the organization's own tenant id and uuid, and it erases the knowledge graph.
- **fix** two purge gaps and one purge-order defect found on the way: the CSR build's assembly and narrative runs
  were never erased; and the labeling translations and symbols were deleted in the wrong order (below).

**Status:** green on a deploy-shaped database built from this tree (install-fresh, then deploy-migrate, 455
migration files), then replayed a second time. Every mutation turns its test red: 25 of 25. Results are in
`green.txt`, `red.txt`, `mutations.txt` and `gates.txt`.

## What already exists

Searched at `4fa3184ab` (the lane's base) and again at `1d9e01848` with the lane's work set aside, so the searches saw
the tree without it. The lead's decisions were searched again at `96a9ecf58`.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The purge | `server/services/tenant/tenant-offboarding.ts`: `PURGE_CHILD_TABLES`, `deleteTenantRows`, `PURGE_DOORS`, `eraseThroughDoor`, `markPurged`, `recordPurge`, `assertNoRetainedRecords` | Deletes the list in order on one transaction, going through a reviewed door where a store refuses a plain DELETE. Refuses without a complete export receipt, under a legal hold, or with controlled QMS versions awaiting review. Writes one chained audit row. | Did not erase the 18 tables of `PURGE_REFERRERS_NOT_ERASED`, so a tenant holding one signature, audit row, sealed report or approval stopped at 23503 and was not purged at all. Kept no record of the offboarding beyond the audit row and the organizations row. |
| The held list | `server/services/tenant/purge-referrers.ts`: `PURGE_REFERRER_TABLES`, `PURGE_REFERRERS_NOT_ERASED` | Named each held table with the key that stops the purge (D6-TENANT-PURGE-BLOCKING-KEYS, 2026-10-29). | Erased none of them: the retention decision was the founder's, and P-58 is that decision. |
| Parent-scoped tenancy | `server/services/tenant/purge-parent-scope.ts` (`PURGE_PARENT_SCOPED`) | One predicate per table without a tenant column, read by both the export and the purge, on the parent and key of the table's own policy. | Had no entry for the three IVDR histories, so the export never returned them. |
| The export and its receipt | `server/services/tenant-export/tenant-full-export.service.ts` (`exportTenantFull`, `discoverTenantTables`, `recordExportReceipt`, `findExportReceipt`), `server/routes/tenant-export.ts` `GET /full`, `tenant_export_receipts` (20260813b, 20261018) | Returns every row of every tenant table as stored, inside one digest. A complete export records the receipt the purge requires: digest, counts, actor, time. | Carried no proof that the copy is whole: no chain verdict and no signature-manifest verdict. The receipt outlived the tenant only as baselined residue, not as a declared platform record. |
| Hash-chain attestation | `server/services/tenant-export/attestation-report.service.ts`, `GET /api/tenant-export/attestation`, client `ComplianceAttestation.tsx` | A signed report over `audit_events` (stored-link continuity; UNVERIFIABLE where rows carry no hash). | Covers `audit_events` only. It does not cover the `audit_logs` ledger the signatures cite, the seal chains or the signatures. Left as it is: the export's integrity section reads the other chains with their own verifiers. |
| The audit-ledger verifier | `server/services/audit/tenant-chain-verdict.ts` `verifyTenantChainOnAdminScope` | The platform's one verdict over a tenant's `audit_logs` chain and its anchored head. | Was not called by the export. Now it is; nothing is re-implemented. |
| The seal-chain walk | `server/services/intelligent-report-engine.ts`: `verifyReportIntegrity` step 3, and `verifyEventChain` (a second copy in the same file, found by searching `previousEventHash`) | Per report, each seal event's stored previous hash must equal the prior event's stored chain hash. | Was two private loops over the global pool, one report at a time. Extracted as `sealChainBreaks`, with the same semantics. Both engine methods and the export call it, so one copy remains where three would have been. |
| The §11.200 hash recipe | `server/services/part11/signature-persistence.ts` `manifestSignatureHash` | The writer's own recipe, exported so verifiers call it. | (called as it is) |
| The one signing ceremony | `server/routes/governed-signed-act.ts` `signGovernedAct`, `SignedAct` | Password, second factor where enrolled, meaning, reason, signing authority, and the ledger pair and signature row on one transaction. | Refused every signer of an organization pending deletion (`resolveSignerOrgRole`, `o.status = 'active'`), so a leaving tenant could sign no act. |
| Signing authority | `server/services/part11/signing-authority-gate.ts` `checkSigningAuthority`, `resolve-signer-role.ts` `resolveSignerOrgRole` | The membership role decides who may sign; active organizations only. | Had no way to admit the one act a leaving tenant must sign. |
| The retention period | `server/routes/vault-retention-period.ts`, client `RetentionPeriodCard`, `organization_retention_settings` (20261001) | The organization's period, set with a reason and a governing rule; default `DEFAULT_RETENTION_YEARS`. | Its read and its presentation were private to the route. Moved unchanged to `server/services/vault/retention-period.ts`, so the attestation states the same period by the same rule. |
| The door pattern | `migrations/20261008f_ana_run_events.sql` (`ana_run_events_purger`), `20260926_vault_documents_record_immutability.sql` (`purge_tenant_vault_records`), `20261029d_vault_data_room_seals.sql` (`purge_tenant_vault_seals`), `purge_tenant_artifact_records`, `purge_tenant_turn_records`, `purge_tenant_source_read_receipts` | A NOLOGIN role that a store's guard recognises by current_user, and a SECURITY DEFINER door with a pinned search_path that restates the purge's preconditions. | (followed, not rebuilt: the five new doors and the seven route doors use this pattern) |
| Definer allowlist | `scripts/db/security-definer-allowlist.json`, `revokeUnreviewedDefinerExecute` (`scripts/db/provision-app-role.mjs`), `tests/db/security-definer-functions.dbtest.ts`, `tenant-purge-doors-reviewed.test.ts` | Every callable definer function is reviewed; every door the purge opens is pinned to the list. | (twelve entries added) |
| The review-route guard | `migrations/20261023_review_routes.sql` `unified_tasks_route_rows_guard`; `server/services/review/review-route.ts` `enterRouteWriter`; `refuseRouteTaskWrite` (`server/services/tasking/task-state-machine.ts`) | Refuses every generic writer of a route row, in code and in the database. | Admitted any transaction that set `c2c.review_route_writer = 'on'`, which the runtime role sets itself (`docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/guc-probe.txt`). |
| Deviations | `migrations/20261029g_qc_deviations.sql`, `server/services/qms/deviations.ts`, `server/routes/mdx-qms-deviations.ts` (P-57) | The deviation record. Its close and cancel are signed acts (target `qms-deviation:<id>`), and those signatures are `electronic_signatures` rows. | No purge list named it, so a purged tenant kept every deviation (`ci:purge-coverage`, NEW residue). |
| CSR build runs | `migrations/20260628_csr_job_state.sql` Tables 4 and 5 (`csr_assembly_runs`, `csr_narrative_runs`, b265d6fc0) | One row per assembly, and one per narrative build of a CSR job. | Cascade only from `csr_build_jobs`, which is not purged, so a purged tenant kept every run (NEW residue). |
| Residue and order gate | `scripts/ci/check-purge-coverage.mjs` + selftest | Fails on an org-keyed table the purge cannot reach, and on a key that stops the list part-way. | Had no notion of a record the platform keeps about a purge, so the certificate would have read as NEW residue. |
| Real-database purge proof | `tests/db/tenant-purge-blocking-keys.dbtest.ts`, `tests/db/tenant-purge-row-seeder.ts` | Seeds one row of every table that names a purged row, for two tenants, and purges one as the route does. | Asserted that the held tables stop the purge, which is the case P-58 removes. |
| The export's scope | `server/middleware/establishRequestTenantScope.ts` `SYSTEM_SCOPE_PREFIXES` (`/api/tenant-export`), `server/db/tenantStore.ts` `runWithTenantScope`, `runWithOrgJobScope`, `server/db/poolInstrumentation.ts` (applies the scope LOCAL at a checked-out client's BEGIN), `server/services/tenant-export/company-export-snapshot.ts` `companyExportSnapshot`; the tenant-id-and-uuid scope in `server/jobs/vaultProcessingSweep.ts` and `server/services/clinical-regulatory-evidence/data-room-processing.ts` | The route ran its snapshot in the platform scope. Per-organization jobs that read the Vault already run with the tenant id and the org uuid. | The export never ran in its organization's own scope, and stated no scope. `inOrganizationScope` reuses `runWithTenantScope` with the jobs' shape; nothing in the pool or the policies changed. |
| Offboarding UI | none | The export, the attestation report and the purge are reached by API (`/api/tenant-export/full`, `POST /api/tenants/:id/purge`); no client calls `/full` or the purge. | (custody is API-only too; see "Reported, not fixed") |

**Searches run** over server, shared, client/src, migrations, db/migrations and scripts:

- `custody`: 24 files, every one a sample or specimen chain of custody, none about a tenant or an export.
- No hits for: `offboarding_certificate`, `offboardingCertificate`, `offboarding certificate`, `certificate of destruction`,
  `destruction certificate`, `deletion certificate`, `erasure certificate`.
- `retention_years`, `readRetentionPeriod`, `verifyReportIntegrity`, `verifyTenantChainOnAdminScope`, `manifestSignatureHash`,
  `pending_deletion`, `PURGE_REFERRERS_NOT_ERASED`, `PURGE_DOORS`, `review_route_writer`, `enterRouteWriter`, and
  `tenant-export` in client/src.
- For the lead's decisions: `qc_deviations`, `csr_assembly_runs`, `csr_narrative_runs`, `tenant_export_receipts`,
  `previousEventHash`, `previous_event_hash`. These found the second engine copy, `verifyEventChain`.
- For the data-return finding: `SYSTEM_SCOPE_PREFIXES`, `runWithTenantScope`, `runWithOrgJobScope`, `orgUuid:` in
  server code (six callers, none for the export), `can_access_program`, `knowledge_graph_` and `citation_chains` in
  the purge lists, and `git log --all --diff-filter=D -- '*export-scope*' '*organization-scope*'`: nothing deleted.
- `c2c.review_route_writer` in tests: found `tests/db/review-route-qms-rr2.dbtest.ts` (6549fe2b5), which wrote a
  legacy route row through the retired setting.
- `git log --all --diff-filter=D` on `*custody*`, `*offboarding*`, `*certificate*`, `*retention-period*` and
  `*held-record*`: nothing deleted.

## P-58's data return finding: the export returned none of eight tables' rows

**Found** by the P-72 slice-0 measurement on PostgreSQL 16
(`docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-0/f5-export-gap-per-table.txt`, `f5-export-functions.txt`).
`/api/tenant-export` is in `SYSTEM_SCOPE_PREFIXES`, so the full export and the curated one both read in the platform
scope: tenant `'0'`, no organization uuid, role `app_super_admin`. Under that scope eight tables returned none of the
exported organization's rows. Nothing failed, so `coverage.tablesFailed` was empty, the receipt was recorded, and
custody and the purge accepted it.

| Table | Why the platform scope saw none of the organization's rows |
|---|---|
| `vault.documents` | `core.can_access_program(program_id)`, which compares the program's organization uuid with `identity.current_org_id()` (`app.current_org_id`), and has no platform arm |
| `vault.document_catalog`, `vault.document_read_receipts`, `vault.evidence_citations` | the same check, through their document |
| `citation_chains`, `knowledge_graph_nodes`, `knowledge_graph_edges`, `lumen_knowledge_graph_edges` | `organization_id = app.current_tenant_id` only |

At the function level, GET /full returned 861 rows for organization A in the platform scope against 872 in its own
scope, and B 860 against 872. The own scope (tenant id and org uuid, no role) returned every row and lost none. The
only other organization's rows it admitted are the deliberate open reads, `organizations` and `organization_users`,
and the export's own predicate already filters those. With custody as designed until then, a purge would have erased
Vault documents the customer was never given.

**The purge had the twin defect.** In this lane's dbtest, after the export was fixed, the purge of D still left D's
`citation_chains`, `knowledge_graph_nodes`, `knowledge_graph_edges` and `lumen_knowledge_graph_edges` rows behind,
while the certificate said they were gone. `citation_chains` was on the purge list, but its DELETE ran in the platform
scope and saw none of D's rows. The three graph tables were on no list at all (baselined residue). The Vault was
erased, through its door.

**What changed:**

- **The export reads in the organization's own scope.** `inOrganizationScope`
  (`server/services/tenant-export/company-export-snapshot.ts`) runs GET / and GET /full with the organization's
  tenant id and organization uuid, and no role. Both routes now use it. It needs no policy change and no door, and an
  organization with no uuid is refused (409 `EXPORT_SCOPE_UNAVAILABLE`) rather than given less.
- **The export states its scope, inside its digest.** `readExportScope` reads the scope from the export's own
  database session: `organization`, `unrestricted` (RLS not enforced, or a role that bypasses it) or `restricted`.
  The result goes in `coverage.scope`.
- **Only a complete scope records a receipt.** `recordExportReceipt` records no receipt for a `restricted` or
  unstated scope, and records the scope on the receipt (`tenant_export_receipts.export_scope`, 20261029k section 0,
  nullable with no default, so no earlier receipt is claimed to be complete).
- **Custody is bound to an export whose digest covers those tables.** The custody attestation refuses a receipt
  without a complete scope (409 `CUSTODY_EXPORT_SCOPE_UNVERIFIED`) and names `exportScope` in what is signed.
- **The purge refuses an export made the old way** (`EXPORT_SCOPE_UNVERIFIED`), before anything else. The database
  holds it to the same rule: `tenant_export_custody_signed`, which every door runs, and the certificate's INSERT guard
  both require the receipt's scope.
- **The purge erases in the organization's own tenant id and uuid.** `enterOrganizationScope` (`tenant-offboarding.ts`)
  sets them LOCAL on the purge's transaction, keeping the platform role its doors check (P-72 moves the doors).
  `knowledge_graph_nodes`, `knowledge_graph_edges` and `lumen_knowledge_graph_edges` join the purge list
  (`purge-referrers.ts`).
- **Pinned.** `tests/db/tenant-offboarding-custody.dbtest.ts` seeds a row in each of the eight tables for D and for
  E. It asserts that D's export holds D's row of each and none of E's, that the purge of D erases D's and keeps all
  of E's, that an export read in the platform scope records no receipt, and that a receipt with no scope opens
  neither custody, the purge, the doors nor a certificate. `tests/db/tenant-purge-blocking-keys.dbtest.ts` now exports
  as the route does, and checks the Vault both ways, table by table, over every table the purge erases.
- **A fixture defect, fixed.** The row seeder gave a Vault document a `program_id` of no program, so no scope could
  read it. That is why blocking-keys exempted `vault.*` from its scoped check. `ownVaultProgram`
  (`tests/db/tenant-purge-row-seeder.ts`) gives each seeded Vault document its organization's own program.

Red, green and mutations: `red.txt` (the eight-table case with the route in the platform scope), `green.txt`, and
mutations M17 to M25 in `mutations.txt`.

## The lead's decisions (2026-10-29) and what each changed

1. **`qc_deviations` is a held record.** A closed deviation is a GxP quality record, so a departing customer's custody
   attestation names it. It is a store in `HELD_RECORD_STORES` (`held-records.ts`), counted in the attestation and in
   the certificate, and erased by a plain DELETE in `purge-referrers.ts`. Nothing refuses that DELETE (no trigger, and
   app_service holds DELETE), so it needs no door. Its close and cancel signatures are `electronic_signatures` rows,
   erased through `purge_tenant_signed_records`. Red first: with `qc_deviations` added to the test's held list
   (`QUALITY_HELD`, `offboarding-custody-fixture.ts`) and nothing else, the custody dbtest failed 3 of 17. The
   attestation had no count for it, the certificate had none, and D's deviation survived the purge. Green: 18 of 18.
2. **`csr_assembly_runs` and `csr_narrative_runs` are plain deletes**, beside `csr_narrative_outputs` in
   `purge-referrers.ts`. Nothing names them and they carry no signature; their only other keys are to `csr_build_jobs`
   (cascade) and `users` (SET NULL). `ci:purge-coverage` was red on the tree as it stood, with NEW residue
   `csr_assembly_runs`, `csr_narrative_runs`, `qc_deviations`. It is green after the change (`red.txt`, `gates.txt`).
3. **`tenant_export_receipts` is a `PURGE_PLATFORM_RECORD`.** Its columns are `id`, `organization_id`, `digest` (the
   export's SHA-256, `digestOf`), `table_count`, `row_count`, `created_by` (a user id), `created_at`,
   `company_documents_version` (always 1) and `company_documents_sha256`. That is digests, counts, an actor and a
   time, with no customer content. The purge verifies against it, and the custody door, the custody signature and the
   certificate's INSERT guard all name its digest. It is now declared, with that reason. `assertNoRetainedRecords`
   refuses an injected list naming it, and `ci:purge-coverage` reports two platform records and fails if the purge
   could reach one (mutation M15).
4. **The seal-chain walk is converged.** `sealChainBreaks` is exported from `intelligent-report-engine.ts`.
   `verifyReportIntegrity` step 3 and `verifyEventChain` call it (same results: chain intact if and only if no
   break, and the same detail lines in order), and so does `held-record-integrity.ts`, through a lazy import like its
   ledger verifier. A new custody-dbtest case walks a report whose second event links and whose third does not; it
   reads INTACT, then BROKEN at the third event's id. Mutation M13 disables the link check in `sealChainBreaks`
   alone, and that case goes red.

## What changed

### 1. Export first (`held-record-integrity.ts`, `purge-parent-scope.ts`, `routes/tenant-export.ts`)

- `GET /api/tenant-export/full` now returns `withIntegrity(exportTenantFull(...))`, inside the digest, so the copy
  the customer keeps carries its proof:
  - `integrity.chains`: the tenant's `audit_logs` ledger by `verifyTenantChainOnAdminScope` (INTACT, BROKEN, EMPTY,
    NOT_VERIFIED), and each immutable report's seal-event chain by `sealChainBreaks` (stored-link continuity).
  - `integrity.signatures`: every signature of the tenant with its manifest as stored, its status, and
    `hashIntegrity` VERIFIED or COMPROMISED by `manifestSignatureHash`, the writer's recipe.
  - `integrity.gateApprovals`: each stage-gate approval's hash, stated UNVERIFIABLE (no writer records its recipe).
  - `integrity.method`: what each verdict checks and what it does not, so the scope travels with the verdict.
  - A verdict that cannot be computed is UNAVAILABLE and named in `coverage.tablesFailed`. No receipt is then
    recorded, so that export cannot authorize a purge.
- The three IVDR Part 11 histories gain `PURGE_PARENT_SCOPED` predicates (the parent and key of each table's
  policy). Before, they had no tenant column and the export returned none of them.

### 2. Custody is a signed act (`offboarding-custody.ts`, `custody-signature.ts`, `retention-period.ts`, `governed-signed-act.ts`, `signing-authority-gate.ts`, `resolve-signer-role.ts`)

- `GET /api/tenant-export/custody?digest=` returns the attestation and its SHA-256. The attestation holds the export
  (digest and receipt counts), the retention period in force (the Records retention card's, read by the same
  function), every held record by store, the ones still inside the period by id (integer ids as runs), and the
  statement. It is deterministic.
- `POST /api/tenant-export/custody` signs it through `signGovernedAct`: password, second factor where enrolled, the
  meaning `responsibility`, a reason, signing authority from the membership role, and the ledger pair and signature
  row on one transaction. The target is `tenant-export-custody:<digest>`, and the manifest's act is the attestation.
  It is refused for: a non-administrator (403, before the password); another tenant; a digest that is not the
  tenant's (404); an attestation that changed since it was read (409); a second custody of the same export (409).
- A tenant in `pending_deletion` is read-only and its signers had no authority.
  `SignedAct.signerOrganizationStatuses` lets an act ask for `pending_deletion`, and `signerOrganizationStatusesFor`
  grants it only to the custody act, by its target, domain and meanings together. Any other act that asks is held to
  active organizations. Pinned by `governed-signed-act-pending-org.pglite.test.ts`.
- The purge's check, `custodyForPurge`, runs on its own transaction. A tenant holding any held record is refused (422
  `CUSTODY_ATTESTATION_REQUIRED`) unless a valid custody signature meets all of these:
  - it names the very receipt the purge runs on;
  - its manifest hashes to its `signature_hash`;
  - its act names this digest and organization;
  - the records it attested to are the records held now (`CUSTODY_ATTESTATION_STALE` otherwise).

### 3. The offboarding certificate (`offboarding-certificate.ts`, 20261029k)

- `public.tenant_offboarding_certificates` holds one row per purged tenant. It is written on the purge's
  transaction after the deletes and the status change, before the chained audit row and COMMIT. Each row holds:
  - the export digest and counts;
  - rows erased per table, and tables absent;
  - held records erased per store, and their total;
  - the custody signature, who purged, and when (the same instant as `organizations.purged_at`);
  - the SHA-256 of those fields.

  Counts, ids, digests and times only; no customer content.
- Append-only for every role: UPDATE, DELETE and TRUNCATE raise `OFFBOARDING_CERTIFICATE_IMMUTABLE`. An INSERT is
  refused unless the organization is purged, the digest is one of its receipts, and the named signature is its
  custody signature on that digest. It keys to the organization and to the custody signature, NO ACTION.
- `PURGE_PLATFORM_RECORDS` names it, beside the export receipts.
- A database without the table is refused (`OFFBOARDING_CERTIFICATE_UNAVAILABLE`), not skipped: a purge never
  completes without a certificate of itself.

### 4. The held records are erased (`purge-referrers.ts`, `purge-held-doors.ts`, `held-records.ts`, 20261029k and five guards amended in place)

- `PURGE_REFERRERS_NOT_ERASED` is empty. Its 18 tables, the five that name one of them with no delete action, and
  `qc_deviations` are in `PURGE_REFERRER_TABLES`, each at the position its keys need.
- Where a trigger or the runtime role's grant ceiling refuses DELETE, the store is erased through one of five doors
  (table below), each owned by `tenant_record_purger`. Each store's guard admits that role's DELETE and nothing else.

### P-59. The review-route guard admits a role (`20261023_review_routes.sql`, `review-route.ts`, `create-task.ts`, `task-assignment.ts`)

- `enterRouteWriter` and the setting are gone. Each route-row write in `review-route.ts` is one door call.
  `createTaskInTx` inserts a member task without route columns and enlists it through `review_route_enlist_member`.
  A route member's reassignment goes through `review_route_reassign_member`, named by its own ledger row, which is
  now written first.
- The guard admits `current_user = 'review_route_writer'`, plus a DELETE by `tenant_record_purger`, and reads no
  setting. `route-writer-setting.gate.test.ts` pins that statically. `review-route-guard.dbtest.ts` shows that the
  runtime role can still set the setting and that it admits nothing.
- `tests/db/review-route-qms-rr2.dbtest.ts` (upstream, 6549fe2b5) wrote a legacy approval's route row through the
  setting. It failed with `ROUTE_TASK_OWNED_BY_ROUTE` on this guard. It now assumes `review_route_writer` for that one
  UPDATE, and the test's point is unchanged (an earlier approval stored with the final type is read as interim):
  7 of 7. Reverting the fix is mutation M16.

### Found on the way: labeling translations and symbols

`labeling_translations` and `labeling_symbols` each name `labeling_documents` twice: once by a key that cascades, and
once by their same-organization key (20261013b), NO ACTION. Both checks are AFTER triggers on `labeling_documents`,
fired in trigger-name order. On an install-fresh database the NO ACTION trigger sorted first and found the rows the
cascade had not yet removed, so the purge failed with 23503. Both tables are now listed before `labeling_documents`
(mutation M10).

## The held tables, before and after

"Before" is `PURGE_REFERRERS_NOT_ERASED` at the lane's base (`4fa3184ab`). "After" is this change. Every table is
exported by its own `organization_id` unless the table says otherwise. Every one is counted in the custody attestation
and in the certificate (`server/services/tenant/held-records.ts`).

| Table | Before: what stopped the purge | After: exported by | After: erased by | What refused a plain DELETE |
|---|---|---|---|---|
| `electronic_signatures` | `document_id` → documents, `version_id` → document_versions, NO ACTION: 23503 at document_versions | organization_id; plus its manifest and §11.200 verdict in `integrity.signatures` | door `purge_tenant_signed_records`, before `document_versions`; custody signatures kept | trigger `trg_electronic_signatures_immutable` (every role); grant ceiling |
| `document_audit_trail` | `document_id`, `version_id`, NO ACTION: 23503 at document_versions | organization_id | door `purge_tenant_signed_records` | grant ceiling (no DELETE for app_service) |
| `compliance_review_records` (reached) | named a held signature: not reached | organization_id | door `purge_tenant_signed_records`, first | guard refuses DELETE of a signed review (every role) |
| `data_lineage_records` | `project_id` → projects: 23503 at projects | organization_id | door `purge_tenant_lineage_records`, before `projects` | `prevent_lineage_modification` (every role) |
| `evidence_chain_records` | `project_id` → projects: 23503 at projects | organization_id | door `purge_tenant_lineage_records` | `prevent_lineage_modification` |
| `ivdr_validation_parameter_history` | `validation_id` → ivdr_analytical_validations: 23503 there | `PURGE_PARENT_SCOPED` (it has no tenant column; the export returned none before) | door `purge_tenant_ivdr_histories`, before its parent | grant ceiling |
| `ivdr_evidence_result_history` | `evidence_id` → ivdr_clinical_evidence: 23503 there | `PURGE_PARENT_SCOPED` (none before) | door `purge_tenant_ivdr_histories` | grant ceiling |
| `ivdr_cdx_status_history` | `workflow_id` → ivdr_cdx_workflows: 23503 there | `PURGE_PARENT_SCOPED` (none before) | door `purge_tenant_ivdr_histories` | grant ceiling |
| `reg_questions` | `correspondence_id`, `attachment_id`: 23503 at reg_attachments | organization_id | door `purge_tenant_reg_questions`, after `reg_messages` and `reg_responses` | `reg_questions_read_only` (every role, since 20261019b) |
| `reg_responses` (reached) | named a held question: not reached | organization_id | list, before `reg_questions` | none |
| `review_routes` | nothing reached it; its route tasks refused DELETE (`ROUTE_TASK_OWNED_BY_ROUTE`) at unified_tasks | organization_id | door `purge_tenant_review_routes`, after the tenant's tasks | none (no guard of its own; see "Reported") |
| route tasks (`unified_tasks` with `review_route_id`) | `unified_tasks_route_rows_guard` refused their DELETE | organization_id (in `unified_tasks`) | door `purge_tenant_review_routes`, where `unified_tasks` stood | the guard (every role but the door's) |
| `account_canon_resolution_log` | `project_id` → projects: 23503 at projects | organization_id | list, before the project's working data | none |
| `ana_outcome_log` | `project_id` → projects | organization_id | list | none |
| `rule_execution_log` | `project_id` → projects | organization_id | list | none |
| `bundle_execution_receipts` | `project_id` → projects | organization_id | list | none |
| `governance_boundary_transitions` | `project_id` → projects, `artifact_id` → concept2cure_artifacts | organization_id | list, before `projects` | none |
| `report_seal_events` (reached) | named a held report: not reached | organization_id; plus its chain verdict in `integrity.chains` | list, before `immutable_report_records` | none |
| `indemnification_attestations` (reached) | named a held report | organization_id | list, before `immutable_report_records` | none |
| `report_atom_provenance` (reached) | named a held report | organization_id | list, before `immutable_report_records` | none |
| `immutable_report_records` | `project_id` → projects, `client_workspace_id` → client_workspaces: 23503 at projects | organization_id | list, before `projects` | none |
| `account_events` | `project_id`, `canon_item_id`, `skill_bundle_id`: 23503 at account_canon_items | organization_id | list, before `account_template_registry` | none (its append-only trigger, `db/migrations/20260318_ga_immutability_hardening.sql`, is on no applier; see "Reported") |
| `cer_approvals` | `project_id` → cer_projects, `document_id` → project_documents: 23503 at project_documents | organization_id | list, first of CER v1 | none |
| `gate_approvals` | `gate_id` → stage_gates, `submission_id` → regulatory_submissions: 23503 at stage_gates | organization_id; plus its signature hash, stated UNVERIFIABLE, in `integrity.gateApprovals` | list, before `stage_gates` | none |
| `qc_deviations` (held by the lead's decision) | nothing stopped the purge; nothing reached it: NEW residue | organization_id | list, plain DELETE, beside the CSR build runs | none (no trigger; app_service holds DELETE) |

The purge keeps two platform records of a tenant (`PURGE_PLATFORM_RECORDS`), each holding digests, counts, ids and
times only: `tenant_export_receipts` and `tenant_offboarding_certificates`. It also keeps the custody signature the
certificate names.

## The SECURITY DEFINER doors, and why each is safe

Twelve functions are on `scripts/db/security-definer-allowlist.json`, each with its full review. What they share:

- **Owner.** A NOLOGIN, NOINHERIT role with no attributes (`tenant_record_purger`, 20261029k; `review_route_writer`,
  20261023). It is created only when absent and never granted to the runtime role. `current_user` is that role only
  inside its doors, so each store's guard recognises a door by `current_user`, never by a setting. The dbtests show
  that `SET ROLE` and `set_config('role', …)` to either role are refused for app_service.
- **Shape, verified by the migration itself.** SECURITY DEFINER, `search_path = pg_catalog, public`, owner aligned,
  EXECUTE revoked from PUBLIC and granted to app_service. The migration raises if any door has another shape. Their
  helpers are invoker functions that only the owner role can execute.
- **Grants.** Each owner holds exactly what its doors read and write (listed in each file's role block), and nothing
  more.

| Door | Status | Why it is safe |
|---|---|---|
| `purge_tenant_signed_records(p_org)` | reviewed-risk | Erases a departing tenant's signed reviews, its signatures (not its custody signatures) and its legacy audit trail. Before any write it refuses unless: the session is in the platform scope; the organization is `pending_deletion`; no legal hold is active; and, when there is a held record, the organization holds a valid custody signature on one of its receipts. One caller, its `PURGE_DOORS` entry, behind `requirePlatformAdmin` and `custodyForPurge`. `custodyForPurge` checks the custody signature against the very receipt, checks its manifest hash, and checks that the records attested are the records held now. |
| `purge_tenant_lineage_records(p_org)` | reviewed-risk | The same preconditions; `data_lineage_records`, `evidence_chain_records`. |
| `purge_tenant_ivdr_histories(p_org)` | reviewed-risk | The same; the three IVDR histories by their parent's organization, the predicate of each table's policy and of `PURGE_PARENT_SCOPED`. |
| `purge_tenant_reg_questions(p_org)` | reviewed-risk | The same; `reg_questions`. |
| `purge_tenant_review_routes(p_org)` | reviewed-risk | The same; the tenant's `unified_tasks` (route members included), then its `review_routes`. |
| `review_route_enlist_member` | reviewed | A new member task (the writer's own id shape, no route column yet) joins an open route of the organization, with steps in order. |
| `review_route_record_signature` | reviewed | Closes a member's task only on a signature that is the member's own and the organization's, over the route's subject and content digest, with the role's meaning, and in force. |
| `review_route_open_step` | reviewed | Opens a waiting step only when every earlier step has a stamped signature. |
| `review_route_restep_approver` | reviewed | Moves approvers after an added reviewer, only on an open route on which no approver has signed. |
| `review_route_cancel_member` | reviewed | Cancels an unsigned member only once the route's header is closed. |
| `review_route_stamp_act` | reviewed | Stamps a return or hand-back only by its own ledger row (this route, this assignee, this subject). |
| `review_route_reassign_member` | reviewed | Reassigns an unsigned member on an open route only by its own `review-route.reassign` ledger row, to an active member of the organization. |

Every route door also refuses a caller whose tenant scope is not the organization, with RLS enforcing
(`review_route_door_scope`), and every statement it runs carries `organization_id = p_org`.

The purge doors' platform-scope check reads `app.rls_enforce` and `app.current_user_role`. P-72 (decided today) moves
those session settings onto a role. Today the runtime role can set them itself, so for the purge doors the controls
that hold are `pending_deletion`, the legal hold and custody; see "Reported, not fixed".

## Red, green, mutations

All on real PostgreSQL 16 with pgvector, deploy-shaped: install-fresh, then deploy-migrate, with the runtime role
app_service (no superuser, no BYPASSRLS) and RLS enforced. The final template is `c2c_custody_new7_tpl`, 455 of 455
migration files.

| Run | Result |
|---|---|
| `tests/db/tenant-offboarding-custody.dbtest.ts` | 21 of 21 |
| with `tenant-purge.dbtest.ts` and `tenant-purge-blocking-keys.dbtest.ts` | 40 of 40 |
| the related dbtest set (29 files: purge, custody, review routes, signatures, definer functions, Vault isolation) | 401 of 401 |
| the Vault-fixture dbtests (7 files) | 91 of 91 |
| custody and route-guard dbtests after a second deploy-migrate replay | 42 of 42 |
| PGlite route, purge and unit lane (87 files) | 1,049 of 1,049 |
| scoped tsc (60 files) | 0 errors |
| ESLint per file against HEAD (53 TypeScript files) | no new warning |

`red.txt` holds each test failing on the code it exists to catch:
- P-58 items 1 to 4 at the lane's base;
- P-59's guard admitting the setting;
- `ci:purge-coverage` and the custody dbtest before the lead's decisions;
- the rr2 fixture on P-59's guard;
- the data return, with the routes and the purge in the platform scope.

`mutations.txt` holds 25 mutations. Each turned its test red and was restored byte for byte. Two of them need a note:
- M10, the labeling order, is reproduced on a copy whose cascade triggers sort after the NO ACTION ones. On this
  template their OIDs happen to sort the other way, which is the luck item 7 below reports.
- M12 is a type error the scoped tsc catches.

## Gates

See `gates.txt` (two runs). On the final tree all of these pass:
- `ci:purge-coverage` and its selftest (59 of 59);
- `ci:migration-drop-safety` and its selftest;
- `ci:migration-set-order` (456 in run 3);
- `ci:sql-interpolation` and its selftest;
- `ci:sign-ceremony` and its selftest;
- `ci:tenant-isolation:no-regression`.

`ci:migration-deploy-path` and its selftest passed in run 1. In run 2 they failed only on
`migrations/20261030b_platform_scope_role.sql`, a P-72 file not yet in the set. They passed again in run 3, once
P-72 listed it (456 entries). In run 1,
`ci:purge-coverage` failed only on fold F5's `estar_submission_events`, before F5's purge line reached the tree.
deploy-migrate replayed a second time over the built template applies 455 of 455 files with no error.

## Rule 1, Rule 2, Rule 3

**Rule 1 (every migration re-runs on every deploy).** No DROP is appended. The five guards are amended in place in
their creating files, each with a dated header naming what changed and why:

- `db/migrations/20260730_esign_audit_db_level_immutability.sql`
- `migrations/20260327_data_lineage_tracking.sql`
- `migrations/20261001_compliance_review_records.sql`
- `migrations/20261019b_reg_questions_read_only.sql`
- `migrations/20261023_review_routes.sql`

The new file, `migrations/20261029k_tenant_offboarding_custody.sql`, creates only what is absent (table,
constraints, triggers, role), replaces only functions that it alone defines, and re-aligns owners and grants
idempotently. The new table is in `public` with `organization_id INTEGER NOT NULL` and is placed before the final
sweep pair, so the sweep polices it. A second `deploy-migrate` over the built template applies 455 of 455 files with no
error (`gates.txt`). The lead's decisions change no migration.

**Rule 2 (launch scope).** Row D6 (tenant offboarding), with D5 for P-59. No new surface, module or model: two routes
on the existing tenant-export router, a table, a role and reviewed doors. Every number in the attestation and the
certificate is a count the database returns, and every verdict is computed by code from the rows.

**Rule 3 (never build what we already have).** See "What already exists". The export, the purge, the ceremony, the
signing authority and the guard are completed or fixed in place, and the doors follow the existing door pattern.
The retention period's read is moved, not copied. The seal-chain walk is one function: the export's copy, and the
second copy inside the engine, now call it.

## Reported, not fixed

1. **The purge doors' platform-scope check is two session settings** (`app.rls_enforce`, `app.current_user_role =
   'app_super_admin'`), as every tenant policy's is. P-72 (decided today) moves the platform scope onto a role, and
   the six helpers and five doors here belong in its inventory. Until then, the controls that hold at the database
   are `pending_deletion`, the legal hold and custody. The door's custody check (`tenant_export_custody_signed`)
   asks for a valid custody signature on any of the organization's receipts. The manifest hash, the receipt match
   and staleness are checked in code (`custodyForPurge`).
2. **`review_routes` itself has no guard.** `review-route.ts` writes the route header row with a plain UPDATE
   (`closeReviewRoute`), and the runtime role can UPDATE or DELETE it directly. The members are guarded; the header
   is not. Converging the header onto a door uses the same pattern, but it is not in P-59's text.
3. **Legacy signatures with no organization** (`electronic_signatures.organization_id IS NULL`) are in no tenant's
   export, attestation or purge.
4. **Manifests are large for a big tenant.** The attestation lists every record inside the period by id (as runs
   for integer ids), and the signature manifest carries it. A tenant with hundreds of thousands of held records signs
   a large manifest. The export caps a verdict at 50,000 rows and reports UNAVAILABLE beyond that.
5. **Custody has no UI.** It is API-only, as the full export and the purge already are. The natural completion is
   a Settings card that reads the attestation and signs through the existing EsignModal.
6. **No content binder for the custody target.** `tenant-export-custody:` is not in `governed-target-binders.ts`,
   so the signature records the governed-action-ledger basis. The act itself checks the attestation's SHA-256
   (`CUSTODY_ATTESTATION_CHANGED`), and the manifest carries the attestation.
7. **Twelve more order-dependent sibling-cascade keys** pass today only by trigger-name order:
   `concept2cure_artifacts` / `provenance_events`, and ten `csr_*` tables under `csr_studies`. `ci:purge-coverage`
   treats a same-statement cascade as safe, which is the assumption the labeling defect broke.
8. **`account_events`' append-only trigger** (`db/migrations/20260318_ga_immutability_hardening.sql`) is on no
   applier, so the purge list's plain DELETE works on every deployed database. A database where the trigger was
   applied by hand would refuse the purge there.
9. **The purge-coverage baseline is not rewritten.** `docs/reports/purge-coverage-baseline.json` still lists 14
   tables this change covers or declares, the export receipts and the knowledge graph among them. The gate passes and prints them as "newly
   covered". Locking the gain in is `npm run ci:purge-coverage:write-baseline` on a deploy-shaped database; that
   file is outside this lane.
10. **No test calls `verifyReportIntegrity` or `verifyEventChain`.** Their use of `sealChainBreaks` is
    behaviour-preserving by construction and type-checked. The function itself is exercised, and shown red, through
    the export (M13).
11. **The purge's transaction carries the platform role together with the organization's own tenant id and uuid**
    (`enterOrganizationScope`), because its doors still check the platform role. P-72 moves the doors onto a role;
    until then this scope is admitted by every tenant arm and by the super-admin arm.
12. **The purge-coverage baseline still holds 454 org-keyed tables outside the purge's reach** (`ci:purge-coverage`,
    run 2), `lumen_data_atoms` among them. The certificate counts only the tables the purge erases. This change
    erased the tables its tests and the slice-0 measurement found, and no more.


## Not done

- `docs/reports/purge-coverage-baseline.json` is not rewritten (Reported, item 9). It is outside this lane's files.
- The purge doors still check the platform scope by session settings. They move with P-72 (Reported, item 1).
