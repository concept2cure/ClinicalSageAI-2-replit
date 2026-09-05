/**
 * End-to-end lifecycle wiring for the canonical spine (`packageSequenceFromCore`
 * via `assembleSequence`).
 *
 * Proves the write-half + read-half + compute-ops are connected: sequence 0000
 * persists a leaf manifest keyed on submission_id; sequence 0001 loads it
 * (loadLatestPriorManifestBySubmission), diffs, and ships REAL lifecycle
 * operators — a `delete` (with a cross-sequence modified-file pointer) for a leaf
 * dropped since 0000, and `new` for a leaf that did not exist in 0000. A `delete`
 * leaf can ONLY appear if the prior manifest was located and diffed, so it is the
 * decisive proof the submission-id-keyed lifecycle path works. Runs on PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
// The lifecycle read path uses the raw `pool` (loadLatestPriorManifestBySubmission);
// wire it to PGlite so the prior-manifest query runs against the test DB.
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { assembleSequence } from '../assemble-from-core';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;

async function indexXmlOf(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return (await zip.file('index.xml')?.async('string')) ?? '';
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;

  // Minimal ectd_compilations for the prior-manifest read (cols the loader uses).
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER,
      submission_id INTEGER,
      sequence_number TEXT,
      leaf_manifest JSONB,
      compiled_at TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'C2C Lifecycle', 'ind', 'biotech', 'fda', ${ORG}, ${USER});

    -- Sequence 0000 (the prior) and 0001 (the follow-up).
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER}),
           (2, 1, 'fda', '0001', ${ORG}, ${USER});

    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (100, ${ORG}, 'Drug Substance General', '<p>DS general v1</p>', '3.2'),
           (101, ${ORG}, 'Drug Product Description', '<p>DP description new</p>', '3.2');

    -- 0001 keeps the DS leaf (m3.2.s.1), ADDS a new DP leaf (m3.2.p.1), and
    -- DECLARES the withdrawal of the old manufacture leaf (m3.2.s.2). A delete
    -- row names no document: there is nothing to render, only something to
    -- point at. The prior stability leaf (m3.2.s.3) is simply not mentioned.
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, checksum)
    VALUES
      (2, 'm3.2.s.1', 'Drug Substance General',   'new',    'coauthor_documents', 100,  ${ORG}, ${USER}, NULL),
      (2, 'm3.2.p.1', 'Drug Product Description', 'new',    'coauthor_documents', 101,  ${ORG}, ${USER}, NULL),
      (2, 'm3.2.s.2', 'Old Manufacture',          'delete', NULL,                 NULL, ${ORG}, ${USER}, NULL);
  `);

  // Prior (0000) manifest: it contained the DS leaf AND a manufacture leaf that
  // 0001 DROPS. Persisted keyed on submission_id=1 (the stable key). The dropped
  // leaf's href is the pointer the delete op must reference.
  const priorManifest = [
    { ctdSection: 'm3.2.s.1', fileName: 'drug-substance-general.pdf', href: 'm3/32-s-1/drug-substance-general.pdf', md5: 'a'.repeat(32), operation: 'new' },
    { ctdSection: 'm3.2.s.2', fileName: 'old-manufacture.pdf', href: 'm3/32-s-2/old-manufacture.pdf', md5: 'b'.repeat(32), operation: 'new' },
    // Present in 0000, unmentioned by 0001: still on file, must NOT be deleted.
    { ctdSection: 'm3.2.s.3', fileName: 'stability.pdf', href: 'm3/32-s-3/stability.pdf', md5: 'c'.repeat(32), operation: 'new' },
  ];
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest)
     VALUES ($1, $2, '0000', $3)`,
    [ORG, 1, JSON.stringify(priorManifest)],
  );
});

afterAll(async () => {
  await harness.close();
});

describe('lifecycle from the canonical spine (submission-id keyed)', () => {
  it('sequence 0001 ships a delete (for the dropped 0000 leaf) + a new leaf', async () => {
    const result = await assembleSequence({
      sequenceId: 2, // the 0001 sequence
      organizationId: ORG,
      userId: USER,
      applicationId: 'IND-12345',
      sponsorId: 'SPON-1',
      sponsorName: 'Acme Bio',
    });
    const indexXml = await indexXmlOf(result.bundle.path);

    // The leaf 0001 DECLARES withdrawn (m3.2.s.2 / old-manufacture.pdf) becomes
    // a backbone-only delete whose modified-file points back into ../0000/.
    // This is only possible if the prior manifest was located by submission_id
    // and diffed.
    expect(indexXml).toMatch(/operation="delete"/);
    expect(indexXml).toContain('../0000/m3/32-s-2/old-manufacture.pdf');

    // The prior leaf 0001 does not mention (m3.2.s.3 / stability.pdf) is still
    // on file, unchanged. It used to be withdrawn too — every leaf a follow-up
    // sequence did not itself carry was emitted as a delete.
    expect(indexXml).not.toContain('stability.pdf');
    expect((indexXml.match(/operation="delete"/g) ?? []).length).toBe(1);

    // The genuinely new DP leaf (absent from 0000) stays operation="new".
    expect(indexXml).toMatch(/operation="new"/);
  });
});
