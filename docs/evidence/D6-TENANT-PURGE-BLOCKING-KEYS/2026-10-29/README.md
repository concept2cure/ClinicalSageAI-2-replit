# A tenant purge gets to the end: fix the keys with no delete action, and complete the export it relies on

Launch row D6 (tenant offboarding, data erasure). Date 2026-10-29.

The work:

- **fix** the purge of any tenant holding a row that names its project, workspace, document or program through a key with no delete action. One such row stopped the purge with 23503 and rolled the whole erasure back;
- **complete** ci:purge-coverage, so it reads the list as a sequence and fails on such a key;
- **complete** the tenant export, so it returns every parent-scoped row the purge erases;
- **fix** the Vault seal door, which every deploy took away from the runtime role (Part 1, landed as de6b8c630).

**Status:**

- **done:** Part 1, the 149 tables, the export, the gate, the tests.
- **held for the founder:** 18 tables whose rows the purge does not erase. They are listed below, each with the key that blocks and what happens today.
- **reported:** a few pre-existing gaps the work found, which are not mine to fix. See "Reported, not fixed".

## Part 1 (landed as de6b8c630): every purge failed at the Vault seal door

On a deploy-shaped database every tenant purge failed with **42501 "permission denied for function purge_tenant_vault_seals"**.

**Cause:** `public.purge_tenant_vault_seals(p_org integer)` (VR-19, `migrations/20261029d_vault_data_room_seals.sql`, 765f2b399) was not on `scripts/db/security-definer-allowlist.json`.

- Each deploy's runtime-role recipe (`revokeUnreviewedDefinerExecute`, `scripts/db/provision-app-role.mjs`) revokes app_service's EXECUTE on every unlisted SECURITY DEFINER function, after the migration set has granted it.
- `eraseThroughDoor` calls the door whenever its table exists, so every purge failed there.
- `red.txt` §1: `tenant-purge-artifact-records.dbtest.ts` 1/3.

**The fix:** one reviewed-risk entry. Reviewed the way `purge_tenant_vault_records` was:

- its one input is the organization;
- search_path is pinned (`pg_catalog, public`);
- its one write is `DELETE … WHERE organization_id = p_org`, as the table's owner;
- the body refuses outside the platform scope, for an organization not pending deletion, or under an active legal hold;
- its one caller is the PURGE_DOORS entry, through `eraseThroughDoor`, behind `requirePlatformAdmin`.

`tenant-purge-doors-reviewed.test.ts` pins every door the purge opens to the allowlist.

**Why nothing caught it:**

1. `tests/db/security-definer-functions.dbtest.ts` checks one direction only. It fails on an unlisted definer function the runtime role **can** call. After the revoke, the unlisted door is one it cannot call, so that gate was green.
2. The seal suite (`tests/db/vault-data-room-seal.dbtest.ts`) calls the door as the owner, never as app_service.
3. The only test that runs the purge as the runtime role on a deploy-shaped database, `tenant-purge-artifact-records.dbtest.ts`, runs in the CI real-database lane. CI for 92a594ee8 and ca574ff80 was still queued when this was found, and `.husky/pre-push` runs no dbtest.
4. The one door already pinned to the allowlist by a unit test was the source-read-receipt door (`tenant-source-read-receipts.test.ts`). Now all six are pinned.

## What already exists

Read at `6b70fd0a4`. Re-checked through `11624b268`; no commit in between touched the purge, the export or the schema. The clone's history starts 2026-10-22.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The purge | `server/services/tenant/tenant-offboarding.ts`: `PURGE_CHILD_TABLES`, `purgeChildTable`, `deleteTenantRows`, `PURGE_DOORS`, `PURGE_PARENT_SCOPED`, `PURGE_RETAINED_RECORDS`, `assertRegulatedContentDisposition`, `assertNoActiveLegalHold` | Deletes the list in order, in one transaction, rethrowing anything but 42P01/42703. Doors for append-only stores. Refuses a tenant holding controlled QMS versions or frozen submission inputs, or under a legal hold. | Did not list the 90 tables whose 105 keys name a purged row with no delete action. Listed `documents` after both of its parents. Had predicates for the two Vault tables only. |
| One predicate for export and purge | `server/services/tenant/vault-tenancy.ts` (`VAULT_DOCUMENT_TENANCY`) | The pattern: the tenancy of the Vault, read by both, so they cannot disagree. | Covered the Vault only. `purge-parent-scope.ts` extends the pattern; it does not replace it. |
| Parent-scoped tenancy | `db/migrations/20260813_child_table_parent_scoped_rls.sql` (the RLS spec), `tests/db/child-table-parent-scoped-rls.dbtest.ts` | Policies each child table without a tenant column through its parent and key. | Is SQL in a migration, so TS cannot import it. The purge and export predicates use the **same parent and key** as each table's policy (checked by reading `pg_policies`). |
| Residue gate | `scripts/ci/check-purge-coverage.mjs` (`ci:purge-coverage`) + selftest | Ratchets how many org-keyed tables a purge cannot reach. Follows only ON DELETE CASCADE edges, over the live install-fresh + deploy-migrate catalog. | Read the list as a set. Its own selftest said ORDER was "outside this gate's reach". So the FK-ORDER defect of 2ab30c93 and 07d0116f9 passed it. |
| Export covers purge | `tests/schema-contract/tenant-export-covers-purge.contract.test.ts` | Fails when a listed table is not discovered by the export. | Checked listed tables only. Its fixture is the 0000 journal. |
| The export | `server/services/tenant-export/tenant-full-export.service.ts`: `discoverTenantTables`, `EXPORT_SCOPED_PREDICATES`, `EXPORT_WITHHELD_COLUMNS` | Discovers tables carrying organization_id, org_id or tenant_id. Has one scoped predicate (the Vault). | Never discovered a table without a tenant column. A customer's legacy document versions, CER sections and CSR study contents never came back. |
| Runtime purge on a real DB | `tests/db/tenant-purge-artifact-records.dbtest.ts`, `tests/db/tenant-purge-audit.dbtest.ts` | Run the real list as app_service in the platform scope. | Seed only a workspace, a program, a project and an artifact. |
| Device-records pin | `server/services/tenant/__tests__/tenant-purge-device-records.pglite.test.ts` (07d0116f9) | Raw-DDL lineage for risk_items and the related tables. | — (this work does the same for udi, software lifecycle and IVD) |
| Definer allowlist | `scripts/db/security-definer-allowlist.json`, `revokeUnreviewedDefinerExecute`, `tests/db/security-definer-functions.dbtest.ts` | Revokes, on every deploy, the runtime role's EXECUTE on any unlisted SECURITY DEFINER function, and fails on a callable unlisted one. | Nothing checked the opposite direction: that a function the purge must call is listed. |
| Domain audit histories | `server/services/audit/domain-history-link.ts` | Registers the Part 11 domain histories. | Used here to classify `document_audit_trail` and the three IVDR histories as held. |
| Unkeyed-table gate | `scripts/ci/check-unkeyed-request-tables.mjs` | Flags a table read per request that has no tenant column. | Flagged three nested CTD/CSR parents named by an earlier draft of the predicates. Those three entries were removed (see "Reported, not fixed", item 1). |

**Searches run:**

- `PURGE_CHILD_TABLES`, `PURGE_PARENT_SCOPED`, `PURGE_DOORS`, `PURGE_RETAINED_RECORDS`, `purgeTenant`, `discoverTenantTables`, `EXPORT_SCOPED_PREDICATES`, `VAULT_DOCUMENT_TENANCY` across server, tests and scripts;
- `confdeltype`, `pg_constraint` in scripts/ci and tests;
- `security-definer-allowlist`, `purge_tenant_vault_seals` across the tree;
- `review_route_writer`, `reg_questions_read_only`, `ROUTE_TASK_OWNED_BY_ROUTE`;
- `git log --all --diff-filter=D` on `*purge*`, `*tenant-export*` and `*parent-scope*`, which found no deleted implementation in the visible window.

**Nothing is built beside an existing piece:**

- the gate is extended;
- the export is completed;
- the predicate module is the vault-tenancy pattern, extended;
- the dbtest runs the real purge and the real export;
- the seeder is new because no catalog-driven seeder existed. Searched: `seed` in tests/db and tests/golden-journeys; each existing fixture is hand-written per table.

## How the keys were found

On a real schema, not by grepping SQL:

- a private PostgreSQL 16.15 with pgvector 0.6.0, under this session's scratchpad;
- built from blank by `node scripts/db/install-fresh.mjs` then `node scripts/db/deploy-migrate.mjs`, the pair the CI real-database lane and the blank-db job run. 439/439 files applied.
- Then `pg_constraint` read, and the list walked as a sequence: each entry's statement plus its ON DELETE CASCADE closure.

A second lineage was checked statically: the inline `REFERENCES` of every `CREATE TABLE IF NOT EXISTS` in `C2C_MIGRATION_FILES`, for a database where the file's CREATE ran before drizzle push. It added the eight device and IVD tables.

**At head:**

- **105** keys from **90** tables stopped the purge.
- One fresh tenant per table (`red.txt` §3): **88** single-row tenants aborted with 23503 — 49 at `projects`, 29 at `client_workspaces`, 6 at `c2c_submission_packages`, 2 at `account_skill_bundles` and 2 at `regulatory_programs`.
- Listing those tables brings in their own children (4 rounds). The fixpoint is **149 tables**.
- 30 of them have no organization_id.
- 17, plus review_routes, hold signatures, audit trails, sealed reports or ledgers.

## The keys found

### At head on the install-fresh + deploy-migrate schema (105 keys, 90 tables)

From `red.txt` §2, ci:purge-coverage as extended, run against the head list. The action is the key's ON DELETE.

| Referencing table | Column(s) | Names | Action | Verdict |
|---|---|---|---|---|
| account_canon_resolution_log | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| account_events | skill_bundle_id | account_skill_bundles | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| account_events | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| account_template_registry | bundle_id | account_skill_bundles | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| account_term_dictionary | bundle_id | account_skill_bundles | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| ana_client_objectives | project_id | projects | NO ACTION | fixed: listed before projects |
| ana_outcome_log | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| ana_project_capabilities | project_id | projects | NO ACTION | fixed: listed before projects |
| ana_relational_profiles | project_id | projects | NO ACTION | fixed: listed before projects |
| bundle_execution_receipts | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| c2c_communication_timeline_events | project_id | projects | NO ACTION | fixed: listed before projects |
| c2c_correspondence | project_id | projects | NO ACTION | fixed: listed before projects |
| c2c_response_packages | project_id | projects | NO ACTION | fixed: listed before projects |
| c2c_submissions | project_id | projects | NO ACTION | fixed: listed before projects |
| communication_channels | project_id | projects | NO ACTION | fixed: listed before projects |
| communication_messages | project_id | projects | NO ACTION | fixed: listed before projects |
| ctd_onboarding_projects | project_id | projects | NO ACTION | fixed: listed before projects |
| data_lineage_records | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| documents | project_id | projects | NO ACTION | fixed: moved before projects and client_workspaces |
| evidence_chain_records | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| fda_510k_projects | project_id | projects | NO ACTION | fixed: listed before projects |
| fda_communications | project_id | projects | NO ACTION | fixed: listed before projects |
| governance_boundary_transitions | artifact_id | concept2cure_artifacts | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| governance_boundary_transitions | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| grant_awards | project_id | projects | NO ACTION | fixed: listed before projects |
| grant_proposals | project_id | projects | NO ACTION | fixed: listed before projects |
| immutable_report_records | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| project_ingested_documents | project_id | projects | NO ACTION | fixed: listed before projects |
| project_intelligence_profiles | project_id | projects | NO ACTION | fixed: listed before projects |
| project_memory_entries | project_id | projects | NO ACTION | fixed: listed before projects |
| project_modules | project_id | projects | NO ACTION | fixed: listed before projects |
| project_predictions | project_id | projects | NO ACTION | fixed: listed before projects, by its parent (purge-parent-scope.ts) |
| project_rules | scope_project_id | projects | NO ACTION | fixed: listed before projects |
| project_schedule_goals | project_id | projects | NO ACTION | fixed: listed before projects |
| project_schedule_of_events | project_id | projects | NO ACTION | fixed: listed before projects |
| project_schedule_of_events | project_id, organization_id | projects | NO ACTION | fixed: listed before projects |
| project_schedule_revisions | project_id | projects | NO ACTION | fixed: listed before projects |
| project_tasks | project_id | projects | NO ACTION | fixed: listed before projects |
| project_workflow_stages | project_id | projects | NO ACTION | fixed: listed before projects |
| risk_detections | project_id | projects | NO ACTION | fixed: listed before projects, by its parent (purge-parent-scope.ts) |
| rule_execution_log | project_id | projects | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| section_links | project_id | projects | NO ACTION | fixed: listed before projects |
| sections | project_id | projects | NO ACTION | fixed: listed before projects |
| sentinel_findings | project_id | projects | NO ACTION | fixed: listed before projects |
| submission_twin_assessments | package_id | c2c_submission_packages | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_challenges | package_id | c2c_submission_packages | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_change_impacts | package_id | c2c_submission_packages | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_change_impacts | changed_artifact_id | concept2cure_artifacts | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_change_impacts | impacted_artifact_id | concept2cure_artifacts | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_claims | package_id | c2c_submission_packages | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_claims | artifact_id | concept2cure_artifacts | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_claims | section_id | c2c_package_sections | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_drift_alerts | package_id | c2c_submission_packages | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_drift_alerts | source_artifact_id | concept2cure_artifacts | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_drift_alerts | target_artifact_id | concept2cure_artifacts | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| submission_twin_evidence_links | evidence_artifact_id | concept2cure_artifacts | NO ACTION | fixed: listed before projects (its parent cascades from projects) |
| template_usage | project_id | projects | NO ACTION | fixed: listed before projects |
| unified_tasks | project_id | projects | NO ACTION | fixed: listed before projects |
| cer_projects | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| client_access | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| client_intelligence_profiles | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| client_security_settings | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| client_workspace_settings | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| csr_reports | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| csr_studies | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| ctd_programs | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| document_sections | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| documents | client_workspace_id | client_workspaces | NO ACTION | fixed: moved before projects and client_workspaces |
| immutable_report_records | client_workspace_id | client_workspaces | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| ind_package_plans | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| ind_projects | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| ind_submissions | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| link_edges | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| patches | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| project_modules | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| protocols | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| quality_management_plans | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| regulatory_obligations | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| regulatory_submissions | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| reports | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| section_graph_nodes | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| section_leaves | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| staff_assignments | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| strategic_reports | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| supply_chain_batches | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| supply_chain_coas | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| supply_chain_materials | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| supply_chain_shipments | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| supply_chain_suppliers | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| supply_chain_temperature_readings | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| sync_status | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| unified_tasks | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| workflow_progress | client_workspace_id | client_workspaces | NO ACTION | fixed: listed before client_workspaces |
| document_audit_trail | document_id | documents | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| document_comments | document_id | documents | NO ACTION | fixed: listed before documents, by its parent (purge-parent-scope.ts) |
| document_locks | document_id | documents | NO ACTION | fixed: listed before documents, by its parent (purge-parent-scope.ts) |
| document_sections | document_id | documents | NO ACTION | fixed: listed before documents |
| document_sessions | document_id | documents | NO ACTION | fixed: listed before documents |
| document_versions | document_id | documents | NO ACTION | fixed: listed before documents, by its parent (purge-parent-scope.ts) |
| electronic_signatures | document_id | documents | NO ACTION | held: PURGE_REFERRERS_NOT_ERASED (founder) |
| ind_package_plan_documents | document_id | documents | NO ACTION | fixed: listed before documents, by its parent (purge-parent-scope.ts) |
| c2c_documents | project_id | regulatory_programs | NO ACTION | fixed: listed before regulatory_programs, by its parent (purge-parent-scope.ts) |
| c2c_documents | project_id, org_id | regulatory_programs | NO ACTION | fixed: listed before regulatory_programs, by its parent (purge-parent-scope.ts) |
| labeling_documents | program_id, organization_id | regulatory_programs | NO ACTION | fixed: listed before regulatory_programs |
| submission_orchestrator_inputs | program_id | regulatory_programs | NO ACTION | retained (PURGE_RETAINED_RECORDS): a populated tenant is refused before any write |

### On a database where a creating file's DDL ran before drizzle push (raw-DDL lineage)

These keys come from the files' own inline REFERENCES. On install-fresh, drizzle creates the table first and the key is absent, so the gate cannot see them. `tenant-purge-raw-program-keys.pglite.test.ts` pins them from the creating statements.

| Referencing table | Column | Names | Action | Creating file | Verdict |
|---|---|---|---|---|---|
| udi_records | program_id | regulatory_programs | NO ACTION | 20260507_mdx_beta_surfaces.sql | fixed: listed |
| software_lifecycle_items | program_id | regulatory_programs | NO ACTION | 20260507 | fixed: listed |
| ivd_analytical_performance | program_id | regulatory_programs | NO ACTION | 20260508_ivd_diagnostic_surfaces.sql | fixed: listed |
| ivd_clinical_performance | program_id | regulatory_programs | NO ACTION | 20260508 | fixed: listed |
| ivdr_classifications | program_id | regulatory_programs | NO ACTION | 20260508 | fixed: listed |
| ivdr_per_documents | program_id | regulatory_programs | NO ACTION | 20260508 | fixed: listed |
| ivd_clia_categorization | program_id | regulatory_programs | NO ACTION | 20260508 | fixed: listed |
| cdx_pairings | device_program_id | regulatory_programs | NO ACTION | 20260508 | fixed: listed (cdx_concordance_studies cascades) |
| ivdr_analytical_validations | classification_id | ivdr_classifications | NO ACTION | 001_create_ivdr_tables.sql (every lineage) | fixed: listed before it |
| ivdr_clinical_evidence | classification_id, validation_id | ivdr_classifications, ivdr_analytical_validations | NO ACTION | 001 | fixed: listed before both |
| ivdr_cdx_workflows | classification_id | ivdr_classifications | NO ACTION | 001 | fixed: listed before it |
| ivdr_validation_parameter_history, ivdr_evidence_result_history, ivdr_cdx_status_history | validation_id / evidence_id / workflow_id | the three above | NO ACTION | 001 | **held** (Part 11 domain histories) |

`labeling_documents` and `c2c_documents` were in the earlier static list. They block on the install-fresh schema too, so they are in the first table. On install-fresh, `risk_items` has only the SET NULL key (20261029c); 07d0116f9 covered the raw lineage for it.

### The deeper rounds (60 tables)

Listing the 78 content tables of the first table made their own referrers blockers in turn. Rounds 1 and 2 added 48 and 12 tables; round 3 added none outside the held set, so the closure stopped there. Those keys are the children, with no delete action, of:

- CER v1 reports and projects;
- the CSR knowledge base;
- grant awards;
- IND package plans;
- the regulatory-submission tree (`agency_correspondence`, `reg_attachments`, `reg_messages`, `stage_gates` and the rest);
- QMP;
- supply chain;
- `section_patches` / `section_propagations`;
- `task_dependencies` / `cross_module_task_links` (children of `unified_tasks`);
- the account-intelligence parents (`account_skill_bundles`, `account_canon_items`);
- `fda_510k_*`.

**149 tables in all:** 78 + 60, the 8 raw-lineage tables, and the 3 IVDR module tables. Each is listed before the table it names. The gate checks it on every run: `green.txt` §2 shows **no** key stopping the purge, and 27 keys from the held tables, each named.

## Held for the founder: what happens to a tenant holding one today

These tables hold signatures, audit trails, sealed reports or ledgers. Their retention after a tenant's erasure is not decided, so the purge **does not erase them**, and this change does not detach them (no SET NULL, no anonymising). They are in `PURGE_REFERRERS_NOT_ERASED` (`server/services/tenant/purge-referrers.ts`, re-exported from tenant-offboarding.ts), each with its reason.

- ci:purge-coverage reports each of them with its key instead of failing, and does not count them as residue.
- `assertNoRetainedRecords` refuses any injected list that names one.

**Today, a tenant holding one such row is not purged.** The purge fails at the DELETE named below, rolls back, and the tenant stays `pending_deletion` with everything it had. Every row below is the actual outcome in `tests/db/tenant-purge-blocking-keys.dbtest.ts` (`green.txt` §2).

| Table | What it holds | Key that blocks | The purge stops at |
|---|---|---|---|
| electronic_signatures | Part 11 e-signatures (immutable trigger) | document_id → documents, version_id → document_versions | `document_versions`, 23503 |
| document_audit_trail | the legacy documents' audit trail (registered domain history) | document_id → documents, version_id → document_versions | `document_versions`, 23503 |
| immutable_report_records | sealed report records | project_id → projects, client_workspace_id → client_workspaces | `projects`, 23503 |
| account_events | append-only account event ledger | project_id → projects, canon_item_id, skill_bundle_id | `account_canon_items`, 23503 |
| account_canon_resolution_log | AnA canon resolution log | project_id → projects | `projects`, 23503 |
| ana_outcome_log | AnA outcome log | project_id → projects | `projects`, 23503 |
| rule_execution_log | rule execution log | project_id → projects | `projects`, 23503 |
| bundle_execution_receipts | skill-bundle execution receipts | project_id → projects | `projects`, 23503 |
| evidence_chain_records | evidence chain (update-refused) | project_id → projects | `projects`, 23503 |
| data_lineage_records | data lineage (update-refused) | project_id → projects | `projects`, 23503 |
| governance_boundary_transitions | artifact governance transitions | project_id → projects, artifact_id → concept2cure_artifacts | `projects`, 23503 |
| gate_approvals | stage-gate approvals with a signature hash and meaning | gate_id → stage_gates, submission_id → regulatory_submissions | `stage_gates`, 23503 |
| cer_approvals | CER v1 approvals (who approved, when) | project_id → cer_projects, document_id → project_documents | `project_documents`, 23503 |
| ivdr_validation_parameter_history | Part 11 change history of an IVDR validation | validation_id → ivdr_analytical_validations | `ivdr_analytical_validations`, 23503 |
| ivdr_evidence_result_history | Part 11 change history of IVDR clinical evidence | evidence_id → ivdr_clinical_evidence | `ivdr_clinical_evidence`, 23503 |
| ivdr_cdx_status_history | Part 11 change history of a CDx workflow | workflow_id → ivdr_cdx_workflows | `ivdr_cdx_workflows`, 23503 |
| reg_questions | legacy agency questions, read-only since 2026-10-19 (refuses INSERT, UPDATE, DELETE, TRUNCATE from every role) | correspondence_id → agency_correspondence, attachment_id → reg_attachments | `reg_attachments`, 23503 |
| review_routes | a signed review workflow (20261023) | none into a purged table; its tasks are `unified_tasks` rows whose DELETE the route guard refuses | `unified_tasks`, P0001 ROUTE_TASK_OWNED_BY_ROUTE |

**Already decided, by the existing retention path:** `submission_orchestrator_inputs` is in PURGE_RETAINED_RECORDS. assertRegulatedContentDisposition refuses a populated tenant before any write (`REGULATED_CONTENT_RETENTION_REVIEW_REQUIRED`), so its program key never fires.

**The decision each table needs:** erase it with the tenant (it then goes on the list), refuse up front like submission_orchestrator_inputs (a clear refusal instead of a 23503), or retain it detached. The third needs a migration and is not the purge's call. For reg_questions, any of the three means amending `migrations/20261019b_reg_questions_read_only.sql`, which refuses DELETE from every role today.

## Security finding (separate from the purge): the review-route guard's bypass is a setting any session can set

`unified_tasks_route_rows_guard` (`migrations/20261023_review_routes.sql:231`) admits every write to a route task, DELETE included, when this holds:

```sql
IF current_setting('c2c.review_route_writer', true) = 'on' THEN
```

That is a custom GUC. PostgreSQL lets any role set a custom GUC, so the guard reads a flag the caller chooses. The file's own header (`:18`) says only `review-route.ts` sets it (`server/services/review/review-route.ts:47`), and that holds by convention only. The runtime role sets it itself:

```
$ psql "$APP_DATABASE_URL" -c "SELECT set_config('c2c.review_route_writer', 'on', false)"
app_service|f      ← current_user, rolsuper
on
```

(`guc-probe.txt`.) So any statement the runtime role runs can rewrite or delete a review route's tasks, including their signature and act columns. That includes one reached through SQL injection, or a second code path that copies the call. This is a control weakness whatever the purge does.

The purge never sets it. A tenant holding a route task is not purged (above). The fix belongs to the review-route owner: a SECURITY DEFINER door, or a check on `current_user` / a NOLOGIN role membership, in the pattern of the purge doors. Not changed here.

## Reported, not fixed

1. **Three tables cascade-deleted without being exported:** `csr_endpoint_results`, `ctd_module_sections`, `ctd_documents`. RLS is on and they have no policy, so no application role can read or write a row. `20260813_child_table_parent_scoped_rls.sql` already records the nested predicate they need. Their parents (csr_studies, ctd_programs) are now purged and they cascade. The export has no predicate for them: three such entries made ci:unkeyed-request-tables fail, and that baseline may only shrink. They can hold nothing the application wrote. A migration giving them the nested parent policy would let the export return them.
2. **Three Vault tables cascade-deleted without being exported:** `vault.document_catalog`, `vault.document_read_receipts`, `vault.evidence_citations`, all via vault.documents. This was true before this change. They need a predicate in purge-parent-scope.ts, after `VAULT_DOCUMENT_TENANCY`. The Vault lane is active, so this is left to it.
3. **`ci:check-unrun-tests` fails at head** on `tests/cortex/csr-cortex.{adapter,behavior,routes}.test.mjs` (8b58354af). Not this change.
4. **Rows with a NULL organization_id under a tenant's project** still stop its purge in `sections`, `section_links`, `task_dependencies` and `cross_module_task_links`. Their organization_id is nullable and their RLS policy reads that column, so the purge and the export use it too. The IVDR module tables default `organization_id` to 1 (`001_create_ivdr_tables.sql`): a row written without one belongs to organization 1, and blocks its classification's tenant. Both fail closed (an abort, never another tenant's row). A backfill would close them, and that is a migration.
5. **The scoped export misses a tenant's Vault documents** when the exporting user is not a member of the project. `vault.documents` is SELECT-policied by `core.can_access_program`, and the dbtest's scope has no user. This was true before this change; it is noted only because the dbtest checks the Vault in that scope for leaks only.

## What changed

| File | Change |
|---|---|
| `scripts/db/security-definer-allowlist.json` (Part 1, de6b8c630) | `public.purge_tenant_vault_seals(p_org integer)`, reviewed-risk, with its review. |
| `server/services/tenant/__tests__/tenant-purge-doors-reviewed.test.ts` (Part 1) | Every door the purge opens is on the allowlist. |
| `server/services/tenant/purge-referrers.ts` (new) | `PURGE_REFERRER_TABLES`: the 149 tables, in commented groups by subsystem, children first. `PURGE_REFERRERS_NOT_ERASED`: the 18 held tables, JSON-shaped, each with what it holds, the key that blocks and the table the purge stops at. Split out so tenant-offboarding.ts stays under the 1500-line ceiling. |
| `server/services/tenant/tenant-offboarding.ts` | `...PURGE_REFERRER_TABLES` spread before `projects`. `documents` is no longer after `client_workspaces`; it moved into the block. `PURGE_PARENT_SCOPED` and `PURGE_REFERRERS_NOT_ERASED` are imported and re-exported. `assertNoRetainedRecords` refuses an injected list naming a not-erased table, as it refuses a retained one. 1367 lines (HEAD 1366). |
| `server/services/tenant/purge-parent-scope.ts` (new) | `PURGE_PARENT_SCOPED`, moved here from tenant-offboarding.ts so the export can read it (the vault-tenancy.ts pattern): 56 entries. The two Vault entries; `c2c_documents` (org_id); the 29 legacy children the purge deletes directly, each through the parent and key of its RLS policy; and 24 children with no tenant column that the purge reaches only by cascade, which the export needs. `EXPORT_DERIVED_TABLES` = vault.document_chunks. |
| `server/services/tenant-export/tenant-full-export.service.ts` | `EXPORT_SCOPED_PREDICATES` is now `PURGE_PARENT_SCOPED` minus the derived tables: one map, so the export and the purge cannot drift. `discoverTenantTables` adds each parent-scoped table this database has, reported as tenant column `'parent'` (`PARENT_SCOPED_TENANT_COLUMN`). `document_locks.lock_token` is withheld: the export now reads it, and `tenant-export-withheld-columns.dbtest.ts` required a decision. |
| `scripts/ci/check-purge-coverage.mjs` | The order check: the list walked as a sequence over the live catalog, failing on any NO ACTION / RESTRICT key, or SET NULL on a NOT NULL column, whose referencing table is not deleted earlier or by the same statement. `...NAME` spreads resolved in place from the sibling modules (fails closed on one it cannot resolve). PURGE_PARENT_SCOPED and PURGE_REFERRERS_NOT_ERASED read from whichever module declares them (fails closed if two do). Not-erased tables reported with their key and kept out of the residue. |
| `scripts/ci/lib/purge-order.mjs` (new) | The catalog SQL and the walk (`deletionSteps`, `blockingKeys`), moved out so the gate stays under 500 lines. |
| `scripts/ci/check-purge-coverage.selftest.mjs` | 22 new cases (53 in all): each way a key stops the list, the quiet shapes, the not-erased map, the split across modules, the fail-closed reads. The paragraph that said ORDER was outside the gate's reach is replaced. |
| `docs/reports/purge-coverage-baseline.json` | Rewritten with `--write-baseline`: 612 → 469. 143 tables earned; 5 tables absent from this database carried forward, as the gate requires. |
| `tests/schema-contract/tenant-export-covers-purge.contract.test.ts` | The fixture also applies `db/migrations/20260807_task_graph_org_columns.sql` (on the set). Without it the journal's task_dependencies and cross_module_task_links have no tenant column, and the contract failed on them. A `'parent'` tenant column must be a PURGE_PARENT_SCOPED key. |
| `tests/db/tenant-purge-row-seeder.ts` (new) | A catalog-driven seeder: one row per table for one organization, each foreign key a real parent of that organization, seeded first. Optional keys into tables the purge deletes are filled, so a row exercises the key it exists to test. |
| `tests/db/tenant-purge-blocking-keys.dbtest.ts` (new) | Two tenants, one row each in every table that names a purged row with no delete action, and in every parent-scoped table: 178 tables, 396 rows. A's export, in A's scope and as the owner, holds A's rows and none of B's, table by table. The purge of A, as the route runs it, succeeds. A's rows are gone and B keeps every one, table by table. Each held table is seeded alone for tenant C, plus a review-route task: the purge of C fails, rolls back, and C keeps everything; with those rows gone, C purges. |
| `server/services/tenant/__tests__/tenant-purge-raw-program-keys.pglite.test.ts` (new) | Raw-DDL lineage from the creating statements. Two tenants. Each of the 12 records alone, and all at once, purged. A Part 11 history held. |
| `server/services/tenant/__tests__/tenant-purge-referrers.test.ts` (new) | The block spreads in its own order before projects. documents is before projects and client_workspaces. Each not-erased table has a reason, is not on the list, and is refused on an injected list before any query. |

### Rule 1, Rule 2, Rule 3

- **Rule 1:** no migration was added or changed.
- **Rule 2:** this is launch row D6 (offboarding). It adds no surface or capability; it completes the erasure and the data return the row names.
- **Rule 3:** see "What already exists". Each piece above extends or completes the existing one, and nothing is built beside it.

## Red, green, mutations

All on one deploy-shaped database: PostgreSQL 16.15 + pgvector 0.6.0, built from blank by install-fresh + deploy-migrate with APP_SERVICE_DB_PASSWORD set. That is the pair the CI real-database lane and the blank-db job run. Each dbtest run starts from a fresh copy of it.

| | What | Result |
|---|---|---|
| Red §1 | Part 1 (landed) | the door test 1/6; tenant-purge-artifact-records 1/3, 42501 |
| Red §2 | ci:purge-coverage, extended, against the HEAD list | exit 1: **104** keys stop the purge (+1 retained); NEW residue `review_routes` |
| Red §3 | one fresh tenant per table, one row, the real purge as the route runs it, HEAD list (`per-table-purge-probe.mts.txt`) | **88** of 99 tables abort with 23503 (49 at projects, 29 at client_workspaces, 6 at c2c_submission_packages, 2 at account_skill_bundles, 2 at regulatory_programs). 9 already purge. 1 is refused by the retention check. 1 cannot be seeded at HEAD: electronic_signatures' anchor CHECK needs a document version, and document_versions is not a purged table at HEAD. |
| Red §4 | the final new suites with tenant-offboarding.ts and the export at HEAD | dbtest 4 of 5 fail (23503 at projects; A's rows left in 20 tables). Raw-lineage PGlite 14 of 16 fail (23503 at regulatory_programs, each table alone too). The referrer test cannot load (no PURGE_REFERRERS_NOT_ERASED). The export contract passes at HEAD **by design**: it pins what the change must keep, since HEAD destroys none of the new tables. |
| Green | `green.txt` §2–§3, the finished tree | gate: no key stops the purge (27 named from held tables); residue 464, baseline 612 → 469. Selftest 53/53. Real-database suites 12 files, 151 tests, including the new dbtest: 178 tables, 396 rows, 2 tenants. Vault-fixture suites 3 files, 40 tests. Unit and PGlite 29 files, 315 tests. One tenant per table: **160 of 178 purge alone**; the other 18 are the held tables, each stopped as the founder table says. |
| Mutations | `mutations.txt` | 9 gate mutants and 17 product-mutation runs (11 mutations), every one red, every repo file restored byte for byte |

A **mutation** is applied alone, the test that should catch it is run, and the file is restored only if it still holds the mutated bytes, then sha256-checked (`mutate.py` in the session scratchpad). Every section of `mutations.txt` that mutated a repo file says "restored byte for byte (sha256): True". The gate-copy mutants change no repo file.

- **Gate mutants** (G1–G9, each run against the selftest):
  - G1: order ignored;
  - G2: cascade closure dropped;
  - G3: SET NULL on NOT NULL ignored;
  - G4: PURGE_PARENT_SCOPED ignored;
  - G5: held keys not exempt;
  - G6: not-erased tables still counted as residue;
  - G7: public schema only;
  - G8: a spread read as nothing;
  - G9: the sibling modules not read.

  Every one is red.
- **Product mutants** (M1–M11):
  - the list loses `project_tasks`: the gate names both its keys; the dbtest's purge fails at project_workflow_stages;
  - `documents` back after the workspaces: the gate, the dbtest and the unit test, each red;
  - **cross-tenant** (the coordinator's condition 1):
    - `document_versions` widened past its parent's tenant: B's version is in A's export, and the purge of A reaches B's row (stopped there by B's comment's key);
    - `project_predictions` through the wrong parent key: B's row in A's export, and **B's row deleted by the purge of A**;
    - `csr_treatment_arms` widened: B's row in A's export;
  - `cer_sections` loses its predicate: gate, dbtest and export contract;
  - `review_routes` not named: the gate fails on NEW residue (the gate passes at HEAD+change only because of that entry);
  - `electronic_signatures` not named: the gate fails on its two keys;
  - the export skips parent-scoped tables: contract and dbtest;
  - the list loses `udi_records`: the PGlite suite;
  - an injected list naming a held table not refused: the unit test.

  Every one is red.

## Gates

`gates.txt`, on the finished tree. Pass:

- ci:purge-coverage and its selftest (53);
- ci:sql-interpolation and its selftest;
- ci:baseline-justifications;
- ci:tenant-isolation:no-regression;
- ci:tenant-column-types;
- ci:tenant-entry-points;
- ci:db-test-isolation;
- ci:regulated-delete-audit;
- ci:check-test-imports;
- ci:unreferenced-modules;
- ci:runtime-ddl;
- ci:session-scoped-rls-bypass;
- ci:drizzle-tenant-scope;
- ci:unkeyed-request-tables;
- audit:repo-health:ceiling.

`ci:check-unrun-tests` fails, at HEAD as well, on the three `tests/cortex/*.test.mjs` files (reported above).

**Lint** (`eslint.txt`): 0 errors on every changed and new file. Warnings in the changed files are the same in net as at HEAD: the gate 10 → 10, the selftest 6 → 6, tenant-offboarding 1 → 1 (max-lines, as at HEAD). New files have 0.

**Type check** (`typecheck.txt`): 0 errors under a scoped tsconfig that extends tsconfig.json and lists the changed and new TS files with the Express Request augmentations. The whole-tree check is not run under parallel load.

## Not done, handed on

1. **The founder's retention decision** for the 18 held tables (table above). For reg_questions, any choice means amending `20261019b_reg_questions_read_only.sql`. For review_routes, retaining or erasing a signed route also decides what happens to its tasks.
2. **The review-route guard's bypass** (security finding above): owner of `20261023_review_routes.sql`.
3. **Nested parent policies** for `csr_endpoint_results`, `ctd_module_sections` and `ctd_documents` (a migration). The export can then return them.
4. **The three Vault cascade tables** in the export (Vault lane).
5. **A NULL or defaulted organization_id under a tenant's parent** (sections, section_links, the task links, the IVDR module tables): a backfill, a migration.
