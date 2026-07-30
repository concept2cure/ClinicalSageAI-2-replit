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
