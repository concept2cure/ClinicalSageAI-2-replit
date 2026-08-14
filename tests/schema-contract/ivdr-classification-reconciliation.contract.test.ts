/**
 * Schema-contract tests for the D11d IVDR consolidation
 * (migrations/20260813c_ivdr_schema_reconciliation.sql).
 *
 * ivdr_classifications used to be CREATE TABLE IF NOT EXISTS'd by three files
 * with two incompatible column shapes, so the surviving shape was decided by
 * migration order per environment (ledger C-29). The consolidation deleted the
 * rival definitions (001's shape-1 CREATE, the whole of 20260524_ivdr_cdx.sql
 * and 20260524_ivd_performance.sql), made 20260508_ivd_diagnostic_surfaces.sql
 * the ONE creator, and added a reconciliation migration that guarantees the
 * union shape and backfills legacy data into the canonical columns.
 *
 * These tests apply the REAL migration files to an in-process Postgres in the
 * orders the two appliers actually use, and assert:
 *   • a legacy shape-1 database is reconciled: union columns present, legacy
 *     values copied into the canonical columns, deprecated values untouched;
 *   • BOTH live writers (mdx-ivdr.ts CRUD and ivdr-routes.ts POST /classify)
 *     can insert through the canonical vocabulary on every resulting schema;
 *   • the reconciliation is idempotent and no-ops cleanly where the tables do
 *     not exist (fail-closed readers keep their 503);
 *   • the durable deploy order (reconcile → canonical creator → module tables)
 *     yields the full schema, including the audit-hardening columns the
 *     routes write and the GSPR store that used to exist only as runtime DDL.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SchemaContractDb } from './harness';

const DB_TIMEOUT_MS = 120_000;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const RECON = 'migrations/20260813c_ivdr_schema_reconciliation.sql';
const CANONICAL_CREATOR = 'migrations/20260508_ivd_diagnostic_surfaces.sql';
const MODULE_TABLES = 'migrations/001_create_ivdr_tables.sql';

/** FK target 20260508 references beyond the harness defaults. */
const EXTRA_PREREQUISITES = `
CREATE TABLE IF NOT EXISTS regulatory_programs (
  id UUID PRIMARY KEY,
  organization_id INTEGER,
  deleted_at TIMESTAMPTZ
);
INSERT INTO organizations (id, name) VALUES (1, 'Contract-test org')
ON CONFLICT (id) DO NOTHING;
`;

/**
 * The HISTORICAL shape-1 DDL exactly as 001_create_ivdr_tables.sql shipped it
 * before the consolidation deleted it. It exists on real legacy databases, so
 * the backfill is tested against it; it is reproduced here as a fixture
 * precisely BECAUSE no migration file may define this shape anymore.
 */
const LEGACY_SHAPE_1 = `
CREATE TABLE IF NOT EXISTS ivdr_classifications (
  id              SERIAL PRIMARY KEY,
  device_name     TEXT NOT NULL,
  intended_purpose TEXT NOT NULL,
  classification  VARCHAR(1) NOT NULL CHECK (classification IN ('A', 'B', 'C', 'D')),
  is_cdx          BOOLEAN DEFAULT FALSE,
  is_self_test    BOOLEAN DEFAULT FALSE,
  is_near_patient BOOLEAN DEFAULT FALSE,
  rule_trace      JSONB NOT NULL DEFAULT '[]',
  analytes        JSONB NOT NULL DEFAULT '[]',
  organization_id INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ivdr_class_org ON ivdr_classifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_ivdr_class_class ON ivdr_classifications(classification);
`;

let db: SchemaContractDb | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function freshDb(): Promise<SchemaContractDb> {
  const d = await SchemaContractDb.create([]);
  await d.pg.exec(EXTRA_PREREQUISITES);
  return d;
}

async function applyFile(d: SchemaContractDb, file: string): Promise<void> {
  await d.pg.exec(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
}

/** The canonical CRUD insert mdx-ivdr.ts issues (no legacy columns supplied). */
const MDX_STYLE_INSERT = `
  INSERT INTO ivdr_classifications (
    organization_id, program_id, device_name, ivdr_class, classification_rule,
    rationale, companion_diagnostic, self_test, near_patient_test,
    notified_body_required
  ) VALUES (1, NULL, 'CRUD assay', 'B', '6', 'Rule 6', false, false, false, true)`;

/** The canonical rule-engine insert ivdr-routes.ts POST /classify issues. */
const CLASSIFY_STYLE_INSERT = `
  INSERT INTO ivdr_classifications
    (device_name, intended_purpose, ivdr_class, companion_diagnostic,
     self_test, near_patient_test, notified_body_required, rule_trace,
     analytes, organization_id, created_at)
  VALUES ('Engine assay', 'Detection of a biomarker', 'C', true, false, false,
          true, '[{"rule":"3","matched":true}]', '["Biomarker"]', 1, NOW())`;

describe('legacy shape-1 database → reconciliation', () => {
  it('reconciles to the union shape, backfills canonical from legacy, and leaves audit history untouched', async () => {
    db = await freshDb();
    await db.pg.exec(LEGACY_SHAPE_1);
    await db.pg.exec(`
      INSERT INTO ivdr_classifications
        (device_name, intended_purpose, classification, is_cdx, is_self_test, is_near_patient, organization_id)
      VALUES ('Legacy assay', 'Legacy purpose', 'C', true, false, true, 1)`);

    await applyFile(db, RECON);

    const cols = await db.columns('ivdr_classifications');
    // Canonical shape-2 columns are all present…
    for (const c of [
      'program_id', 'ivdr_class', 'classification_rule', 'rationale',
      'companion_diagnostic', 'self_test', 'near_patient_test',
      'notified_body_required', 'notified_body_name', 'notified_body_id',
      'certificate_no', 'certificate_expiry', 'metadata', 'deleted_at',
    ]) expect(cols, `union shape must include ${c}`).toContain(c);
    // …alongside the canonical module columns.
    for (const c of ['intended_purpose', 'rule_trace', 'analytes']) expect(cols).toContain(c);

    const row = (await db.pg.query<Record<string, unknown>>(
      `SELECT * FROM ivdr_classifications WHERE device_name = 'Legacy assay'`,
    )).rows[0];
    // Backfilled canonical values…
    expect(row.ivdr_class).toBe('C');
    expect(row.companion_diagnostic).toBe(true);
    expect(row.self_test).toBe(false);
    expect(row.near_patient_test).toBe(true);
    expect(row.notified_body_required).toBe(true); // C ≠ A
    // …with the deprecated originals preserved as audit history.
    expect(row.classification).toBe('C');
    expect(row.is_cdx).toBe(true);
  }, DB_TIMEOUT_MS);

  it('lets BOTH canonical writers insert on a reconciled legacy schema', async () => {
    db = await freshDb();
    await db.pg.exec(LEGACY_SHAPE_1);
    await applyFile(db, RECON);

    // The legacy NOT NULLs (classification, intended_purpose) must not block
    // canonical-only writes — this is exactly what broke mdx-ivdr creates on
    // shape-1 databases.
    const crud = await db.tryWrite(MDX_STYLE_INSERT);
    expect(crud.ok, `mdx-style canonical insert must succeed: ${crud.error ?? ''}`).toBe(true);

    const engine = await db.tryWrite(CLASSIFY_STYLE_INSERT);
    expect(engine.ok, `classify-style canonical insert must succeed: ${engine.error ?? ''}`).toBe(true);

    // updated_at now defaults, so the canonical ORDER BY updated_at is sound.
    const nulls = await db.pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ivdr_classifications WHERE updated_at IS NULL`,
    );
    expect(nulls.rows[0].n).toBe(0);
  }, DB_TIMEOUT_MS);

  it('is idempotent — applying the reconciliation twice changes nothing and fails nothing', async () => {
    db = await freshDb();
    await db.pg.exec(LEGACY_SHAPE_1);
    await applyFile(db, RECON);
    const before = await db.columns('ivdr_classifications');
    await applyFile(db, RECON); // second application must not throw
    expect(await db.columns('ivdr_classifications')).toEqual(before);
  }, DB_TIMEOUT_MS);
});

describe('fresh canonical database', () => {
  it('creator + reconciliation yield the module columns and accept both writers', async () => {
    db = await freshDb();
    await applyFile(db, CANONICAL_CREATOR);
    await applyFile(db, RECON);

    const cols = await db.columns('ivdr_classifications');
    for (const c of ['ivdr_class', 'program_id', 'intended_purpose', 'rule_trace', 'analytes']) {
      expect(cols).toContain(c);
    }
    // The deprecated shape-1 names must NOT be added to databases that never
    // had them — deprecation is not propagation.
    for (const c of ['classification', 'is_cdx', 'is_self_test', 'is_near_patient']) {
      expect(cols).not.toContain(c);
    }

    const crud = await db.tryWrite(MDX_STYLE_INSERT);
    expect(crud.ok, crud.error ?? '').toBe(true);
    const engine = await db.tryWrite(CLASSIFY_STYLE_INSERT);
    expect(engine.ok, engine.error ?? '').toBe(true);
  }, DB_TIMEOUT_MS);

  it('reconciliation alone no-ops on a database with no IVDR tables (fail-closed readers keep their 503)', async () => {
    db = await freshDb();
    await applyFile(db, RECON); // must not throw
    expect(await db.tableExists('ivdr_classifications')).toBe(false);
    // The one table the reconciliation DOES own (previously runtime DDL).
    expect(await db.tableExists('ivdr_gspr_assessments')).toBe(true);
  }, DB_TIMEOUT_MS);
});

describe('the durable deploy order (migration-set.mjs): reconcile → creator → module tables', () => {
  it('produces the full IVDR schema including audit-hardening columns and the GSPR store', async () => {
    db = await freshDb();
    for (const f of [RECON, CANONICAL_CREATOR, MODULE_TABLES]) await applyFile(db, f);

    // Module detail tables exist WITH the columns their routes write — before
    // this consolidation the hardening ALTERs lived only in an unwired file.
    const val = await db.columns('ivdr_analytical_validations');
    for (const c of ['evidence_documents', 'acceptance_criteria', 'pass_fail_status']) {
      expect(val, `ivdr_analytical_validations must carry ${c}`).toContain(c);
    }
    const ev = await db.columns('ivdr_clinical_evidence');
    for (const c of ['population_definition', 'inclusion_criteria', 'exclusion_criteria', 'source_documents']) {
      expect(ev, `ivdr_clinical_evidence must carry ${c}`).toContain(c);
    }
    expect(await db.columns('ivdr_validation_parameter_history')).toContain('reason');
    expect(await db.columns('ivdr_evidence_result_history')).toContain('reason');
    const cdx = await db.columns('ivdr_cdx_workflows');
    for (const c of ['intended_use_statement', 'biomarker_type', 'clinical_evidence_ids']) {
      expect(cdx).toContain(c);
    }
    expect(await db.tableExists('ivdr_gspr_assessments')).toBe(true);

    // The per-study performance pair remains its own resource, single-shaped.
    expect(await db.columns('ivd_analytical_performance')).toContain('program_id');
    expect(await db.columns('ivd_clinical_performance')).toContain('program_id');
  }, DB_TIMEOUT_MS);

  it('module tables also apply cleanly in the fresh-overlay order (creator before 001)', async () => {
    db = await freshDb();
    for (const f of [CANONICAL_CREATOR, MODULE_TABLES, RECON]) await applyFile(db, f);
    expect(await db.tableExists('ivdr_analytical_validations')).toBe(true);
    expect(await db.tableExists('ivdr_clinical_evidence')).toBe(true);
    expect(await db.tableExists('ivdr_cdx_workflows')).toBe(true);
  }, DB_TIMEOUT_MS);
});
