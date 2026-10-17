/**
 * F02 / W3-W4 / D2-D5: current-version read-and-understood compliance.
 * Executes the production query against real in-process PostgreSQL and canonical
 * table DDL. A revision must require new training while retaining old records.
 * This tests the read contract; it does not exercise signing, HTTP auth or RLS.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertNoSchemaGaps,
  createJourneyDb,
  extractTableDdl,
  type JourneyDb,
} from '../../../../tests/golden-journeys/harness';
import { readQmsTrainingCompliance } from '../training-compliance';
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from '../document-approval-signature';
import { QMS_APPROVAL_FIXTURE_DDL, seedQmsApprovalFixture } from './_release-approval-fixture';
import { QMS_TRAINING_DECLARATION } from '../../../../shared/qms/training';
const NOW = new Date('2026-10-14T12:00:00Z');

let jdb: JourneyDb;
beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql:
      extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users']) +
      extractTableDdl('migrations/20260524_program_workbench_schema.sql', ['regulatory_programs']),
    migrations: ['migrations/20260511_qms_and_labeling.sql'],
  });
  await jdb.pglite.exec(`
    ${QMS_APPROVAL_FIXTURE_DDL}
    INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor'), (2, 'Other', 'other');
  `);
}, 60_000);
beforeEach(async () => {
  await jdb.pglite.exec(`
    TRUNCATE electronic_signatures, qms_training_records, qms_documents, organization_users, users RESTART IDENTITY CASCADE;
    INSERT INTO users (id, email, name, password_hash, status) VALUES
      (10, 'member1@example.test', 'Member 1', 'fixture', 'active'),
      (11, 'member2@example.test', 'Member 2', 'fixture', 'active'),
      (12, 'untrained@example.test', 'Untrained', 'fixture', 'active'),
      (13, 'suspended@example.test', 'Suspended', 'fixture', 'suspended'),
      (14, 'inactive@example.test', 'Inactive', 'fixture', 'inactive'),
      (15, 'departed@example.test', 'Departed', 'fixture', 'active'),
      (16, 'foreign@example.test', 'Foreign', 'fixture', 'active'),
      (17, 'pending@example.test', 'Pending', 'fixture', 'pending_verification');
    INSERT INTO organization_users (organization_id, user_id) VALUES
      (1, 10), (1, 11), (1, 12), (1, 13), (1, 14), (1, 17), (2, 10), (2, 16);
  `);
});
afterAll(async () => {
  try { assertNoSchemaGaps(jdb); } finally { await jdb?.close(); }
});

async function document(options: {
  version?: string; org?: number; number?: string; type?: string; status?: string; deleted?: boolean;
} = {}): Promise<number> {
  const result = await jdb.pglite.query<{ id: number }>(`
    INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, deleted_at)
    VALUES ($1, $2, 'Controlled procedure', $3, $4, $5, $6) RETURNING id`,
  [options.org ?? 1, options.number ?? 'SOP-001', options.type ?? 'sop', options.version ?? '1.0',
    options.status ?? 'effective', options.deleted ? new Date() : null]);
  await release(result.rows[0].id);
  return result.rows[0].id;
}
async function release(id: number): Promise<void> {
  const row = (await jdb.pglite.query<QmsDocumentRow>('SELECT * FROM qms_documents WHERE id=$1', [id])).rows[0];
  const metadata = { sections: [{ key: 'procedure', label: 'Procedure', body: 'Read and follow the recorded procedure.' }],
    approval: { meaning: 'APPROVED', bindingBasis: 'qms-document-version-content-sha256', by: 10, at: '2026-10-01T00:00:00.000Z', contentDigest: '' } };
  const signed = { ...row, approver_id: 10, approved_at: '2026-10-01T00:00:00.000Z', metadata };
  metadata.approval.contentDigest = computeQmsDocumentContentDigest(signed);
  await jdb.pglite.query('UPDATE qms_documents SET approver_id=$2,approved_at=$3,metadata=$4 WHERE id=$1', [id,10,signed.approved_at,JSON.stringify(metadata)]);
  await jdb.pglite.query('DELETE FROM electronic_signatures WHERE signed_target=$1',[`qms-document:${id}`]);
  await seedQmsApprovalFixture(jdb.pglite, signed);
}
async function acknowledge(doc: number, user: number, version: string, options: {
  org?: number; expires?: 'future' | 'past' | 'never'; acknowledgedAt?: string;
} = {}): Promise<void> {
  const row = (await jdb.pglite.query<QmsDocumentRow>('SELECT * FROM qms_documents WHERE id=$1',[doc])).rows[0];
  const snapshot = { ...row, version };
  const digest = computeQmsDocumentContentDigest(snapshot);
  snapshot.metadata = { ...snapshot.metadata, approval: { ...(snapshot.metadata?.approval as object), contentDigest: digest } };
  await jdb.pglite.query(`
    INSERT INTO qms_training_records (organization_id, user_id, document_id, document_version, expires_at, acknowledged_at, metadata, acknowledgment_method)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'attestation')`,
  [options.org ?? 1, user, doc, version,
    options.expires === 'never' ? null : new Date(NOW.getTime() + (options.expires === 'past' ? -1 : 1) * 86400000),
    options.acknowledgedAt ?? '2026-10-02T00:00:00Z',
    JSON.stringify({ declaration: QMS_TRAINING_DECLARATION, bindingBasis: 'qms-document-version-content-sha256', contentDigest: digest, documentSnapshot: snapshot })]);
}
async function compliance(org = 1) {
  return readQmsTrainingCompliance({ query: (sql, params) => jdb.pglite.query<Record<string, unknown>>(sql, params) }, org, NOW);
}

describe('current-version controlled-procedure training', () => {
  it('requires a fresh acknowledgment after revision and retains v1 training as history', async () => {
    const doc = await document();
    await acknowledge(doc, 10, '1.0');
    expect(await compliance()).toEqual([expect.objectContaining({ id: doc, current: 1 })]);

    // The lifecycle service owns signed revision/approval; this read regression
    // supplies its resulting version/status rather than bypassing it in runtime.
    await jdb.pglite.query(`UPDATE qms_documents SET version = '2.0', status = 'draft' WHERE id = $1`, [doc]);
    expect(await compliance()).toEqual([]);
    await jdb.pglite.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [doc]);
    await release(doc);
    expect(await compliance()).toEqual([expect.objectContaining({ id: doc, current: 0, of: 3, last_cycle: null })]);
    expect((await jdb.pglite.query(`SELECT document_version FROM qms_training_records WHERE document_id = $1`, [doc])).rows)
      .toEqual([{ document_version: '1.0' }]);

    await acknowledge(doc, 10, '2.0');
    expect(await compliance()).toEqual([expect.objectContaining({ id: doc, current: 1, of: 3 })]);
    expect((await jdb.pglite.query(`SELECT document_version FROM qms_training_records WHERE document_id = $1 ORDER BY id`, [doc])).rows)
      .toEqual([{ document_version: '1.0' }, { document_version: '2.0' }]);
  });

  it('counts distinct members with unexpired current-version evidence and preserves cycle dates', async () => {
    const doc = await document({ version: '2.0' });
    await acknowledge(doc, 10, '2.0', { acknowledgedAt: '2026-10-01T00:00:00Z' });
    await acknowledge(doc, 10, '2.0', { acknowledgedAt: '2026-10-02T00:00:00Z' });
    await acknowledge(doc, 11, '2.0', { expires: 'never', acknowledgedAt: '2026-10-03T00:00:00Z' });
    await acknowledge(doc, 12, '2.0', { expires: 'past', acknowledgedAt: '2026-10-04T00:00:00Z' });
    await acknowledge(doc, 12, '1.0', { acknowledgedAt: '2026-10-05T00:00:00Z' });
    expect(await compliance()).toEqual([expect.objectContaining({
      id: doc, current: 2, of: 3, last_cycle: '2026-10-03T00:00:00.000Z',
    })]);
    expect((await jdb.pglite.query('SELECT COUNT(*)::int AS n FROM qms_training_records')).rows).toEqual([{ n: 5 }]);
  });

  it('uses the active organization roster for both counts, excluding departed and foreign users', async () => {
    const doc = await document();
    for (const user of [10, 13, 14, 15, 16, 17]) await acknowledge(doc, user, '1.0');
    // Legacy cross-org row: the read must still defend organization attribution.
    await acknowledge(doc, 11, '1.0', { org: 2 });
    expect(await compliance()).toEqual([expect.objectContaining({ id: doc, current: 1, of: 3 })]);
    await jdb.pglite.query('DELETE FROM organization_users WHERE organization_id = 1 AND user_id = 10');
    expect(await compliance()).toEqual([expect.objectContaining({ id: doc, current: 0, of: 2, last_cycle: null })]);
    expect((await jdb.pglite.query('SELECT COUNT(*)::int AS n FROM qms_training_records')).rows).toEqual([{ n: 7 }]);
  });

  it('isolates documents and organizations even when they have equal version strings', async () => {
    const first = await document();
    const second = await document({ number: 'SOP-002', version: '2.0' });
    const foreign = await document({ org: 2, number: 'SOP-001' });
    await acknowledge(first, 10, '1.0');
    await acknowledge(second, 11, '1.0');
    await acknowledge(foreign, 16, '1.0', { org: 2 });
    expect(await compliance()).toEqual([
      expect.objectContaining({ id: first, current: 1, of: 3 }),
      expect.objectContaining({ id: second, current: 0, of: 3, last_cycle: null }),
    ]);
    expect(await compliance(2)).toEqual([expect.objectContaining({ id: foreign, current: 1, of: 2 })]);
  });

  it('reports an honest zero denominator when no active members remain, retaining training history', async () => {
    const doc = await document();
    await acknowledge(doc, 10, '1.0');
    await jdb.pglite.query('DELETE FROM organization_users WHERE organization_id = 1');
    expect(await compliance()).toEqual([expect.objectContaining({ id: doc, current: 0, of: 0, last_cycle: null })]);
    expect((await jdb.pglite.query('SELECT COUNT(*)::int AS n FROM qms_training_records')).rows).toEqual([{ n: 1 }]);
  });

  it('includes all trainable effective types and excludes draft, retired, deleted and nontrainable records', async () => {
    for (const type of ['sop', 'wi', 'manual', 'policy', 'protocol', 'curriculum']) {
      await document({ number: `A-${type}`, type });
    }
    await document({ number: 'Z-DRAFT', status: 'draft' });
    await document({ number: 'Z-REVIEW', status: 'in_review' });
    await document({ number: 'Z-RETIRED', status: 'retired' });
    await document({ number: 'Z-DELETED', deleted: true });
    await document({ number: 'Z-FORM', type: 'form' });
    await document({ number: 'Z-SPEC', type: 'spec' });
    const rows = await compliance();
    expect(rows.map(row => row.doc_number)).toEqual(['A-curriculum', 'A-manual', 'A-policy', 'A-protocol', 'A-sop', 'A-wi']);
    expect(rows.every(row => row.current === 0 && row.of === 3 && row.last_cycle === null)).toBe(true);
  });
});
