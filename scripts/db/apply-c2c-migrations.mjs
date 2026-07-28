#!/usr/bin/env node
/**
 * Apply the c2c session migrations (AI governance, PV operational tables,
 * commitments, drafting-council provisioning) to the configured database,
 * idempotently.
 *
 * These live in the root `migrations/` folder as raw .sql (the established
 * convention for phase migrations here), which drizzle's runtime migrate() does
 * NOT apply (only the journaled baseline is). This script gives a single,
 * standard, idempotent command to apply them on the out-of-band path — for the
 * preview DB and deploys. Each file is CREATE/ALTER ... IF NOT EXISTS, so it is
 * safe to run repeatedly.
 *
 * Usage: APPLY_C2C_MIGRATIONS=true npm run db:apply-c2c
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { applyAuthoringSubsystem } from './authoring-subsystem.mjs';
import { ensureJournal, recordApplied } from './migration-journal.mjs';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const FILES = [
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
  // main() provisions the authoring subsystem (below) BEFORE this loop runs, so
  // on a fresh DB the table is now present and this ALTER applies for real
  // rather than no-opping.
  'migrations/20260727_authoring_document_program_scope.sql',
  // Source-usage index + column semantics on authoring_citations. Also guarded
  // on to_regclass; likewise lands for real now that the subsystem is
  // provisioned ahead of this loop.
  'migrations/20260726_authoring_citation_source_usage.sql',
  // Object-level authoring permission store (G-01). Creates doc_permissions with
  // the same composite tenant-parent FK the other authoring children carry. Its
  // FK is pg_constraint-guarded on authoring_documents_id_tenant_key, which the
  // authoring subsystem (provisioned above, before this loop) creates — so on a
  // fresh DB the constraint lands for real. Without this table the section-edit
  // permission control cannot be enabled (42P01) and the grant endpoints 500.
  'db/migrations/20260728_doc_permissions.sql',
  // Authoring-router supplementary stores (G-02): eleven independent tables the
  // router / command-executor read/write (AI suggestions, reviews, checklists,
  // change-requests, compliance scores, comment activity, audit-events,
  // template/doc sections) that no migration created. Self-contained CREATE TABLE
  // IF NOT EXISTS + intra-cluster FKs only — no dependency on the authoring
  // subsystem, so it is order-independent here. NOT the Part 11 subsystem.
  'db/migrations/20260728_authoring_supplementary_tables.sql',
  // MAUD validation persistence (G-02): canonical, durable definition of
  // maud_algorithms / maud_validations / maud_validation_requests. The only prior
  // CREATE TABLE lived in the ARCHIVED db/migrations/_consolidated/ (excluded from
  // the schema scanners and off every apply path). Self-contained + idempotent.
  'db/migrations/20260728_maud_validation_tables.sql',
  // CER literature corpus (G-02): literature_entries, read by
  // regulatory-programs.service.ts and written by seed-mdx-content.mjs, whose only
  // CREATE TABLE lived in the ARCHIVED _consolidated/ dir (off every apply path).
  // Canonical org-scoped shape derived from the live code; the pgvector embedding
  // column is intentionally omitted (no live writer; legacy setupLiterature concern).
  'db/migrations/20260728_literature_entries.sql',
  // Stability module tenant isolation (High-severity security fix; finding in
  // docs/security/). Brings every EXISTING stab_* base table under the app's uniform
  // tenant_isolation_policy (0021 shape) keyed on app.current_tenant_id + FORCE RLS,
  // and defaults tenant_id from the request so the router's INSERTs auto-tag. Pure
  // catalog-driven ALTER/policy DO-block: a no-op on a DB where the stab_* tables do
  // not yet exist (idempotent, re-run safe), so order-independent here.
  'db/migrations/20260728_stability_tenant_isolation.sql',
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
  // this script's repeated-run contract.
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
];

// The four db/migrations/20260725_authoring_* files that back the IND authoring
// loop. They are provisioned as ONE atomic unit by applyAuthoringSubsystem()
// BEFORE the FILES loop above, so the two guarded authoring ALTERs in that list
// find their tables present.
//
// This supersedes an earlier cession that removed the loop-tables file from
// FILES. That cession was right to refuse adding the loop tables ALONE (loop
// tables without the audit/signature companions = a working freeze with no
// audit row and a failing e-sign, worse on a Part 11 surface than plain
// absence). The correct resolution is not to omit the subsystem but to
// provision all four files TOGETHER, atomically — which is what the helper does.
// See scripts/db/authoring-subsystem.mjs.

/** Files that open their own transaction must not be wrapped in a second one. */
const selfTransacting = (sql) => /^\s*BEGIN\s*;/im.test(sql);

function getDatabaseUrl() {
  for (const name of ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL']) {
    const v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  throw new Error('No DATABASE_URL found in environment');
}

async function main() {
  if (process.env.APPLY_C2C_MIGRATIONS !== 'true') {
    console.error('APPLY_C2C_MIGRATIONS is not "true". Aborting (safe guard).');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: getDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  const repoRoot = path.resolve(__dirname, '..', '..');

  let failed = 0;
  const drift = []; // files whose bytes changed since a prior apply (G-03)

  // Executable migration journal (G-03): record the sha256 of the exact bytes
  // applied for every file, and surface DRIFT — an already-applied file whose
  // content changed, which the idempotent apply path will not re-run. Journal
  // writes are BEST-EFFORT: a ledger failure must never abort a real migration.
  const query = (sql, params) => pool.query(sql, params);
  let journalReady = false;
  try {
    await ensureJournal(query);
    journalReady = true;
  } catch (err) {
    console.warn(`⚠ migration journal unavailable (continuing without it): ${err.message}`);
  }
  // Record an applied file's exact bytes in the ledger. `sqlText` is the content
  // the applier already read for the apply — nothing is re-read here (so no
  // second path.join over the file list). Best-effort: a ledger failure must
  // never abort a real migration.
  const journal = async (file, sqlText) => {
    if (!journalReady) return;
    try {
      const res = await recordApplied(query, file, sqlText);
      if (res.status === 'drift') {
        drift.push(file);
        console.warn(
          `⚠ DRIFT: ${file} was applied before with different bytes ` +
            `(was ${res.priorSha.slice(0, 12)}…, now ${res.sha.slice(0, 12)}…). ` +
            'The idempotent apply path will not have re-applied the change.',
        );
      }
    } catch (err) {
      console.warn(`⚠ journal record skipped for ${file}: ${err.message}`);
    }
  };

  // Authoring subsystem FIRST — as an atomic unit, so the two guarded authoring
  // ALTERs in FILES below find their tables present. A failure here is counted
  // like any other and does not abort the rest of the run (the guarded ALTERs
  // simply no-op if the subsystem did not come up).
  try {
    await applyAuthoringSubsystem(pool, repoRoot, { log: (m) => console.info(m) });
  } catch (err) {
    console.error(`✗ failed:  authoring subsystem — ${err.message}`);
    failed++;
  }

  for (const file of FILES) {
    const full = path.join(repoRoot, file);
    if (!fs.existsSync(full)) {
      console.error(`✗ missing: ${file}`);
      failed++;
      continue;
    }
    const sql = fs.readFileSync(full, 'utf8');
    const wrap = !selfTransacting(sql);
    try {
      if (wrap) await pool.query('BEGIN');
      await pool.query(sql);
      if (wrap) await pool.query('COMMIT');
      console.info(`✓ applied: ${file}`);
      await journal(file, sql);
    } catch (err) {
      await pool.query('ROLLBACK').catch(() => {});
      console.error(`✗ failed:  ${file} — ${err.message}${err.detail ? ` (${err.detail})` : ''}`);
      failed++;
    }
  }

  await pool.end();

  // Drift is a schema-truth problem, not an apply failure: the files all applied,
  // but at least one had been applied before with different bytes. In strict mode
  // (a release gate) this fails the run; otherwise it is reported and the run
  // still succeeds so an operator is not blocked mid-incident.
  const strict = process.env.C2C_MIGRATION_JOURNAL_STRICT === 'true';
  if (drift.length > 0) {
    console.warn(
      `\n⚠ ${drift.length} migration(s) drifted (edited after apply): ${drift.join(', ')}.` +
        (strict ? ' Failing (C2C_MIGRATION_JOURNAL_STRICT).' : ' Set C2C_MIGRATION_JOURNAL_STRICT=true to fail on this.'),
    );
  }
  const driftFail = strict && drift.length > 0;
  console.info(
    failed === 0 && !driftFail ? '\nAll c2c migrations applied.' : `\n${failed} file(s) failed.`,
  );
  process.exit(failed === 0 && !driftFail ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
