/**
 * Audit immutability trigger check — against the REAL catalog, in-process.
 *
 * Boots PGlite, creates the four audit stores with minimal DDL, applies the
 * four real trigger migrations from db/migrations (the same files
 * deploy-migrate replays on every deploy), and drives the catalog probe
 * through the states the startup gate exists to catch: all present, a trigger
 * dropped, a trigger disabled, a table absent. The fake-client cases live in
 * audit-immutability-triggers.test.ts; this file proves the SQL against
 * pg_trigger / pg_class / pg_namespace as PostgreSQL actually populates them.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import {
  assertAuditImmutabilityTriggers,
  EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS,
  type TriggerCatalogClient,
} from '../audit-immutability-triggers';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** The stores the triggers attach to — only what CREATE TRIGGER needs. */
const STORES_DDL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  sequence_number BIGINT,
  record_hash     TEXT,
  previous_hash   TEXT
);
CREATE TABLE IF NOT EXISTS electronic_signatures (
  id            SERIAL PRIMARY KEY,
  superseded_by INTEGER,
  updated_at    TIMESTAMPTZ
);
`;

const TRIGGER_MIGRATIONS = Array.from(new Set(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.map((t) => t.source)));

let pglite: PGlite;
/** PGlite's query(sql, params) is the whole contract the probe needs. */
const catalog = () => pglite as unknown as TriggerCatalogClient;

async function provision(): Promise<void> {
  await pglite.exec('DROP SCHEMA IF EXISTS audit CASCADE;');
  await pglite.exec('DROP TABLE IF EXISTS audit_logs, audit_events, electronic_signatures CASCADE;');
  await pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await pglite.exec(STORES_DDL);
  for (const file of TRIGGER_MIGRATIONS) await pglite.exec(migration(file));
}

beforeAll(async () => {
  pglite = new PGlite();
}, 60_000);
afterAll(async () => {
  await pglite.close();
});
beforeEach(async () => {
  await provision();
}, 60_000);

describe('assertAuditImmutabilityTriggers against PGlite', () => {
  it('reports ok after the real trigger migrations have been applied', async () => {
    const report = await assertAuditImmutabilityTriggers(catalog());
    expect(report.missing).toEqual([]);
    expect(report.disabled).toEqual([]);
    expect(report.tablesAbsent).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.present).toBe(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.length);
  }, 60_000);

  it('stays ok when the migrations replay (they re-run on every deploy, CLAUDE.md Rule 1)', async () => {
    for (const file of TRIGGER_MIGRATIONS) await pglite.exec(migration(file));
    const report = await assertAuditImmutabilityTriggers(catalog());
    expect(report.ok).toBe(true);
  }, 60_000);

  it('names a dropped trigger', async () => {
    await pglite.exec('DROP TRIGGER trg_audit_logs_no_delete ON public.audit_logs;');
    const report = await assertAuditImmutabilityTriggers(catalog());
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['public.audit_logs.trg_audit_logs_no_delete']);
    expect(report.disabled).toEqual([]);
  }, 60_000);

  it('names a disabled trigger — the catalog row exists, the protection does not', async () => {
    await pglite.exec('ALTER TABLE audit.tamper_proof_log DISABLE TRIGGER trg_prevent_audit_mutation;');
    const report = await assertAuditImmutabilityTriggers(catalog());
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([]);
    expect(report.disabled).toEqual(['audit.tamper_proof_log.trg_prevent_audit_mutation']);
    // And the reverse: the check is about the current state, not a memory.
    await pglite.exec('ALTER TABLE audit.tamper_proof_log ENABLE TRIGGER trg_prevent_audit_mutation;');
    expect((await assertAuditImmutabilityTriggers(catalog())).ok).toBe(true);
  }, 60_000);

  it('reports an absent store (fresh install before deploy-migrate) as missing its triggers', async () => {
    await pglite.exec('DROP SCHEMA audit CASCADE;');
    const report = await assertAuditImmutabilityTriggers(catalog());
    expect(report.ok).toBe(false);
    expect(report.tablesAbsent).toEqual(['audit.tamper_proof_log']);
    expect(report.missing).toEqual(['audit.tamper_proof_log.trg_prevent_audit_mutation']);
  }, 60_000);

  it('does not count a same-named trigger on another table', async () => {
    await pglite.exec(`
      DROP TRIGGER trg_audit_events_no_delete ON public.audit_events;
      CREATE TABLE decoy (id INT);
      CREATE TRIGGER trg_audit_events_no_delete BEFORE DELETE ON decoy
        FOR EACH ROW EXECUTE FUNCTION enforce_audit_events_no_delete();
    `);
    const report = await assertAuditImmutabilityTriggers(catalog());
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['public.audit_events.trg_audit_events_no_delete']);
  }, 60_000);
});
