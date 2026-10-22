/**
 * A NAMED prior sequence loads the state on file at the agency through that
 * sequence, or the load fails. It never comes back empty.
 *
 * Until 2026-10-15 loadPriorSequenceManifest (the AnA compute_lifecycle_operations
 * auto-load) read the newest compile of that one sequence that carried a leaf
 * manifest:
 *   - a never-sent PREVIEW or REHEARSAL compile counted as on file (no join to
 *     ectd_sequences, no dispatch_status, no rehearsal exclusion);
 *   - it read one sequence, not the fold, so a leaf filed in 0000 and not
 *     re-filed in 0001 was missing from "the prior state";
 *   - when nothing matched, or an identifier was missing, it returned [] — and
 *     the tool reported ok:true with every leaf `new`, which tells the agency the
 *     document was never filed.
 * It now resolves the submission that FILED the named sequence and folds its
 * filed history (loadLatestPriorManifestBySubmission), and refuses with
 * PRIOR_SEQUENCE_NOT_FOUND when the named sequence is not on file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { loadPriorSequenceManifest, type PoolLike } from '../prior-sequence-loader';

const ORG = 7;
const OTHER_ORG = 8;
const APP = 'IND-123456';

let pg: PGlite;
const pool: PoolLike = {
  query: (sql: string, params?: unknown[]) =>
    pg.query(sql, params) as unknown as Promise<{ rows: Array<Record<string, unknown>> }>,
};

const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new') => ({
  ctdSection, fileName, md5, operation, href: `m3/${fileName}`, leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml',
});

beforeAll(async () => {
  pg = new PGlite();
  // The columns the loader reads, named as in shared/schema.ts (ectdCompilations)
  // and shared/schema/submissions.ts (ectdSequences).
  await pg.exec(`
    CREATE TABLE ectd_sequences (
      id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda',
      sequence_number TEXT NOT NULL, organization_id INTEGER NOT NULL, dispatch_status TEXT,
      deleted_at TIMESTAMPTZ
    );
    CREATE TABLE ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, submission_id INTEGER,
      compilation_type TEXT NOT NULL DEFAULT 'module', application_number TEXT,
      sequence_number TEXT, leaf_manifest JSON, compiled_at TIMESTAMP
    );
    INSERT INTO ectd_sequences (submission_id, sequence_number, organization_id, dispatch_status) VALUES
      (1, '0000', ${ORG}, 'acknowledged'),
      (1, '0001', ${ORG}, 'sent'),
      (1, '0002', ${ORG}, NULL),
      (1, '0003', ${ORG}, 'sent'),
      (2, '0000', ${OTHER_ORG}, 'sent');
  `);
  const insert = (org: number, submission: number, type: string, seq: string, manifest: unknown) =>
    pg.query(
      `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, application_number, sequence_number, leaf_manifest, compiled_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [org, submission, type, APP, seq, JSON.stringify(manifest)],
    );
  // 0000 filed two leaves; 0001 replaced one of them and left the CSR on file.
  await insert(ORG, 1, 'module', '0000', [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('5.3.5.1', 'csr.pdf', 'b'.repeat(32))]);
  await insert(ORG, 1, 'module', '0001', [leaf('3.2.S.1', 'general.pdf', 'c'.repeat(32), 'replace')]);
  // 0002 was compiled (a preview) and never sent.
  await insert(ORG, 1, 'module', '0002', [leaf('5.3.1', 'protocol.pdf', 'd'.repeat(32))]);
  // 0003 was sent, but the only compile on record for it is a rehearsal.
  await insert(ORG, 1, 'rehearsal', '0003', [leaf('5.3.1', 'rehearsed.pdf', 'e'.repeat(32))]);
  // Another organisation filed the same application number.
  await insert(OTHER_ORG, 2, 'module', '0000', [leaf('2.5', 'foreign.pdf', 'f'.repeat(32))]);
});

afterAll(async () => {
  await pg.close();
});

const load = (priorSequenceNumber: string, applicationNumber = APP, organizationId = ORG) =>
  loadPriorSequenceManifest(pool, { organizationId, applicationNumber, priorSequenceNumber });

describe('a named prior sequence is the filed state through it', () => {
  it('folds every filed sequence up to the named one, each leaf pointing at the sequence that holds it', async () => {
    const leaves = await load('0001');
    const byFile = Object.fromEntries(leaves.map((l) => [l.fileName, l]));
    expect(Object.keys(byFile).sort()).toEqual(['csr.pdf', 'general.pdf']);
    expect(byFile['general.pdf']).toMatchObject({ md5: 'c'.repeat(32), sequenceNumber: '0001' });
    expect(byFile['csr.pdf']).toMatchObject({ md5: 'b'.repeat(32), sequenceNumber: '0000' });
  });

  it('never reads another organisation’s filings of the same application number', async () => {
    const leaves = await load('0000');
    expect(leaves.map((l) => l.fileName).sort()).toEqual(['csr.pdf', 'general.pdf']);
  });
});

describe('a named prior sequence that is not on file is an error, never an empty prior', () => {
  it('refuses a sequence that was compiled but never sent', async () => {
    await expect(load('0002')).rejects.toThrow(/PRIOR_SEQUENCE_NOT_FOUND/);
  });

  it('refuses a sent sequence whose only compile on record is a rehearsal', async () => {
    await expect(load('0003')).rejects.toThrow(/PRIOR_SEQUENCE_NOT_FOUND/);
  });

  it('refuses a sequence with no compile at all', async () => {
    await expect(load('0005')).rejects.toThrow(/PRIOR_SEQUENCE_NOT_FOUND/);
  });

  it('refuses when the application number is missing, without reading', async () => {
    await expect(load('0001', '')).rejects.toThrow(/application number/i);
  });
});
