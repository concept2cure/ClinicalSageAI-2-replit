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
  // ── Risk-Based Monitoring lineage (added 2026-07-27) ──────────────────────
  // Same failure mode as the CRE spine above, and for the same reason: these
  // have been merged since 20260629 but were never listed here, so the durable
  // path never created them. Every rbm_* write — the whole RBQM module: risk
  // assessments, CtQ registers, KRIs, QTLs, signals, site risk, patient
  // profiles, monitoring plans, metric ingestion — has been addressing tables
  // that only ever existed on the ephemeral preview branch a PR created and
  // then deleted. The module could not have worked on a real database.
  //
  // ORDER MATTERS. rbm_surfaces creates the eight base tables; everything after
  // it either creates a table referencing them or ALTERs one of them:
  //   kri_values         -> FK rbm_kris
  //   patient_profiles   -> the cohort scorer's store
  //   metric_ingestion   -> rbm_data_runs + rbm_metric_observations, the load path
  //   not_evaluated      -> backfills status on rbm_kris / rbm_qtls
  //   qtl_direction      -> ALTERs rbm_qtls
  //   plan_versioning    -> ALTERs rbm_monitoring_plans
  //
  // All seven are idempotent (every CREATE TABLE / CREATE INDEX / ADD COLUMN is
  // IF NOT EXISTS; the three that touch existing rows are to_regclass-guarded
  // and re-runnable), none opens its own transaction, and none contains DROP or
  // TRUNCATE — so they are safe under this script's repeated-run contract.
  'migrations/20260629_rbm_surfaces.sql',
  'migrations/20260630_rbm_kri_values.sql',
  'migrations/20260701_rbm_patient_profiles.sql',
  'migrations/20260726_rbm_metric_ingestion.sql',
  'migrations/20260726_rbm_not_evaluated_backfill.sql',
  'migrations/20260727_rbm_qtl_direction.sql',
  'migrations/20260728_rbm_plan_versioning.sql',
  // ALTERs rbm_data_runs, so it must follow metric_ingestion above.
  'migrations/20260729_rbm_ingest_idempotency.sql',
  // Governed industry context. Creates its own tables and backfills the org
  // profile from organizations.industry_mode; references organizations, projects
  // and client_workspaces, all of which exist in the journaled baseline.
  'migrations/20260730_industry_context_profiles.sql',
  // ALTERs unified_tasks (additive) and creates task_regulatory_links.
  'migrations/20260731_mdx_task_regulatory_context.sql',
  // ALTERs project_industry_profiles, so it must follow the context profiles
  // above. Creates regulatory_work_packages and its decision records, both
  // to_regclass-guarded on regulatory_programs.
  'migrations/20260801_regulatory_work_packages.sql',
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
    } catch (err) {
      await pool.query('ROLLBACK').catch(() => {});
      console.error(`✗ failed:  ${file} — ${err.message}${err.detail ? ` (${err.detail})` : ''}`);
      failed++;
    }
  }

  await pool.end();
  console.info(failed === 0 ? '\nAll c2c migrations applied.' : `\n${failed} file(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
