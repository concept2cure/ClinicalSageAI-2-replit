/**
 * The out-of-band migration set — the ordered list of .sql files that no other
 * durable path applies, plus the loop that applies them.
 *
 * WHY THIS MODULE EXISTS. Two entrypoints need the exact same set:
 *   • scripts/db/apply-c2c-migrations.mjs — the manual/preview applier.
 *   • scripts/db/deploy-migrate.mjs       — the production deploy-time applier
 *                                           run as a one-off ECS task before
 *                                           the API/worker services roll.
 * Holding the list in one place is what stops the deploy path and the manual
 * path from silently diverging — which is the failure mode that produced the
 * gap these files close in the first place (merged ≠ applied).
 *
 * These files live in the root `migrations/` tree (the established convention
 * for phase migrations) or in `db/migrations/` without the `_gcc_` infix, so
 * NOTHING else applies them: drizzle's runtime migrate() replays only the
 * journaled baseline, the CI psql loop matches only `db/migrations/*_gcc_*.sql`,
 * and install-fresh's overlay covers only the root tree. Every file here is
 * CREATE/ALTER ... IF NOT EXISTS, so the set is safe to apply repeatedly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ensureJournal, recordApplied } from './migration-journal.mjs';

// Dependency-safe order: governance ALTERs ana_capability_registry (pre-existing),
// PV + commitments create their own tables, council provisioning seeds the four
// drafting-council agents into the lumen schema.
//
// Entries are repo-relative so a root-lineage file can declare a prerequisite that
// lives in the canonical db/migrations lineage. 044b is that prerequisite: it owns
// the ONLY definition of lumen.data_atoms, and the council file that follows it
// reads from that table. Applying it here means this out-of-band path provisions
// the same shape the manifest lineage does, instead of racing it under
// CREATE TABLE IF NOT EXISTS. See ledger C-12.
// ── Data-room / evidence lineage (added 2026-07-26) ────────────────────────
// ORDER MATTERS. The spine creates cre_evidence_sources; the program-scope
// migration ALTERs it. The spine entry is repo-relative into db/migrations for
// the same reason 044b is: a root-lineage file declares a prerequisite that
// lives in the canonical lineage.
//
// Why the spine is listed here at all: it has been merged since 20260724 and IS
// present in db/migrations/migrations_manifest.json, but NOTHING consumes that
// manifest — it is ordering metadata, and readiness-audit.mjs only reports. The
// other applier, preview_db_test, applies only migrations a PR *adds*, to an
// ephemeral Neon branch deleted when the PR closes. So the spine was applied
// once to a throwaway branch and never to a real database, and every cre_*
// write (CSR adapter, CRL ingestion, chat-upload source identity) has been
// hitting a table that does not exist. This list is the only durable path, so
// it is where the gap gets closed.
//
// The wider problem stands: merged and applied have diverged silently across
// 358 migrations because the manifest is not authoritative for anything. Making
// something consume it is a separate change to how schema ships.
export const C2C_MIGRATION_FILES = [
  // ── Golden-journey prerequisites ────────────────────────────────────────────
  // Seven migrations that tests/golden-journeys provision and depend on, and
  // that no durable applier ran — the exact drift ci:journey-migration-
  // reachability exists to catch. They lead the set because later entries
  // depend on what they create: the c2c_documents family (phase9) is ALTERed by
  // 20260728_c2c_document_sections_timestamps and _c2c_section_version_author_kind
  // and read by the 20260804+ rule-pack outlines; regulatory_programs
  // (program_workbench) is scoped by 20260726_cre_source_program_scope and
  // anchored by 20260814_projects_regulatory_program_anchor.
  //
  // Order within the block is dependency order, which here matches date order:
  // phase9_backfill reads regulatory_programs and writes the c2c_documents
  // family, so it follows both; audit_hmac_seal seals the chain columns
  // mutation_primitives adds to audit_logs, so it follows that.
  //
  // Prerequisites all come from drizzle-kit push, which runs before this set:
  // cerv2_510k_sections, cer_reports, pma_submissions and audit_logs are all
  // declared in shared/schema.ts. Every ALTER here is ADD COLUMN IF NOT EXISTS
  // or guarded on information_schema, and the backfill guards each source table
  // the same way, so the block is safe on a database that already has them and
  // on one that does not.
  'migrations/20260506_kit_section_draft_provenance.sql',
  'migrations/20260524_program_workbench_schema.sql',
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260528_phase9_document_schema.sql',
  'migrations/20260529_phase9_backfill.sql',
  'migrations/20260604_shadow_review.sql',
  'migrations/20260609_audit_hmac_seal.sql',
  // ── End golden-journey prerequisites ────────────────────────────────────────
  'migrations/20260603_ai_capability_governance.sql',
  'migrations/20260603_pv_operational.sql',
  'migrations/20260603_commitments.sql',
  'db/migrations/044b_gcc_lumen_schema_prerequisite.sql',
  'migrations/20260724_lumen_council_provisioning.sql',
  'migrations/20260724_ana_deep_investigations.sql',
  // Clinical-Regulatory Evidence spine — creates cre_evidence_sources and the
  // rest of the cre_* graph. Fully idempotent: 6 CREATE TABLE IF NOT EXISTS,
  // 22 CREATE INDEX IF NOT EXISTS, no data statements, no unguarded DDL.
  'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
  // file_uploads tenancy contract — codifies the columns the upload route
  // writes, adds organization_id idempotently, backfills it from the
  // uploads/org-{id}/ storage-path prefix.
  'migrations/20260726_file_uploads_tenancy.sql',
  // Program scope for canonical sources. MUST follow the spine: it ALTERs
  // cre_evidence_sources. Self-guarding on to_regclass, so it no-ops with a
  // NOTICE if the spine is somehow absent rather than failing the run.
  'migrations/20260726_cre_source_program_scope.sql',
  // ── Authoring program scope (added 2026-07-27, from #1131) ────────────────
  // Program scope for authoring documents: a guarded ALTER that adds
  // client_program_id to authoring_documents. It self-guards on to_regclass.
  // Callers provision the authoring subsystem (below) BEFORE this loop runs, so
  // on a fresh DB the table is now present and this ALTER applies for real
  // rather than no-opping.
  'migrations/20260727_authoring_document_program_scope.sql',
  // Source-usage index + column semantics on authoring_citations. Also guarded
  // on to_regclass; likewise lands for real now that the subsystem is
  // provisioned ahead of this loop.
  'migrations/20260726_authoring_citation_source_usage.sql',
  // Industry-context tailoring: organization_industry_profiles +
  // project_industry_profiles. Fully idempotent (CREATE TABLE/INDEX IF NOT
  // EXISTS, no data statements).
  'db/migrations/20260727_industry_context_profiles.sql',
  // MDx task metadata: additive nullable columns on unified_tasks
  // (lifecycle_phase, market, filing_type, study_id, deliverable_id,
  // client_visibility) + lifecycle_phase index. Fully idempotent
  // (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, no data statements).
  'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
  // ── Risk-Based Monitoring lineage (added 2026-07-27) ──────────────────────
  // These five migration files exist in migrations/ and create the ENTIRE rbm_*
  // schema, but none was on any durable apply path: not here, not in the Drizzle
  // journaled baseline (shared/schema.ts defines no rbm_* table), not in
  // migrations/meta. Yet the RBM/RBQM module writes to these tables on every
  // action — rbm-actuator, metric-ingestion, site-risk-engine, the mdx-rbm* routes
  // and the AnA tools all issue INSERT/UPDATE/SELECT against rbm_*. So the whole
  // module has only ever addressed tables that existed on the ephemeral Neon
  // preview branch a PR created and then deleted; on any real database those
  // writes hit a table that is not there. This list is the only durable path, so
  // it is where the gap gets closed.
  //
  // ORDER MATTERS. rbm_surfaces creates the eight base tables; the rest either
  // create a table referencing them or backfill a column on one:
  //   kri_values        -> rbm_kri_values (FK rbm_kris)
  //   patient_profiles  -> rbm_patient_profiles (the cohort scorer's store)
  //   metric_ingestion  -> rbm_data_runs + rbm_metric_observations (the load path)
  //   not_evaluated     -> backfills status on rbm_kris / rbm_qtls
  //
  // All five are idempotent (every CREATE TABLE / CREATE INDEX / ADD COLUMN is
  // IF NOT EXISTS; the backfill is to_regclass-guarded and re-runnable), none
  // opens its own transaction, and none contains DROP or TRUNCATE — safe under
  // the repeated-run contract.
  'migrations/20260629_rbm_surfaces.sql',
  'migrations/20260630_rbm_kri_values.sql',
  'migrations/20260701_rbm_patient_profiles.sql',
  'migrations/20260726_rbm_metric_ingestion.sql',
  'migrations/20260726_rbm_not_evaluated_backfill.sql',
  // ── Collaboration state (added 2026-07-27) ────────────────────────────────
  // Durable Y.js CRDT state for the /collab socket. Fully self-contained: one
  // CREATE TABLE IF NOT EXISTS that references nothing, plus an ON DELETE
  // CASCADE FK to authoring_documents added only inside a to_regclass guard.
  // Listed after the authoring entries so that on a fresh database — where
  // applyAuthoringSubsystem() has already run — the guard finds the table and
  // the cascade actually lands, instead of leaving CRDT state that outlives the
  // document it belongs to.
  //
  // Without this entry the collaboration server has nowhere to persist: its
  // store reports the table missing, onLoadDocument refuses the connection, and
  // the subsystem is off anyway until ENABLE_COLLAB_CRDT is set. Listing it
  // here is what makes turning that flag on a configuration change rather than
  // a schema migration.
  'db/migrations/20260727_collab_document_state.sql',
  // ── artifacts (added 2026-07-28) ──────────────────────────────────────────
  // Chat-generated artifacts. Two shipped paths addressed this table and nothing
  // created it: a fire-and-forget INSERT in server/routes/chat-actions.ts (whose
  // .catch turned "relation does not exist" into a console.warn while the
  // request still returned ok:true) and the workspace summary's "Recent
  // artifacts" read. Self-contained: one CREATE TABLE IF NOT EXISTS referencing
  // nothing, one index, and its own tenant_isolation_policy — 0021 has long
  // since run and never revisits a newly-added table.
  'db/migrations/20260728_artifacts_table.sql',
  // ── c2c section timestamps (added 2026-07-28) ─────────────────────────────
  // c2c_document_sections was created with no updated_at/created_at, yet FOUR
  // shipped queries reference ds.updated_at: /workstreams (projects.ts:334),
  // /drafts (:371,:377), the project vault (project-vault.ts:365) and the UPDATE
  // branch of the canonical Part 11 section save (documents.ts:441). Postgres
  // rejects an unknown column at plan time, so those are unconditional 42703
  // failures — /workstreams and /drafts have 500'd on every project page load,
  // and the section save would 500 on the first re-save of any section.
  //
  // Must be on this list, not just in migrations/: the root tree reaches new
  // databases only, and every database with this defect is an existing one.
  // CREATE TABLE IF NOT EXISTS cannot add a column to a table that already
  // exists, so the guarded ALTER is the only way the column lands.
  'migrations/20260728_c2c_document_sections_timestamps.sql',
  // ── CMC Module 3 operating system (added 2026-07-28) ──────────────────────
  // The ONLY file that creates cmc_module3_sections, cmc_source_objects,
  // cmc_section_lineage, cmc_provenance_events and seven siblings — and it was
  // on NO durable apply path. It carries no `_gcc_` infix so the CI psql loop
  // skips it; it lives in db/migrations so install-fresh's root-tree overlay
  // never sees it; and it was not in this list. It IS in
  // db/migrations/migrations_manifest.json, which nothing consumes.
  //
  // Consequences, both observed: the blank-DB provisioning job failed with
  // `relation "cmc_module3_sections" does not exist`, and migrations/0016 and
  // 0017 — which ALTER these tables from the root tree — have been ALTERing
  // tables that install-fresh never created. Every CMC Module 3 write in the
  // product has only ever addressed tables that exist on databases provisioned
  // by some other means.
  //
  // Fully idempotent: 11 CREATE TABLE IF NOT EXISTS, no unguarded DDL, no data
  // statements, and `organizations` is its only external FK target — which
  // deploy-migrate already asserts as a base sentinel before this loop runs.
  //
  // MUST precede the re-key below, which indexes the tables this creates.
  'db/migrations/20260401_cmc_convergence_os.sql',
  // ── Schedule of events tenant-scoped uniqueness (added 2026-07-28) ────────
  // SECURITY. project_schedule_of_events had a unique constraint on (project_id)
  // alone — org-blind. generateProjectSchedule() upserted with
  // `ON CONFLICT (project_id) DO UPDATE SET`, matching any tenant's row, and
  // the DO UPDATE SET did not reset organization_id. A cross-org attacker could
  // regenerate another org's schedule with new dates and regulatory milestones.
  // This migration is the fix: (organization_id, project_id) arbiter + composite
  // FK to projects(id, organization_id) for structural consistency.
  //
  // Must be on this durable path: the migration was written into db/migrations
  // but WAS NOT on this list, so it never shipped to production databases.
  // Landing without this entry would make the code's `ON CONFLICT
  // (organization_id, project_id)` reference a constraint that does not exist:
  // "there is no unique or exclusion constraint matching the ON CONFLICT
  // specification" (42P10). Every upsert would fail.
  'db/migrations/20260728_schedule_of_events_org_scoped_uniqueness.sql',
  // ── CMC Module 3 tenant-scoped uniqueness (added 2026-07-28) ──────────────
  // SECURITY. cmc_module3_sections and cmc_source_objects were unique on keys
  // that omit organization_id (migrations/0016:22, migrations/0017:102,107).
  // Uniqueness is what ON CONFLICT arbitrates against, so an org-blind key
  // decides WHOSE ROW an upsert lands on — and the Module 3 compile route
  // upserted on (project_id, section_key), matching any tenant's row for that
  // project id while the DO UPDATE SET left organization_id alone.
  //
  // This one MUST be on the durable path, not just in migrations/. The root
  // tree is applied only by install-fresh (new databases). Every already-
  // provisioned database — which is every database that has the defect — gets
  // schema only from this list. Landing the code fix without this entry would
  // ship an ON CONFLICT clause naming an index that does not exist there:
  // "there is no unique or exclusion constraint matching the ON CONFLICT
  // specification" (42P10) on every compile. Merged-but-never-applied is the
  // failure mode this module exists to prevent; here it would also be an
  // outage.
  'migrations/20260728_cmc_module3_org_scoped_uniqueness.sql',

  // Part 11 attribution. c2c_snapshot_section_version() hardcoded author_kind
  // to 'human' for every superseded version, so AnA-generated text entered the
  // immutable ledger claiming a person wrote it. The section row's own
  // draft_source is mutable and overwritten by the next edit, which makes the
  // version ledger the only durable record of AI involvement — and it was
  // uniformly wrong. CREATE OR REPLACE FUNCTION only; no table is altered and
  // no existing row is rewritten.
  'migrations/20260728_c2c_section_version_author_kind.sql',

  // authoring_comments never had the eight columns its own API references —
  // parent_comment_id, user_name/user_email, position_data, the resolution
  // trio, updated_at. GET /docs/:id/comments and its reply sub-query were
  // therefore unconditional 42703 failures. All additive and nullable, so no
  // backfill; guarded on the table so it no-ops where the authoring bundle is
  // absent.
  'migrations/20260728_authoring_comments_threading.sql',

  // Governed binding: authoring_documents.c2c_document_id. c2c_documents is the
  // system of record for a regulatory filing; the authoring stack is the editing
  // layer over it, and this column is the join. MUST follow the authoring bundle
  // and the c2c document schema — it is guarded on both, so it no-ops rather
  // than aborting the set where either is absent. Nothing is backfilled:
  // historical authoring documents carry no derivable doc_type/agency, and
  // inventing a regulatory class for a past record would be worse than leaving
  // it unbound.
  'migrations/20260728_authoring_document_governed_binding.sql',
  // Reconcile lumen_data_atoms embeddings onto 1536 dimensions (audit P0c). The
  // superseded db/migrations/20260125_add_atom_embeddings.sql declared the column
  // and the search_atoms_* functions at vector(3072) and was never in this set, so
  // on real databases the column/functions are absent and the 1536 write + hybrid
  // search silently failed. Self-guarding: creates-or-reconciles, and only needs
  // lumen_data_atoms (present via the drizzle baseline the preflight verifies).
  'db/migrations/20260730_fix_atom_embedding_dimension.sql',

  // ── The 21 CFR Part 11 e-signature path (ledger C-17/C-19/C-20) ────────────
  //
  // These reconcile the drizzle push surface with the incremental-deploy lineage
  // for the entire signing path. They were authored into db/migrations and the
  // manifest, but the manifest APPLIES NOTHING — only this set (and drizzle-kit
  // push at one-time fresh install) is durable — so on an existing customer DB
  // that deploys incrementally they never landed. Adding them here is what makes
  // the release-signature gate actually work on such an environment. ORDER
  // MATTERS: the orchestrator store must exist before the e-sig port widens its
  // status CHECK; the users/auth columns are independent. All additive and
  // guarded (CREATE/ALTER ... IF NOT EXISTS), so idempotent where push already
  // provisioned them.
  'db/migrations/20260725_submission_orchestrator_store_port.sql',
  'db/migrations/20260725_esig_gate_columns_port.sql',
  'db/migrations/20260725_users_signing_lockout_columns.sql',

  // ── Golden-journey-proven, deploy-dead migrations (ledger C-1/C-8/C-10/C-16) ─
  //
  // Each file below creates tables that the product's own golden-journey tests
  // exercise end-to-end, yet NONE was on a durable apply path: none carries the
  // `_gcc_` infix (CI psql loop skips them), all live in db/migrations (the
  // install-fresh root overlay never sees them), none is in the drizzle journaled
  // baseline, and — decisively — NOT ONE of their primary tables is defined in
  // shared/schema.ts, so drizzle-kit push does not create them on a fresh install
  // either. They existed on NO real database, fresh or incremental. The only
  // record that "declared" them was db/migrations/migrations_manifest.json, which
  // applies nothing. This is the same code-derived-only gap the C-11 authoring
  // loop tables had; the fix is the same — put them on this list, the one durable
  // path a real deploy runs.
  //
  // ORDER MATTERS:
  //   ind_section_tracking creates project_sections (+ the section-tracking
  //     tables); the content_columns ALTER below widens it, so it must land first.
  //   assumption/decision/contradiction is the operating-system core — self-
  //     contained, only FKs itself + organizations/projects.
  //   governance_boundary FKs concept2cure_artifacts (a base table push
  //     provisions and deploy-migrate asserts is present before this loop).
  //   resolution_orchestration creates the resolution_* / supersession tables and
  //     their enum types (each guarded by DO $$ … EXCEPTION WHEN duplicate_object,
  //     so re-runnable).
  //   bundle_execution_receipts (ADR-0009) carries bundle_id as a plain UUID —
  //     no FK — but is conceptually downstream of the bundles above; listed after.
  //   project_sections_content_columns ALTERs project_sections and self-guards on
  //     ALTER TABLE IF EXISTS, so it no-ops if ind_section_tracking is absent.
  //
  // All six are idempotent (CREATE TABLE/INDEX IF NOT EXISTS, ALTER … IF EXISTS /
  // ADD COLUMN IF NOT EXISTS, DO-block-guarded types), open no transaction of
  // their own, and contain no DROP/TRUNCATE — safe under the repeated-run
  // contract. A new CI lineage-reachability guard asserts every golden-journey-
  // declared migration is present on a durable applier, so this class of gap
  // fails the build instead of shipping silently.
  // Reconciliation MUST precede the ind-section-tracking entry below: that
  // file's CREATE TABLE IF NOT EXISTS no-ops against the baseline
  // project_milestones shape and its CREATE INDEX ON (target_date) then
  // halts the whole run (blank-DB provisioning audit 2026-07-30). This lands
  // the additive union of both rival shapes first — which is also what the
  // one live consumer (project-sections.ts) actually needs, since its INSERT
  // straddles the two.
  'db/migrations/20260730_project_milestones_reconciliation.sql',
  'db/migrations/20260220_ind_section_tracking.sql',
  'db/migrations/20260323_assumption_decision_contradiction.sql',
  'db/migrations/20260725_governance_boundary_tables.sql',
  'db/migrations/20260725_resolution_orchestration_tables.sql',
  'db/migrations/20260725_bundle_execution_receipts.sql',
  'db/migrations/20260725_project_sections_content_columns.sql',

  // eCTD project-level compilation unblock (ledger C-16). shared/schema.ts was
  // corrected to make ectd_compilations.module_id and .compiled_by nullable — a
  // PROJECT-level compilation spans every module and has no interactive user, so
  // the NOT NULLs made POST /api/ectd-compile/:projectId/compile impossible. But
  // a schema.ts edit only reaches FRESH installs (via drizzle-kit push); every
  // EXISTING customer database still carries the original NOT NULLs and rejects
  // the insert. This ALTER is the existing-database half of that fix and was
  // itself deploy-dead (db/migrations, no `_gcc_`, not in the journal). Both
  // statements are ALTER … IF EXISTS … DROP NOT NULL — a no-op once dropped, so
  // idempotent and safe where push already provisioned the nullable shape.
  'db/migrations/20260725_ectd_compilations_project_level.sql',
  // eCTD sequence-continuity gate unblock (ledger C-31). ectd_compilations
  // carried NEITHER application_number NOR sequence_number in any definition, yet
  // ectd-validator-hardening.ts's detectSequenceGaps (step 5 of the hardened
  // gateway-readiness gate) SELECTs both from it — so the query threw
  // `column does not exist`, the catch reported a false "database unreachable",
  // and every submission was blocked. Adds the two columns (nullable) + an
  // application_number index. Existing-database half of the fix; fresh installs
  // get the columns from shared/schema.ts via push. Additive ALTER … ADD COLUMN
  // IF NOT EXISTS, idempotent, safe to re-run.
  'db/migrations/20260730_ectd_compilations_sequence_columns.sql',
  // ── Part 11 DB-level immutability (added 2026-07-30, auth/e-sig audit) ────
  // electronic_signatures: DELETE always refused; UPDATE refused except the
  // write-once supersession transition (superseded_by NULL → id).
  // device_audit_trail: strictly append-only (no UPDATE, no DELETE).
  // MUST follow the e-sig gate port above — the trigger reads superseded_by,
  // which that port adds. Idempotent (CREATE OR REPLACE FUNCTION + conditional
  // CREATE TRIGGER, to_regclass guarded). Proven by
  // tests/schema-contract/esig-audit-immutability.contract.test.ts; policy in
  // docs/compliance/part11-immutability-record-class-policy.md.
  'db/migrations/20260730_esign_audit_db_level_immutability.sql',
  // Orchestrator run-ledger hardening (same audit's P1 follow-ups): run rows
  // gain write-once workflow_version + dependency_graph_digest provenance
  // columns (the service now SELECTs and INSERTs them — schema-shape errors
  // are deliberately fatal there, so this entry must ship with that code);
  // the step-events FK drops ON DELETE CASCADE for RESTRICT (deleting a run
  // can no longer erase its history); and a trigger makes step events
  // append-only at the database. MUST follow the orchestrator store port.
  // Idempotent (ADD COLUMN IF NOT EXISTS; FK swap only rewrites a CASCADE;
  // conditional trigger). Proven by
  // tests/schema-contract/orchestrator-ledger-hardening.contract.test.ts.
  'db/migrations/20260730_orchestrator_run_ledger_hardening.sql',
  // Release-gate OQ-3 backstop: UNIQUE partial index on the active release
  // signature per (org, payload-digest), scoped to signature_type =
  // 'submission-release' so document multi-signing is unaffected. MUST follow
  // the e-sig gate port (adds bound_payload_digest/superseded_by) and the
  // immutability migration (its dedup pre-step uses the permitted superseded_by
  // transition). Idempotent (guarded dedup + CREATE UNIQUE INDEX IF NOT EXISTS).
  'db/migrations/20260730_release_signature_uniqueness.sql',
  // ── Blank-DB provisioning audit (added 2026-07-30) ────────────────────────
  // Three creators the fresh-install overlay needed and existing databases
  // may equally lack (merged ≠ applied, again):
  //   ai_trace_chain — the ONLY creator of ai_threads + the provenance chain
  //     (8 live server files query them); was in db/migrations on no durable
  //     path, so root file 0011 could never ALTER ai_threads on fresh DBs.
  //   cmc_projects reconstruction — code-derived (C-11 pattern) creator for a
  //     table with NO DDL anywhere, yet INSERTed by the CMC blueprint route
  //     and FK-referenced by migrations/0006_regulatory_atoms.sql.
  //   fk_delete_policies port — guarded port of root 0008, whose first pair
  //     targets retired user_sessions and aborted the file's 16 live FK
  //     delete-policies on every fresh install.
  // All idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS + re-ADD /
  // to_regclass guards).
  'db/migrations/20260224_ai_trace_chain.sql',
  'db/migrations/20260730_cmc_projects_reconstruction.sql',
  'db/migrations/20260730_manufacturing_processes_reconstruction.sql',
  'db/migrations/20260730_fk_delete_policies_port.sql',

  // eSTAR filing journey — client registration (the four FDA prerequisites),
  // the program-agnostic filing tracker (status + review clock), and the
  // project link that joins tracking to the PM spine. Order matters: the
  // project-link ALTER requires estar_submissions to exist. All idempotent
  // (CREATE TABLE / ADD COLUMN / CREATE INDEX ... IF NOT EXISTS).
  'migrations/20260730_estar_registration.sql',
  'migrations/20260730_estar_submission.sql',
  'migrations/20260730_estar_submission_project_link.sql',

  // Work items: source_ref for string/UUID-keyed sources (correspondence
  // issues), so those rows stop sharing the (source_type, source_id=0) key.
  'migrations/20260730_work_item_source_ref.sql',
  // C2C work items source uniqueness: enforce dedup key via constraint.
  // upsertProjectWorkItem uses read-then-write (SELECT then INSERT/UPDATE),
  // which is racy: concurrent requests can both see no row, both try to INSERT,
  // and one fails. A unique constraint on (org_id, source_type, source_id)
  // prevents both rows from landing and lets the code switch to INSERT ... ON
  // CONFLICT for atomicity. Self-guarding: errors if duplicates exist.
  'db/migrations/20260810_c2c_work_items_source_uniqueness.sql',

  // ── Deploy-dead creators, wired (ledger C-32) ────────────────────────────
  // Five files that CREATE tables live server code queries, but that sat on no
  // durable apply path at all: not `_gcc_`, not in the drizzle journal, not in
  // install-fresh's named lists, and their tables are not on the drizzle push
  // surface either. Every table below therefore existed on NO real database and
  // its endpoints 500'd with missing-relation errors — while `ci:unbacked-tables`
  // reported them "backed", because that guard counts any non-archived .sql file
  // as a creator regardless of whether an applier ever runs it (the blind spot
  // ci:migration-reachability now closes).
  //
  // All five were verified before wiring: applied twice against a blank Postgres
  // (idempotent, clean re-run), every CREATE TABLE/INDEX is IF NOT EXISTS, every
  // CREATE POLICY sits in a pg_policies-guarded DO block, and every FOREIGN KEY
  // is self-referential — so they carry no ordering dependency on anything
  // outside themselves and cannot abort a deploy on a missing FK target.
  //
  // 082 backs the eCTD submission-agent surface (server/services/
  // ectd-submission-agent.ts behind the MOUNTED ectd-submission-agent.routes),
  // and C-32 adds its tenant_isolation_policy block — 0021 has already run on
  // this path and would never revisit these new tables, which under
  // RLS_ENFORCE=on would leave every tenant's submission history cross-tenant
  // readable. Its ectd_submissions also feeds the C-31 sequence-continuity gate.
  'db/migrations/082_ectd_submission_agent.sql',
  // The four 20260730 "resolution" files: written to clear referenced-but-
  // uncreated table debt (see the ratchet note in referenced-tables-baseline.json,
  // which credits them with resolving 20 missing tables) — but never put on an
  // applier, so the debt was marked resolved while the tables still reached no
  // database. Each already carries its own tenant_isolation_policy DO block.
  'db/migrations/20260730_cmc_evidence_tables.sql',
  'db/migrations/20260730_submission_center_tables.sql',
  'db/migrations/20260730_graphrag_knowledge_tables.sql',
  'db/migrations/20260730_licensing_ip_tables.sql',

  // ── Deploy-dead creators, batch 2 (ledger C-33) ──────────────────────────
  // Forty more files in the C-32 class: they CREATE tables live server code
  // queries, and sat on no durable apply path, so those tables existed on no real
  // database. Selected mechanically from the ci:migration-reachability baseline
  // and verified the same way — each was applied TWICE against a BLANK Postgres
  // in isolation and came up clean, which proves three things at once: every
  // CREATE TABLE/INDEX is idempotent (the re-run is a no-op), the file is
  // self-contained (it needs no table, schema or extension it does not itself
  // create — nothing here can abort a deploy on a missing dependency), and it
  // carries no non-integer tenant key (see the sweep note below).
  //
  // Excluded by that same screen, deliberately:
  //   • files needing prerequisites a blank DB lacks (organizations/users, the
  //     `vector`/`pgcrypto` extensions, the predicate/precedent/core schemas) —
  //     they may well be fine on a real database, but "probably fine" is how this
  //     class of defect got here; they stay baselined until verified against a
  //     real base schema.
  //   • 20260125_ai_provider_audit_log / 20260324_ana_kernel_decision_log /
  //     20260326_conversation_os_durability_phase2 — uuid/text tenant keys, the
  //     same identity-model collision as C-27/C-29. Wiring them would provision
  //     tenant tables the integer-keyed RLS model cannot police. Needs a
  //     decision, not a wiring.
  //   • db/migrations/_consolidated/** — ledger C-29 Class 3 (its only creators
  //     also redefine users/tenants with TEXT keys).
  'db/migrations/022_stability_v2.sql',
  'db/migrations/024_stability_step3.sql',
  'db/migrations/030_stability_results.sql',
  'db/migrations/20260129_phase5_intelligent_document_system.sql',
  'db/migrations/20260206_phase5_contradiction_scanner.sql',
  'db/migrations/20260206_phase5_evidence_fabric.sql',
  'db/migrations/20260207_phase6_6_predicate_intelligence.sql',
  'db/migrations/20260223_ivdr_binder_packs.sql',
  'db/migrations/20260306_chat_tool_runs.sql',
  'db/migrations/20260317_global_regulatory_compliance.sql',
  'db/migrations/20260322_regulatory_precedent_intelligence.sql',
  'db/migrations/20260323_reactive_dependency_layer.sql',
  'db/migrations/20260324_ai_goal_plan_runs.sql',
  'db/migrations/20260324_ai_kernel_agent_protocol_events.sql',
  'db/migrations/20260324_ai_kernel_decision_records.sql',
  'db/migrations/20260324_ai_kernel_policy_outcomes.sql',
  'db/migrations/20260325_ai_goal_plan_step_events.sql',
  'db/migrations/20260325_decision_receipts.sql',
  'db/migrations/20260326_conversation_os_durability.sql',
  'db/migrations/20260508_ana_submission_chat_proposals.sql',
  'db/migrations/20260520_ana_failure_learning.sql',
  'db/migrations/20260520_document_templates.sql',
  'db/migrations/20260520_regulatory_intelligence_layer.sql',
  // Nonclinical study-summary display fields (duration_label, key_finding,
  // finding_class). This file was in the tree but in NO list — neither wired
  // here nor recorded as deliberately unwired — so it was silently never
  // applied, which is precisely the "merged ≠ applied" gap this set exists to
  // close. server/services/nonclinical/nonclinical-service.ts selects
  // s.duration_label and s.key_finding in two statements, and Postgres rejects
  // an unknown column at plan time, so GET /api/nonclinical/studies returned
  // 500 "column s.duration_label does not exist" on every request against a
  // correctly provisioned database.
  //
  // Safe to wire: the migration is additive, nullable, non-destructive, wrapped
  // in `IF to_regclass(...) IS NOT NULL` and uses ADD COLUMN IF NOT EXISTS, so
  // it is a no-op on a schema that predates the table and idempotent everywhere
  // else. Ordered after 20260610_nonclinical_send.sql creates the table.
  'db/migrations/20260716_nonclinical_display.sql',
  'db/migrations/20260717_agency_meetings_store.sql',
  'db/migrations/20260717_design_controls_store.sql',
  'db/migrations/20260717_evidence_asks_store.sql',
  'db/migrations/20260717_evidence_objects_store.sql',
  'db/migrations/20260717_human_factors_store.sql',
  'db/migrations/20260717_labeling_pi_store.sql',
  'db/migrations/20260717_maa_module1_store.sql',
  'db/migrations/20260717_nda_m1_docs_store.sql',
  'db/migrations/20260717_nda_rtf_store.sql',
  'db/migrations/20260717_program_journey_store.sql',
  'db/migrations/20260718_pediatric_orphan_cards.sql',
  'db/migrations/20260718_smpc_sections_store.sql',
  'db/migrations/20260724_qms_change_control_store.sql',
  'db/migrations/20260730_cmc_change_control_store.sql',
  'db/migrations/20260801_hf_files_store.sql',
  'db/migrations/20260801_market_access_store.sql',
  'db/migrations/20260801_reg_change_store.sql',
  // Landed the same day as this batch, with a live writer (labeling-pi-service.ts
  // via POST /api/labeling-pi) and no applier — a fresh instance of the very class
  // C-32's guard exists to catch, caught by that guard. Same screen: idempotent,
  // self-contained on a blank DB, integer organization_id.
  'db/migrations/20260801_labeling_pi_store.sql',
  // Same story again, hours later: a real program-journey store with a live
  // writer (program-journey-service.ts) and no applier, flagged by the guard on
  // rebase. Same screen: idempotent, self-contained, integer organization_id.
  'db/migrations/20260801_program_journey_store.sql',

  // ── Deploy-dead creators, batch 3 (ledger C-34) ──────────────────────────
  // The fifteen files C-33 left baselined as "needs a prerequisite a blank DB
  // lacks". C-33 refused to wire them on the assumption they would be fine on a
  // real database; C-34 stops assuming and verifies them against a BASE-SCHEMA
  // FIXTURE instead — the drizzle journal's 290 CREATE TABLE blocks, the contrib
  // extensions a real cluster has (pgcrypto / pg_trgm / uuid-ossp / citext), the
  // named schemas, and then the whole C2C set applied ahead of them, i.e. the
  // state a deploy actually presents. Each was then applied TWICE and checked for
  // a non-integer tenant key, exactly as batches 1-2 were.
  //
  // Order matters here and is the order they were verified in: several depend on
  // tables the entries ABOVE create (026_stability_step4 needs stab_studies from
  // 022_stability_v2; 20260520_growth_mindset_extensions needs
  // intelligence.failure_patterns from 20260520_ana_failure_learning), which is
  // precisely why they failed the blank-DB screen and pass this one.
  'db/migrations/026_stability_step4.sql',
  // ── Stability tenant isolation + backing (relocated here from ~line 146) ──
  // Placed AFTER the stab_* core creators (022/024/030/026) so the isolation
  // sweep sees the existing stab_* tables to policy, and the backing file's
  // v_stab_* view guards (stab_timepoints/stab_conditions) are satisfied on a
  // fresh DB. Both remain far before the two final 20260801 isolation sweeps.
  // ── Stability module tenant isolation (High-severity security fix) ────────
  // docs/security/STABILITY_TENANT_ISOLATION_FINDING.md. The stability router scoped
  // GMP data by surrogate id with no tenant predicate, and its
  // set_config('app.tenant_id', …) calls were inert because the app's RLS keys on
  // app.current_tenant_id. This brings every EXISTING stab_* base table under the
  // uniform tenant_isolation_policy (the 0021 shape) with ENABLE + FORCE RLS, and
  // defaults tenant_id from the request so the router's INSERTs auto-tag.
  //
  // ORDER MATTERS: this MUST precede the backing-tables entry below. It opens with
  // BEGIN; — applyMigrationFiles' selfTransacting detection handles that, so it is
  // not double-wrapped. Catalog-driven, so it is a no-op (not an error) on a
  // database where the stab_* tables do not exist yet.
  'db/migrations/20260728_stability_tenant_isolation.sql',
  // Backs the seven previously-unbacked stab_* tables, the shared cmc_methods
  // catalog and the two v_stab_* views, tenant-isolated FROM BIRTH (tenant_id
  // INTEGER NOT NULL defaulting from app.current_tenant_id, plus the same policy
  // loop). Backing them without that isolation would convert a fail-safe 500 into a
  // real cross-tenant leak, which is why it follows the migration above. cmc_methods
  // is deliberately created WITHOUT a tenant column: it is a global methods catalog
  // joined by id and never tenant-filtered, and scoping it would hide every method.
  'db/migrations/20260728_stability_backing_tables.sql',
  'db/migrations/081_grdhe_regulatory_mapping_layer.sql',
  'db/migrations/20260209_phase6_6a_fda_ingest_runs.sql',
  'db/migrations/20260211_phase6_6d_defense_packets.sql',
  'db/migrations/20260211_phase6_6e_proof_pack_exports.sql',
  'db/migrations/20260211_phase7_0a_render_jobs.sql',
  'db/migrations/20260220_user_intelligence_platform.sql',
  'db/migrations/20260322_quality_checkpoints.sql',
  'db/migrations/20260326_artifact_compute_plane.sql',
  'db/migrations/20260331_communication_center_scaffold.sql',
  'db/migrations/20260331_regulatory_correspondence_os.sql',
  'db/migrations/20260401_submission_center_items.sql',
  'db/migrations/20260508_artifact_citations.sql',
  'db/migrations/20260520_growth_mindset_extensions.sql',
  'db/migrations/20260621_weekly_usage_limits.sql',

  // ── C-40: reconcile databases that ALREADY have the broken shape ─────────
  // MUST precede the two corrected migrations below. C-36 and C-38 express their
  // fixes as CREATE TABLE IF NOT EXISTS — right for a database that lacks the
  // table, and a NO-OP for one that has it in the uuid shape. At least one real
  // database is in exactly that state: reports/phase0/db_inventory.txt lists
  // ai_provider_audit_log, lumen_knowledge_graph_edges and lumen_atom_versions.
  // Without this step both fixes would ship and change nothing there — the same
  // "merged, green, never applied" failure, one level deeper.
  //
  // It drops such a table ONLY when it is empty (the next migrations recreate it
  // canonically); a populated one is left untouched with a loud WARNING, because
  // discarding audit attribution to satisfy a type change is not a decision a
  // deploy script may make (21 CFR Part 11 §11.10(e)).
  'db/migrations/20260801_atom_identity_existing_db_reconciliation.sql',

  // ── C-36: enhanced cortex, unblocked by fixing the identity conflict ─────
  // Six tables behind five live services (knowledgeGraphService, atomVersion-
  // Service, atomQualityService, conflictDetectionService, enhancedEmbedding-
  // Service). C-34 left it baselined because its atom foreign keys were declared
  // UUID while the canonical lumen_data_atoms.id is `serial` — the FK was
  // literally unimplementable, and even without it the services' own
  // `... JOIN lumen_atom_quality_scores q ON a.id = q.atom_id` would have failed
  // with "operator does not exist: integer = uuid". The file was written against
  // an imagined uuid-keyed atom store that does not exist on any database.
  // C-36 converts every ATOM-id reference to INTEGER to match the canonical key
  // (each table's own `id UUID PRIMARY KEY` is untouched — those are their own
  // identities, not atom references). Verified against the base fixture: applies
  // twice, all six tables created, both previously-impossible FKs now present,
  // and the services' real JOIN typechecks.
  'db/migrations/20260125_enhanced_cortex_schema.sql',
  //
  // Five remain unwired, each for a named reason rather than an unexamined
  // "probably fine" (they stay in the ci:migration-reachability baseline):
  // ── C-37: the pgvector trio, verified on a REAL Postgres ─────────────────
  // C-33/C-34 left these baselined as "unverifiable" because the PGlite harness
  // cannot load the `vector` extension. That was a limitation of the harness, not
  // a property of the files — so C-37 replaced the harness rather than accepting
  // the gap: a real PostgreSQL 16 + pgvector 0.6.0 instance, seeded with the
  // drizzle journal base schema and the whole C2C set, then each file applied
  // TWICE. All three come up clean and idempotent.
  //
  // Wiring them is consistent with what the deploy path ALREADY assumes: two
  // files needing `vector` (20260730_fix_atom_embedding_dimension and
  // 20260730_graphrag_knowledge_tables) are long-standing members of this list,
  // and 001_gcc_core.sql creates the extension. Each file below also issues its
  // own CREATE EXTENSION IF NOT EXISTS vector.
  //
  // Order is a real dependency: risk_rollups reads predicate.fda_510k_clearances,
  // which the clearance-universe file creates — which is exactly why it failed
  // the earlier screen in isolation.
  //
  // These tables carry NO tenant column, verified against the live instance: the
  // FDA 510(k) clearance universe and regulatory precedents are public reference
  // data every tenant reads, so the isolation sweep correctly leaves them alone.
  'db/migrations/20260207_phase6_6a_fda_clearance_universe.sql',
  'db/migrations/20260306_precedent_engine.sql',
  'db/migrations/20260208_phase6_6a_risk_rollups.sql',

  // ── C-38: the three identity collisions, reconciled to canonical ─────────
  // C-33 excluded these because their tenant keys were uuid/text, which the
  // integer-keyed RLS sweep cannot police — wiring them would have provisioned
  // tenant tables with no isolation. The right resolution was never "leave them
  // dead"; it was to reconcile them to the canonical identity, which the code
  // ALREADY uses:
  //   • ai_provider_audit_log.organization_id was UUID — canonical organizations.id
  //     is `serial`. user_id/project_id were UUID too, and canonical users.id /
  //     projects.id are also `serial`, so a real id would have been REJECTED by
  //     those columns. All three are now INTEGER.
  //   • ana_kernel_decision_log.tenant_id was TEXT. Nothing writes the table and
  //     no query filters on tenant_id (server/src/control-plane/persistent-
  //     queries.ts issues three aggregate reads), so the conversion is safe and
  //     is what lets the sweep isolate it.
  //   • conversation_os_accepted_artifact_versions.organization_id was TEXT, while
  //     server/routes/conversation-os.ts does `String(authUser.organizationId)` on
  //     the way in and `Number(ctx.organizationId)` on the way out — the identity
  //     was always an integer org id; only the column disagreed.
  // Each verified on a real PostgreSQL 16: applies twice, clean.
  'db/migrations/20260125_ai_provider_audit_log.sql',
  'db/migrations/20260324_ana_kernel_decision_log.sql',
  'db/migrations/20260326_conversation_os_durability_phase2.sql',

  // ── C-39: the _consolidated tree's live tables, extracted ────────────────
  // C-29 Class 3 quarantined db/migrations/_consolidated wholesale. Auditing it
  // file by file showed the blanket was too wide (only 001_create_core_tables
  // redefines users/organizations) but that wiring the rest was still wrong:
  // 012_document_authoring_schema creates a rival `doc_revisions` against the
  // canonical authoring subsystem, and programs/literature_entries/maud_* all
  // carry uuid/text tenant keys the integer RLS sweep cannot police.
  //
  // So the ten live tables are EXTRACTED into one canonical migration and the
  // tree stays quarantined. The extraction also fixes two definition-vs-consumer
  // mismatches that provisioning alone would not have: `templates` had no
  // `sections` column though the (since-deleted, D11b) cerGenerator selected
  // it, and `doc_sections` keyed on
  // `section_id` though command-executor selects `id`. Verified on a real
  // PostgreSQL 16: applies twice, and every consumer's actual query executes.
  'db/migrations/20260801_consolidated_tree_reconciliation.sql',

  // ── Character-span lineage (the "every span traces to a source" rule) ───────
  // The first table able to state (document, char_start, char_end) → source +
  // how used. Anchored to cre_evidence_sources through the same
  // source/reference_id/payload_sha256 convention authoring_citations uses, so
  // the canonical Data Room identity stays the one identity; see the migration
  // header for why none of the six existing primitives can carry this.
  //
  // MUST stay ABOVE 20260801_tenant_isolation_sweep.sql: the sweep policies the
  // tenant-scoped tables the set has created by the time it runs, and this one
  // is tenant-scoped (organization_id). Added after the sweep it would be
  // created but never isolated.
  'db/migrations/20260803_document_span_lineage.sql',

  // ── Draft-accept store for automated span-level source attribution ──────────
  // Parks an AI draft's retrieved chunks (content + resolved cre_evidence_sources
  // .id) so the accept endpoint can re-verify quotes VERBATIM against them inside
  // the section-content transaction (SOURCE_ATTRIBUTION_AUTOMATED_DESIGN.md Phase
  // 3a). Tenant-scoped (organization_id); it declares RLS inline AND sits above
  // the sweep — belt and suspenders — for the same reason document_span_lineage
  // must precede the sweep: added after it, the table would exist but never be
  // isolated on an already-provisioned database.
  'db/migrations/20260809_source_attribution_draft_candidates.sql',

  // ── Rule-pack outlines: the five stubs replaced with real trees ────────────
  // 20260529_phase9_backfill seeded nda/bla/maa/jnda/denovo as five top-level
  // rows apiece and said the full outlines would land "in a later kit". They
  // never did, so a biotech org creating its BLA — the segment's headline
  // pathway — was scaffolded a five-node dossier by scaffoldProjectDocuments()
  // and the Vault tree, the outline endpoint and the authoring canvas all
  // faithfully rendered those five nodes.
  //
  // Data-only: INSERTs the full packs as NEW versions and marks the stubs
  // superseded, so documents already built against 'ich-m4-v2.0' keep the pack
  // they were actually built from (Part 11) while new projects get the real
  // outline. Wrapped in a to_regclass guard, so on a database that never had
  // the Phase 9 schema it raises a NOTICE and skips rather than aborting the
  // deploy — the same bare-CI-safe pattern 20260529 uses.
  'migrations/20260804_phase9_rule_pack_outlines.sql',
  'migrations/20260806_cta_ema_ctr536_outline.sql',
  // Widens the c2c_documents doc_type CHECK to admit 'anda' and 'ide' and seeds
  // both packs. The widening is a strict superset of the previous IN-list, so no
  // existing row can be invalidated by it — which is why it needs no backfill
  // and is safe to re-apply. Same to_regclass guard as the two above; the CHECK
  // half additionally uses DROP CONSTRAINT IF EXISTS, because on a drizzle-push
  // database the table exists while the named constraint does not.
  'migrations/20260806b_anda_ide_filing_types.sql',
  // pma:fda was six flat sections from 20260528 and never revisited — the same
  // hollow-outline defect 20260804 fixed for five other packs. Replaces it with
  // the real 21 CFR 814.20(b) tree as a NEW version and supersedes the stub, so
  // documents already built against fda-pma-2024 keep the pack they were built
  // from. Same to_regclass guard as its three siblings.
  'migrations/20260810_pma_fda_814_20_outline.sql',
  // EU MDR 2017/745 and IVDR 2017/746 technical documentation. Widens the
  // doc_type CHECK for 'mdr' and 'ivdr' (a strict superset, so no existing row
  // can be invalidated) and seeds both packs. Thirteen EU device and diagnostics
  // filing types were scaffolding US NDAs before this.
  'migrations/20260810b_eu_mdr_ivdr_outlines.sql',
  // Records what each rule pack was built FROM. Every outline in the table was
  // presented to a filer with identical authority, but an ICH M4 spine, a
  // transcription of 21 CFR 814.20(b) and a reasoned construction against a
  // regulation that enumerates nothing are three different kinds of claim.
  // Backfills the conservative value first so an unenumerated pack under-claims,
  // and marks every pack 'unreviewed' — including the FDA ones, because none has
  // had a regulatory professional's sign-off. Must run AFTER the pack seeds
  // above so the backfill sees them. Same to_regclass guard as its siblings.
  'migrations/20260810c_rule_pack_provenance.sql',
  // 20260810c recorded WHETHER a pack was reviewed and set every one to
  // 'unreviewed'. It did not constrain what a future write could claim: nothing
  // stopped review_status='reviewed' with no record of who, when, or against
  // what tree. 'reviewed' is the one value in this schema a filer is entitled
  // to rely on, so an unattributed one would carry a professional's authority
  // while representing nobody. This adds reviewed_by / reviewed_at /
  // review_scope / reviewed_sections_sha, a CHECK that refuses an unattributed
  // sign-off, a CHECK that refuses leaving a reviewer's name on a withdrawn
  // one, and a view reporting reviewed-but-changed when the tree moves out from
  // under an honest review. Marks nothing reviewed. Must run AFTER 20260810c.
  'migrations/20260810d_rule_pack_review_attribution.sql',
  //   • 068_regulatory_schema_alignment — creates only regulatory.information_
  //     requests, which C-35's schema-qualification fix showed is not referenced
  //     by server code at all. It is dead schema, not a live gap; the "missing
  //     regulatory.submissions creator" C-34 recorded here was an artifact of the
  //     guard bug C-35 fixed. Left unwired because nothing needs it.
  //   • 20260125_enhanced_cortex_schema — RESOLVED by C-36 and wired above; its
  //     UUID-vs-serial atom-key conflict was the defect, not an ordering gap.

  // ── Performance indexes on hot-path tables (added 2026-08-10) ────────────────
  // Indexes on the 30 most-queried tables targeting organization_id (tenant
  // isolation), projectId (project-scoped queries), status+type (common filters),
  // and createdAt DESC (pagination). All use CREATE INDEX CONCURRENTLY IF NOT
  // EXISTS for idempotent application. This file was written into migrations/ but
  // WAS NOT on this list, so it was never applied to production databases despite
  // being essential for query performance. Landing it here closes that gap.
  'migrations/20260331_performance_indexes.sql',

  // ── unified_documents / workflow_document_versions (ledger C-29, #1239/#1242) ──
  // Both tables are defined in Drizzle (shared/schema/unified_workflow.ts) but
  // that module is NOT re-exported by shared/schema.ts, so drizzle-kit push
  // never creates them on a fresh install; the only raw creator
  // (db/migrations/_consolidated/…complete_schema.sql) redefines users/tenants
  // with TEXT keys (the C-29 collision) and lives where the install-fresh
  // overlay never walks. So this trio is the SOLE durable path to both tables on
  // every real database — fresh or incremental — exactly the merged-≠-applied
  // gap this list exists to close. The two ALTERs previously sat in the
  // ops-audit KNOWN_UNLISTED baseline on the (false) premise that push would
  // reproduce them; it cannot, so they move onto the durable path here too.
  //
  // ORDER MATTERS: _provision creates both tables (integer-keyed, IF NOT EXISTS);
  // _org_id adds organization_id nullable and backfills it from the parent
  // document; _org_not_null tightens it to NOT NULL. All idempotent (CREATE
  // TABLE/INDEX and ADD COLUMN IF NOT EXISTS; backfill guarded on IS NULL;
  // SET NOT NULL no-ops once set, and every row has a NOT-NULL FK parent so the
  // backfill leaves none behind). MUST precede the tenant-isolation sweep so the
  // new integer-org tables come under RLS.
  'migrations/20260729_unified_documents_provision.sql',
  'migrations/20260730_workflow_doc_versions_org_id.sql',
  'migrations/20260731_workflow_doc_versions_org_not_null.sql',

  // ── Tenant isolation for the NON-PUBLIC uuid-keyed tables (ledger C-46) ──────
  // The public sweep below is integer-keyed and public-only. The non-public
  // schemas use a uuid tenant key and were policied per-subsystem; the subsystems
  // that never added RLS (core.programs, manufacturing.*, regulatory_intel.*,
  // regulatory_harmonization.*, and gaps in cortex/compliance/global_dossier/
  // federated_ml) are closed here with the context-less-safe COALESCE policy the
  // rest of the non-public schemas already use. Explicit (schema, table, column)
  // list — the tenant key differs per table and two tables are deliberately
  // exempt (federation_participants, audit.event_log). Order-independent w.r.t.
  // the public sweep (disjoint schemas); ordered BEFORE it so the integer-keyed
  // sweep stays the final entry — ledger C-33 requires the sweep to run last
  // (asserted by tenant-isolation-sweep.contract.test.ts).
  // NOTE: migrations/20260728_authoring_reviews.sql is intentionally NOT on this
  // list (it was, redundantly, and that tripped the authoring-guard in
  // tests/ops/apply-c2c-migrations-manifest.test.mjs — table creation on the
  // authoring path belongs to the subsystem lineage, not this applier). The
  // authoring_reviews table is authoritatively created by the authoring-subsystem
  // provisioner: db/migrations/20260730_authoring_subsystem_schema.sql is in
  // AUTHORING_SUBSYSTEM_FILES and applyAuthoringSubsystem() runs on BOTH
  // install-fresh (step 4) and deploy-migrate (before this list) — so its
  // CREATE TABLE IF NOT EXISTS here was a no-op on every path. The file stays on
  // disk (applied by the install-fresh root overlay too) and is declared in the
  // test's KNOWN_UNLISTED with this same reason.

  // ── Collaboration & tasking GA (assessment D24/D25) ────────────────────────
  // Soft delete on the canonical task store: additive nullable tombstone
  // columns; every read-model filters deleted_at IS NULL; archive replaces
  // hard delete (Part 11 retention).
  'db/migrations/20260807_unified_tasks_soft_delete.sql',
  // Durable section locks: the process-local lock Map becomes a shared table
  // so restarts don't drop locks and replicas can't double-grant. Tenant-keyed
  // (tenant_id) — MUST stay ABOVE the tenant-isolation sweep so its RLS policy
  // is attached.
  'db/migrations/20260807_collab_section_locks.sql',
  // Tenant column on the task graph tables (task_dependencies /
  // cross_module_task_links) with backfill from the endpoint tasks — the
  // tables join the RLS regime via the sweep below (assessment D20).
  'db/migrations/20260807_task_graph_org_columns.sql',

  // ── 21 CFR Part 11 tamper-proof store (added 2026-08-13) ──────────────────
  // audit.tamper_proof_log had NO migration: its only creator was runtime DDL in
  // server/lib/tamper-proof-audit.ts, run on the request pool. As the
  // non-superuser app_service role that can never succeed — `audit` is granted
  // append-only (SELECT, INSERT) precisely to preserve tamper-evidence, so DDL
  // there is what must be refused — and the failure was swallowed as
  // "(non-fatal)" with a console fallback. Verified by booting the production
  // build against a database provisioned by install-fresh + deploy-migrate:
  // to_regclass('audit.tamper_proof_log') returned MISSING. The Part 11 store a
  // QA unit audits first did not exist, and the platform reported itself healthy.
  //
  // Placed BEFORE the two isolation steps because it CREATES a table, and they
  // are the final pair by contract (ledger C-33: the sweep runs last so it sees
  // everything the set creates). It needs nothing from them — the table lives in
  // the `audit` schema with no tenant column by design, an estate-wide immutable
  // ledger protected by the mutation trigger and withheld UPDATE/DELETE rather
  // than by RLS — so the ordering costs it nothing.
  'db/migrations/20260813_audit_tamper_proof_log.sql',

  // ── Knowledge-graph tenant keys (added 2026-08-13) ────────────────────────
  // knowledge_graph_nodes / _edges / lumen_knowledge_graph_edges carried NO
  // tenant column and no RLS, while their siblings (extracted_graph_edges,
  // rag_knowledge_graph, section_graph_nodes) all carry organization_id WITH
  // RLS — drift, not design. server/routes/graphrag.ts writes document entities
  // into them and reads them back with no tenant predicate, so one tenant's
  // extracted entity names were reachable by another's semantic search.
  //
  // BEFORE the two isolation steps, like every other table-creating/altering
  // migration: the sweep must see the organization_id this adds. It is also why
  // the policy here and the sweep's cannot conflict — both are guarded on
  // pg_policies, so whichever runs first wins and the other no-ops.
  'db/migrations/20260813_knowledge_graph_tenant_keys.sql',
  // ── Tenant offboarding lifecycle ────────────────────────────────────────────
  // ADD COLUMN IF NOT EXISTS only, on `organizations` — a table that predates
  // every entry above — so it has no ordering dependency of its own.
  //
  // It sits BEFORE the two isolation steps because "the isolation steps are the
  // tail of the set" is an invariant, not a default: C-33 requires the integer
  // sweep to be the very last entry, and the uuid step immediately before it
  // (tests/schema-contract/tenant-isolation-sweep.contract.test.ts,
  // uuid-tenant-isolation.contract.test.ts). An earlier revision of this entry
  // sat after the sweep, reasoning that a migration creating no TABLE has
  // nothing for the sweep to policy and is therefore exempt. That reasoning is
  // true of THIS file and is still the wrong rule to encode: "sweep last,
  // always" holds without anyone having to audit each new entry for whether it
  // creates a table, and it is the version the contract tests enforce.
  'migrations/20260813_tenant_offboarding_lifecycle.sql',

  // ── AI gateway provenance ledger (added 2026-08-13) ──────────────────────
  // ai.gateway_audit_log had no migration at all. Its only creator was runtime
  // DDL in server/services/ai-gateway/audit.ts (`CREATE SCHEMA IF NOT EXISTS ai`
  // + CREATE TABLE), run lazily on the first persist and swallowed by a catch —
  // and Postgres checks database-level CREATE BEFORE the IF NOT EXISTS
  // short-circuit, so the non-superuser runtime role was refused on statement
  // one even though the `ai` schema already exists (059_gcc_vector_embeddings).
  // scripts/ci/tables-live-schema-baseline.json confirmed it against a real
  // provisioned database: absent. Every AI call reported itself audited and
  // wrote nothing.
  //
  // BEFORE the two isolation steps, like every other table-creating entry
  // (C-33). The sweep will find no organization_id to key on — the column is
  // VARCHAR(64), inherited from the runtime DDL and left alone here so the
  // writer's `organizationId?.toString()` bind keeps working — so it will SKIP
  // with a NOTICE rather than policy it. That is the intended outcome: this is
  // an operational ledger read by admin/ops surfaces across tenants, not
  // tenant-facing data.
  'db/migrations/20260813_ai_gateway_audit_log.sql',

  // ── Parent-scoped RLS for child tables (added 2026-08-13) ────────────────
  // 21 tables held tenant data with NO tenant column, NO RLS and NO policy —
  // readable by every tenant. Found mechanically against a provisioned
  // database: of 937 public base tables, 195 have no tenant column, 170 of
  // those have no RLS at all, 78 of those are referenced by server SQL, and 21
  // of those carry an FK to a table that IS tenant-keyed. chat_messages is the
  // sharpest: every tenant's conversation bodies.
  //
  // The FK is the evidence of ownership, so these get a PARENT-scoped policy
  // rather than an organization_id column of their own — a copied tenant key is
  // a second source of truth that can drift from the parent.
  //
  // Placed with the other pre-sweep entries: it only ALTERs, but "the isolation
  // steps are the tail of the set" is an invariant (C-33), not a case-by-case
  // judgement. The sweep will not touch these tables anyway — it keys on an
  // org column they do not have, and it never replaces an existing policy.
  'db/migrations/20260813_child_table_parent_scoped_rls.sql',
  // Export receipts — what turns the purge's `finalExportDigest` precondition
  // from "a non-empty string was supplied" into "an export of THIS tenant was
  // actually produced". Creates one table, so it must precede the isolation
  // steps below (C-33: the sweep has to see everything the set creates).
  'migrations/20260813b_tenant_export_receipts.sql',

  // ── IVDR consolidation, D11d (added 2026-08-13) ───────────────────────────
  // ivdr_classifications was CREATE TABLE IF NOT EXISTS'd by three files with
  // two incompatible column shapes, so the surviving shape was decided by
  // migration order per environment (ledger C-29; duplicate-table-ddl
  // baseline). None of the IVDR creators was on THIS list, so an
  // already-provisioned database never received the tables at all and every
  // /api/ivdr surface 503'd or 500'd.
  //
  // ORDER MATTERS, and it is deliberately reconciliation-FIRST:
  //   20260813c  reconciles a pre-existing legacy (shape-1) table to the
  //              canonical shape — adds program_id BEFORE 20260508 attempts an
  //              index over it — backfills legacy → canonical column values,
  //              deprecates the legacy names, creates ivdr_gspr_assessments
  //              (previously runtime DDL), and hardens the module detail
  //              tables. Every statement no-ops where the tables are absent.
  //   20260508   THE canonical creator: ivdr_classifications (canonical
  //              shape), ivdr_per_documents, cdx_pairings/concordance,
  //              ivd_analytical_performance / ivd_clinical_performance, CLIA,
  //              LDT. All CREATE TABLE/INDEX IF NOT EXISTS — no-ops wherever
  //              push or history already provisioned them.
  //   001        the IVDR module detail tables (analytical validations,
  //              clinical evidence, CDx workflows + immutable histories) —
  //              FK-dependent on ivdr_classifications, hence after 20260508.
  //              Its rival shape-1 CREATE of ivdr_classifications is deleted,
  //              which is also what lets install-fresh apply it (it was
  //              classified-skipped before this consolidation).
  // All three precede the isolation tail (C-33) so the sweep policies the
  // org-keyed tables they create.
  'migrations/20260813c_ivdr_schema_reconciliation.sql',
  'migrations/20260508_ivd_diagnostic_surfaces.sql',
  'migrations/001_create_ivdr_tables.sql',

  // ── The tenant key 20260813d indexes, which nothing ever created ─────────
  // electronic_signatures.organization_id is declared in shared/schema.ts and
  // REQUIRED by server/services/part11/signature-persistence.ts (it throws
  // without it), but no migration created it — the drizzle-push substrate and
  // this lineage had diverged. Two things were broken by that: 20260813d below
  // fails 42703 building its index, which takes out EVERY file after it in this
  // list including the isolation sweep; and the sweep skips tables with no
  // tenant column, so the Part 11 signature record sat unpoliced rather than
  // mis-policied. MUST stay immediately before 20260813d.
  'migrations/20260813c2_electronic_signatures_tenant_key.sql',

  // ── Single e-signature write path, D6 (added 2026-08-13) ─────────────────
  // The governed sign action (/api/c2c/actions/sign) now persists an
  // electronic_signatures row in the same transaction as its ledger write.
  // Governed targets are typed pointers, not documents rows, so this relaxes
  // document_id/version_id to nullable, adds signed_target + binding_basis,
  // and installs the fail-closed anchor CHECK. Additive; ALTERs only. MUST be
  // applied before code that writes signed_target/binding_basis is live —
  // both /api/esignature/sign and the governed sign fail closed (503/500)
  // until it lands.
  'migrations/20260813d_esignature_governed_unification.sql',

  // ── Program anchor, Document Identity Contract slice C1 (added 2026-08-14) ─
  // projects.regulatory_program_id — the column live code has assumed exists
  // for a long time and that NO migration created. mdx-vault.ts filtered on it
  // while claiming "added by the MDX migration", so every program-scoped Vault
  // request raised 42703 and 500'd. That is now an honest 422 until this lands,
  // and this is what lets the real filter come back.
  //
  // MUST be on this list, not merely in migrations/: the root tree reaches only
  // fresh databases, and it is the EXISTING ones whose governed exports are
  // landing audited-but-unplaced. CREATE TABLE IF NOT EXISTS cannot add a
  // column to a table that already exists, so the guarded ALTER here is the
  // only path by which it reaches them.
  //
  // Placed with the other pre-sweep entries (C-33: the two isolation steps are
  // the tail of the set, always). It creates no table, so the sweep has nothing
  // new to policy — `projects` is a base table policied long ago — and the
  // ordering costs it nothing. No dependency on any entry above: it ALTERs
  // `projects` (a drizzle-push base table deploy-migrate asserts as a sentinel)
  // and its backfill self-guards on regulatory_programs, whose creator
  // (20260524_program_workbench_schema.sql) is deliberately not on this path.
  'migrations/20260814_projects_regulatory_program_anchor.sql',

  // ── Literature screening trail, GA ledger L4 (added 2026-08-14) ──────────
  // literature_screening_decisions — the MEDDEV 2.7/1 Rev 4 include/exclude
  // appraisal record. Literature search and recording were already end-to-end,
  // but `literature_entries` is purely bibliographic (no status column, no
  // jsonb), so a reviewer's decision and its exclusion reason were lost with
  // the session and the write path said so out loud rather than faking it.
  // The screening trail is the part a notified body audits.
  //
  // MUST be on this list, not merely in migrations/: the root tree reaches only
  // fresh databases, and it is the EXISTING ones running clinical evaluations.
  // Until it lands, POST /api/cerv2/literature/screen refuses 422 with the real
  // reason (relation absent) — it never pretends to have persisted a decision.
  //
  // MUST stay ABOVE the isolation sweep below: this is the entry that creates a
  // NEW integer-keyed tenant table, and the sweep is what attaches
  // tenant_isolation_policy to it. Below the sweep it would be provisioned
  // cross-tenant readable under RLS_ENFORCE=on. No dependency on any entry
  // above — it is FK-free by the same reasoning as 20260814 (its parents
  // `literature_entries` and `regulatory_programs` differ in column type across
  // lineages / reach no durable applier respectively).
  'migrations/20260814b_literature_screening_decisions.sql',

  // ── PMCF enrolment progress, GA ledger L5 (added 2026-08-14) ─────────────
  // pmcf_enrollment_records — the EU MDR Annex XIV Part B §6.2 / MDCG 2020-7
  // execution evidence behind the CER's post-market section. The PMCF PLAN was
  // already real (post_market_documents + pmcf-plan-generator.ts); what a
  // notified body actually audits is plan-vs-actual — which activities were
  // committed to, how many subjects are enrolled against each planned sample
  // size, as of when. That had no backend at all, so the workbench rendered kit
  // fixtures behind the sample gate and said so in prose.
  //
  // MUST be on this list, not merely in migrations/: the root tree reaches only
  // fresh databases, and it is the EXISTING ones carrying CE-marked devices
  // under active follow-up. Until it lands, the read path answers 422 naming
  // the unapplied migration and the write path refuses — neither pretends.
  //
  // MUST stay ABOVE the isolation sweep below: this creates a NEW integer-keyed
  // tenant table and the sweep is what attaches tenant_isolation_policy to it.
  // Below the sweep it would be provisioned cross-tenant readable under
  // RLS_ENFORCE=on. No dependency on any entry above — FK-free by the same
  // reasoning as 20260814b, and for a stronger reason: BOTH of its would-be
  // parents (`regulatory_programs`, `post_market_documents`) are absent from
  // this list, so a REFERENCES would abort the whole set on any database
  // missing either.
  'migrations/20260814c_pmcf_enrollment_records.sql',

  // ── Document alias map, GA ledger L10 / identity contract slice C2 ───────
  // c2c_document_aliases — the identity-only bridge between a canonical
  // document uuid and each store's native key. Fixes consequences 3 and 4 of
  // docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md: a filed snapshot can record
  // real lineage back to its source instead of prose, and editor deep-links
  // resolve by identity rather than by title — title matching is not identity,
  // since two sections legitimately share a title and a rename breaks the link
  // silently.
  //
  // HOLDS NO ATTRIBUTES, and that is the whole design. The registry that owned
  // identity AND metadata AND placement was built here once and reverted
  // because it competed with the stores that already own those things. The
  // invariant is enforced by scripts/ci/check-document-alias-attribute-free.mjs
  // rather than by intention — the way it would erode is one reasonable-looking
  // column at a time, not a decision to rebuild the registry.
  //
  // MUST stay ABOVE the isolation sweep below: a NEW integer-keyed tenant table
  // that the sweep attaches tenant_isolation_policy to. Below it, the table
  // would be provisioned cross-tenant readable under RLS_ENFORCE=on — and a
  // caller who knows a native id would learn another tenant's canonical
  // identity. FK-free by the same reasoning as its neighbours, and for a
  // reason particular to it: `native_id` is text precisely because it addresses
  // several stores with different key types, so it could not carry a REFERENCES
  // even if every target table were present on every database.
  'migrations/20260814d_document_alias_map.sql',

  // ── Submission leaf source pin, GA ledger L23 (added 2026-08-14) ─────────
  // Two nullable columns on submission_leaves recording the SHA-256 of the
  // source document's content at the moment a leaf was filed, and when that was
  // taken. The leaf already carried `document_id` (which resolves to the
  // document as it is NOW) and `checksum` (MD5 of RENDERED bytes, for the eCTD
  // index) — neither answers "is the document behind this filed leaf still what
  // went to the agency?".
  //
  // ADD COLUMN only, no backfill, and the absence of a backfill is the point: a
  // pin computed today from current content would manufacture agreement for
  // every existing leaf, including any whose document has since been edited —
  // exactly the case the column exists to detect. Pre-existing leaves report
  // "not pinned", which is true.
  //
  // Position is not load-bearing (it creates no table, so the isolation sweep
  // below has nothing to attach), but it stays with its siblings above the
  // sweep for readability.
  'migrations/20260814e_submission_leaf_source_pin.sql',

  // ── Section version AnA backlink, GA ledger L36 (added 2026-08-14) ───────
  // CREATE OR REPLACE of c2c_snapshot_section_version() so the version trigger
  // writes ana_action_id — a column declared in the Phase-9 schema with a FK to
  // c2c_ana_actions and written by nothing since, leaving "which AnA action
  // produced this version?" permanently unanswerable.
  //
  // Function replacement only: no table, no column, no data. It MUST run after
  // the Phase-9 schema that defines the original function, which it does by
  // position. The trigger resolves the id against c2c_ana_actions before using
  // it and writes NULL otherwise, so a stale GUC can never turn a section save
  // into an FK violation.
  'migrations/20260814f_section_version_ana_action_backlink.sql',

  // ── Section version reason required, GA ledger L34 (added 2026-08-14) ────
  // Another CREATE OR REPLACE of c2c_snapshot_section_version(), so it MUST run
  // after 20260814f — it carries that migration's ana_action_id handling
  // forward and adds the reason check on top. Position, not luck: replacing
  // these out of order would silently drop the backlink.
  //
  // The trigger now RAISES on a missing reason exactly as it already did on a
  // missing actor, instead of COALESCEing to the literal 'content change'. Both
  // current writers guarantee a non-empty reason, so nothing in the product can
  // trip it; it exists for the next writer. Function replacement only — no
  // table, no column, no data, and existing placeholder rows are left alone
  // because they truthfully record that nothing was captured.
  'migrations/20260814g_section_version_reason_required.sql',

  // ── Draft generator capture, GA ledger L33 (added 2026-08-14) ────────────
  // ADD COLUMN on authoring_ai_draft_candidates so a parked AI draft carries
  // what produced it — model, provider, and a SHA-256 of the prompt actually
  // sent. All three existed at draft time and reached only the browser, so
  // "what produced this text?" survived about as long as the tab.
  //
  // Server-side with the source chunks, deliberately: a generator round-tripped
  // through the client would be a client claim, and which model wrote a
  // regulatory section is exactly the sort of claim that must not be forgeable.
  //
  // Nullable, no backfill. Nothing recorded the generator for earlier drafts,
  // and filling it from the model registry's current default would attribute
  // text to a model that may never have seen it. The table has a 2-hour TTL, so
  // the unrecorded window closes on its own.
  'migrations/20260814h_draft_candidate_generator.sql',

  'db/migrations/20260801_uuid_tenant_isolation_nonpublic.sql',

  // ── Tenant isolation for everything the set just created (ledger C-33) ───
  // MUST BE LAST. 0021_enable_rls_everywhere runs once, on install-fresh, and
  // policies only the tables that exist at that moment. Every table added by the
  // set above lands on an already-provisioned database where 0021 has long since
  // run and will never revisit it — and under RLS_ENFORCE=on a table with no RLS
  // is fully readable across tenants. This sweep is 0021's loop made re-runnable
  // and deploy-safe: it only ADDS a policy where none exists (never clobbering a
  // subsystem's own, including C-30's parent-scoped ones), and it SKIPS a
  // non-integer tenant key with a NOTICE instead of aborting the deploy.
  'db/migrations/20260801_tenant_isolation_sweep.sql',
];

/** Files that open their own transaction must not be wrapped in a second one. */
const selfTransacting = (sql) => /^\s*BEGIN\s*;/im.test(sql);

/**
 * Apply `files` (repo-relative) against `pool`, one transaction per file.
 *
 * `stopOnFirstFailure` is the difference between the two callers. The manual
 * applier reports every problem in one run (false) so an operator sees the full
 * picture; the deploy applier stops at the first failure (true) so a faulted
 * migration never leaves a deploy applying further DDL on top of a schema it has
 * already failed to move — the half-applied state is the one nobody can reason
 * about.
 *
 * @returns {Promise<{ applied: string[], failures: Array<{ file: string, error: string }> }>}
 */
export async function applyMigrationFiles(
  pool,
  repoRoot,
  files,
  { log = () => {}, error = () => {}, stopOnFirstFailure = false } = {},
) {
  const applied = [];
  const failures = [];

  // Provision the ledger table once per run. Best-effort for the same reason the
  // per-file record is: a journal that cannot be created must not stop migrations
  // from applying. When this fails, each recordApplied below fails the same way and
  // is reported per file.
  try {
    await ensureJournal((text, params) => pool.query(text, params));
  } catch (journalErr) {
    if (process.env.C2C_MIGRATION_JOURNAL_STRICT === '1') throw journalErr;
    error(`  (migration journal unavailable: ${journalErr.message})`);
  }

  for (const file of files) {
    const full = path.join(repoRoot, file);
    if (!fs.existsSync(full)) {
      failures.push({ file, error: 'missing from repo' });
      error(`✗ missing: ${file}`);
      if (stopOnFirstFailure) return { applied, failures };
      continue;
    }
    const sql = fs.readFileSync(full, 'utf8');
    const wrap = !selfTransacting(sql);
    try {
      if (wrap) await pool.query('BEGIN');
      await pool.query(sql);
      if (wrap) await pool.query('COMMIT');
      applied.push(file);
      // Applied-file ledger + content-hash drift signal. The deploy mechanism
      // records THAT migrations ran; this records WHICH file ran and the sha256 of
      // the SQL that ran, so a file edited after it was applied is detectable
      // instead of silently diverging. Sited here rather than in either caller so
      // both the out-of-band applier and the deploy path are covered.
      //
      // `sql` is the already-read contents — deliberately not re-derived from a
      // path inside the journal module (that read tripped a path-traversal SAST
      // rule and there is no reason to touch the filesystem twice).
      //
      // Best-effort by default: a journal outage must not fail an otherwise good
      // migration run. Set C2C_MIGRATION_JOURNAL_STRICT=1 to make it fatal.
      try {
        await recordApplied((text, params) => pool.query(text, params), file, sql);
      } catch (journalErr) {
        if (process.env.C2C_MIGRATION_JOURNAL_STRICT === '1') throw journalErr;
        error(`  (journal skipped for ${file}: ${journalErr.message})`);
      }
      log(`✓ applied: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK').catch(() => {});
      const detail = `${err.message}${err.detail ? ` (${err.detail})` : ''}`;
      failures.push({ file, error: detail });
      error(`✗ failed:  ${file} — ${detail}`);
      if (stopOnFirstFailure) return { applied, failures };
    }
  }

  return { applied, failures };
}
