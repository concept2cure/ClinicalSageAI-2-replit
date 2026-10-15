import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prerequisite = 'migrations/20261013_electronic_signature_created_at_prerequisite.sql';
const qms = 'migrations/20260511_qms_and_labeling.sql';
const inspection = 'migrations/20260610_inspection_readiness.sql';
const guard = 'migrations/20261001_qms_document_signature_required.sql';
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const journalSignature = read('migrations/0000_sweet_joseph.sql').match(/CREATE TABLE "electronic_signatures" \([\s\S]*?\n\);/)?.[0];
if (!journalSignature) throw new Error('The raw migration journal no longer defines electronic_signatures');

async function baseline(signatureDdl = journalSignature): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE submission_orchestrator_runs (id serial PRIMARY KEY, status text);
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (1);
    ${signatureDdl}
  `);
  // These are real pre-batch migrations. They supply six required columns;
  // no synthetic created_at is hidden in this baseline fixture.
  await db.exec(read('db/migrations/20260725_esig_gate_columns_port.sql'));
  await db.exec(read('migrations/20260813d_esignature_governed_unification.sql'));
  return db;
}

async function signature(db: PGlite, documentId: number, orgId = 1, type = 'qms-document-approval', createdAt?: string): Promise<void> {
  await db.query(`INSERT INTO electronic_signatures
    (organization_id, signed_target, signature_type, signature_purpose, signer_id,
     signer_name, signer_email, authentication_method, authentication_timestamp, signature_hash
     ${createdAt == null ? '' : ', created_at'})
    VALUES ($1, $2, $3, 'Deployment regression', 1, 'Schema probe', 'probe@example.invalid',
      'password', now(), $4 ${createdAt == null ? '' : ', $5::timestamp'})`,
  [orgId, `qms-document:${documentId}`, type, `probe-${Math.random()}`, ...(createdAt == null ? [] : [createdAt])]);
}

async function transaction(db: PGlite, effect: () => Promise<void>): Promise<void> {
  await db.exec('BEGIN');
  try { await effect(); await db.exec('COMMIT'); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}

let db: PGlite;
beforeAll(async () => { db = await baseline(); }, 60_000);
afterAll(async () => { await db?.close(); });

describe('QMS deployment prerequisite from the actual raw journal', () => {
  it('reproduces the original deploy refusal instead of assuming the push schema', async () => {
    expect(journalSignature).not.toMatch(/"created_at"/);
    await db.exec(read(qms));
    await db.exec(read(inspection));
    const originalFailure = await db.exec(read(guard)).then(() => null, error => error as Error);
    expect(originalFailure?.message).toMatch(/lacks created_at/);
    console.info('[negative control]', originalFailure?.message);
    await db.exec('ROLLBACK');
  }, 60_000);

  it('orders the prerequisite and both creators before the deferred guard and tenant sweep', () => {
    const position = (file: string) => C2C_MIGRATION_FILES.indexOf(file);
    for (const file of [prerequisite, qms, inspection, guard]) expect(position(file), file).toBeGreaterThan(-1);
    expect(position(prerequisite)).toBeLessThan(position(qms));
    expect(position(prerequisite)).toBeLessThan(position(inspection));
    expect(position(qms)).toBeLessThan(position(guard));
    expect(position(inspection)).toBeLessThan(position(guard));
    expect(position(guard)).toBeLessThan(position('db/migrations/20260801_tenant_isolation_sweep.sql'));
  });

  it('replays the deployment sequence twice without inventing historical signature creation times', async () => {
    await signature(db, 1);
    for (let pass = 0; pass < 2; pass++) {
      for (const file of [prerequisite, qms, inspection, guard]) await db.exec(read(file));
    }
    const historical = await db.query<{ created_at: Date | null }>('SELECT created_at FROM electronic_signatures');
    expect(historical.rows).toEqual([{ created_at: null }]);
    const columns = await db.query<{ column_name: string; is_nullable: string; column_default: string }>(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'electronic_signatures' AND column_name = 'created_at'`,
    );
    expect(columns.rows[0]).toMatchObject({ is_nullable: 'YES', column_default: 'LOCALTIMESTAMP' });
    const tables = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('qms_documents','qms_training_records','qms_suppliers',
       'qms_internal_audits','qms_management_reviews','qms_nonconforming_products','labeling_documents',
       'labeling_translations','labeling_symbols','inspections','inspection_findings','finding_responses','readiness_assessments')`);
    expect(tables.rows).toHaveLength(13);
  }, 60_000);

  it('refuses unsigned effective and retired acts, including an older signature with unknown creation time', async () => {
    await db.exec(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type)
      VALUES (1, 'LEGACY-1', 'Legacy controlled document', 'sop')`);
    for (const status of ['effective', 'retired']) {
      await expect(transaction(db, () => db.exec(`UPDATE qms_documents SET status = '${status}' WHERE id = 1`).then(() => undefined))).rejects.toThrow(/QMS_SIGNATURE_REQUIRED/);
    }
    expect((await db.query<{ status: string }>('SELECT status FROM qms_documents WHERE id = 1')).rows[0].status).toBe('draft');
  }, 60_000);

  it('commits a new approval and retirement only when their signature is written on the same transaction', async () => {
    await transaction(db, async () => {
      await db.exec(`UPDATE qms_documents SET status = 'effective' WHERE id = 1`);
      await signature(db, 1);
      const clock = await db.query<{ same_clock: boolean }>('SELECT created_at = LOCALTIMESTAMP AS same_clock FROM electronic_signatures WHERE created_at IS NOT NULL');
      expect(clock.rows[0].same_clock).toBe(true);
    });
    await transaction(db, async () => {
      await db.exec(`UPDATE qms_documents SET status = 'retired' WHERE id = 1`);
      await signature(db, 1, 1, 'qms-document-retirement');
    });
    expect((await db.query<{ status: string }>('SELECT status FROM qms_documents WHERE id = 1')).rows[0].status).toBe('retired');
  }, 60_000);

  it('a signature from another organization cannot authorize the document transition', async () => {
    await db.exec(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type)
      VALUES (1, 'FOREIGN-1', 'Tenant-bound controlled document', 'sop')`);
    await expect(transaction(db, async () => {
      await db.exec(`UPDATE qms_documents SET status = 'effective' WHERE id = 2`);
      await signature(db, 2, 2);
    })).rejects.toThrow(/QMS_SIGNATURE_REQUIRED/);
    expect((await db.query<{ status: string }>('SELECT status FROM qms_documents WHERE id = 2')).rows[0].status).toBe('draft');
  }, 60_000);

  it('keeps a previously recorded creation timestamp and a compatible default on replay', async () => {
    const prior = await baseline();
    try {
      await prior.exec('ALTER TABLE electronic_signatures ADD COLUMN created_at timestamp DEFAULT now()');
      await signature(prior, 100, 1, 'qms-document-approval', '2001-02-03 04:05:06');
      await prior.exec(read(prerequisite));
      await prior.exec(read(prerequisite));
      const recorded = await prior.query<{ created_at: Date }>('SELECT created_at FROM electronic_signatures');
      expect(recorded.rows[0].created_at.toISOString()).toBe('2001-02-03T04:05:06.000Z');
    } finally { await prior.close(); }
  }, 60_000);

  it('refuses missing required signature columns before any QMS creator is enabled', async () => {
    const broken = await baseline(journalSignature.replace(/\s*"verification_status" varchar\(50\),/, ''));
    try {
      await expect(broken.exec(read(prerequisite))).rejects.toThrow(/verification_status/);
      await broken.exec('ROLLBACK');
      const stores = await broken.query<{ present: string | null }>("SELECT to_regclass('public.qms_documents')::text AS present");
      expect(stores.rows[0].present).toBeNull();
    } finally { await broken.close(); }
  }, 60_000);
});
