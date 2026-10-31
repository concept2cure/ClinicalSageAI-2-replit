import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { VAULT_DDL } from '../../../routes/__tests__/_authoring-canvas-fixture';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, get pool() { return holder.pool; } }));
const logAction = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../auditService', () => ({ default: { logAction } }));

import { upsertLeaf, type UpsertLeafInput } from '../submission-service';

let h: IndPgliteDb;
const CTX = { organizationId: 1, userId: 9 };
const P = '0a000000-0000-4000-8000-0000000000aa';
const DOC = 'a1000000-0000-4000-8000-0000000000a1';
let sequenceId = 0;
const q = async <T = any>(text: string, params: unknown[] = []) => (await h.pglite.query<T>(text, params)).rows;
const placement = (extra: Record<string, unknown> = {}): UpsertLeafInput => ({
  sequenceId, sectionCode: '5.3.5.1', title: 'Study report', documentTable: 'vault_documents', documentUuid: DOC,
  reason: 'Sponsor confirmed study classification', ...extra,
} as UpsertLeafInput);
const edit = (leaf: any, extra: Record<string, unknown> = {}): UpsertLeafInput => placement({
  leafId: leaf.id, studyId: 'STUDY-101', stfFileTag: 'study-report-body',
  studyTaggingEdit: { expectedStudyId: leaf.studyId ?? null, expectedStfFileTag: leaf.stfFileTag ?? null,
    expectedUpdatedAt: new Date(leaf.updatedAt).toISOString() }, ...extra,
});

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true, programSpine: true });
  holder.db = h.db;
  holder.pool = { query: (text: string, params?: unknown[]) => h.pglite.query(text, params as unknown[]) };
  await h.pglite.exec(VAULT_DDL);
  // Placement asks whether a Vault document is a registered company legal record (20261018).
  await h.pglite.exec(readFileSync(new URL('../../../../migrations/20261018_company_legal_registry.sql', import.meta.url), 'utf8'));
  await q(`INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name)
    VALUES ($1, 1, 'Program', 'P-1', 'ind', 'Alpha')`, [P]);
  await q(`INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, content_hash)
    VALUES ($1, $2, 1, 'CSR-101', 'Study report', 'PROTOCOL', $3)`, [DOC, P, 'a'.repeat(64)]);
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES (1, 'IND', 'ind', 'pharma', 'fda', 1, 9, $1)`, [P]);
});
afterAll(async () => { await h?.close(); });
beforeEach(async () => {
  const [s] = await q<{ id: number }>(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
    VALUES (1, 'fda', '0000', 'draft', 1, 9) RETURNING id`);
  sequenceId = Number(s.id);
  logAction.mockClear();
});

describe('canonical study metadata writes', () => {
  it('persists explicit metadata on insert and records the values in the existing audit', async () => {
    const leaf = await upsertLeaf(placement({ studyId: ' STUDY-101 ', stfFileTag: ' study-report-body ' }), CTX);
    expect(leaf).toMatchObject({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' });
    expect((await q('SELECT study_id, stf_file_tag FROM submission_leaves WHERE id=$1', [leaf.id]))[0])
      .toEqual({ study_id: 'STUDY-101', stf_file_tag: 'study-report-body' });
    expect(logAction.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'LEAF_CREATED', details: {
      studyMetadata: { studyId: 'STUDY-101', stfFileTag: 'study-report-body' },
    } });
  });

  it('ordinary updates preserve omitted metadata and explicit null clears it', async () => {
    const leaf = await upsertLeaf(placement({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' }), CTX);
    const saved = await upsertLeaf(placement({ leafId: leaf.id, title: 'Reviewed report' }), CTX);
    expect(saved).toMatchObject({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' });
    const cleared = await upsertLeaf(placement({ leafId: leaf.id, studyId: null, stfFileTag: null }), CTX);
    expect(cleared).toMatchObject({ studyId: null, stfFileTag: null });
  });

  it('changes only metadata and updatedAt, even when the source has changed and supplied pointers disagree', async () => {
    const leaf = await upsertLeaf(placement(), CTX);
    await q('UPDATE vault.documents SET content_hash=$1 WHERE id=$2', ['b'.repeat(64), DOC]);
    const saved = await upsertLeaf(edit(leaf, { documentTable: 'untrusted', documentId: 101, documentUuid: undefined,
      lifecycleOp: 'delete', parentLeafId: 999, checksum: 'untrusted', granularity: 'untrusted' }), CTX);
    expect(saved).toMatchObject({ id: leaf.id, sequenceId, studyId: 'STUDY-101', stfFileTag: 'study-report-body',
      documentTable: leaf.documentTable, documentId: leaf.documentId, documentUuid: leaf.documentUuid,
      documentContentSha256: leaf.documentContentSha256, documentPinnedAt: leaf.documentPinnedAt,
      lifecycleOp: leaf.lifecycleOp, parentLeafId: leaf.parentLeafId, checksum: leaf.checksum, granularity: leaf.granularity });
    expect(logAction.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'LEAF_UPDATED', details: {
      previousStudyMetadata: { studyId: null, stfFileTag: null },
      studyMetadata: { studyId: 'STUDY-101', stfFileTag: 'study-report-body' },
      reason: 'Sponsor confirmed study classification',
    } });
  });

  it('demotes a validated sequence on a real metadata edit', async () => {
    const leaf = await upsertLeaf(placement(), CTX);
    await q("UPDATE ectd_sequences SET status='validated', validation_status='passed' WHERE id=$1", [sequenceId]);
    const saved = await upsertLeaf(edit(leaf), CTX);
    expect(saved.sequenceStatusChanged).toMatchObject({ from: 'validated', to: 'assembling' });
    expect((await q('SELECT status, validation_status FROM ectd_sequences WHERE id=$1', [sequenceId]))[0])
      .toEqual({ status: 'assembling', validation_status: null });
  });

  it('a no-op preserves validation, timestamps and audit history', async () => {
    const leaf = await upsertLeaf(placement({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' }), CTX);
    await q("UPDATE ectd_sequences SET status='validated', validation_status='passed' WHERE id=$1", [sequenceId]);
    logAction.mockClear();
    const saved = await upsertLeaf(edit(leaf), CTX);
    expect(saved).toMatchObject({ unchanged: true, auditTrail: null, updatedAt: leaf.updatedAt });
    expect(saved.sequenceStatusChanged).toBeUndefined();
    expect(logAction).not.toHaveBeenCalled();
    expect((await q('SELECT status FROM ectd_sequences WHERE id=$1', [sequenceId]))[0].status).toBe('validated');
  });
});

describe('study metadata edit guards and outcomes', () => {
  it('refuses a null revision without auditing or demoting validation', async () => {
    const leaf = await upsertLeaf(placement(), CTX);
    await q('UPDATE submission_leaves SET updated_at=NULL WHERE id=$1', [leaf.id]);
    await q("UPDATE ectd_sequences SET status='validated', validation_status='passed' WHERE id=$1", [sequenceId]);
    logAction.mockClear();
    await expect(upsertLeaf(edit({ ...leaf, updatedAt: null }), CTX)).rejects.toMatchObject({ code: 'STALE_LEAF' });
    expect(logAction).not.toHaveBeenCalled();
    expect((await q('SELECT study_id, stf_file_tag, updated_at FROM submission_leaves WHERE id=$1', [leaf.id]))[0])
      .toEqual({ study_id: null, stf_file_tag: null, updated_at: null });
    expect((await q('SELECT status, validation_status FROM ectd_sequences WHERE id=$1', [sequenceId]))[0])
      .toEqual({ status: 'validated', validation_status: 'passed' });
  });

  it.each([
    { expectedStudyId: 'other' }, { expectedStfFileTag: 'other' }, { expectedUpdatedAt: '2000-01-01T00:00:00.000Z' },
  ])('refuses a stale expected snapshot: %j', async (different) => {
    const leaf = await upsertLeaf(placement(), CTX);
    const input = edit(leaf) as any;
    input.studyTaggingEdit = { ...input.studyTaggingEdit, ...different };
    logAction.mockClear();
    await expect(upsertLeaf(input, CTX)).rejects.toMatchObject({ code: 'STALE_LEAF' });
    expect(logAction).not.toHaveBeenCalled();
  });

  it.each([{ title: 'another title' }, { sectionCode: '5.3.5.2' }])('refuses changed row identity: %j', async (different) => {
    const leaf = await upsertLeaf(placement(), CTX);
    await expect(upsertLeaf(edit(leaf, different), CTX)).rejects.toMatchObject({ code: 'STALE_LEAF' });
  });

  it.each(['frozen', 'dispatched'])('refuses metadata edits in %s sequences', async (status) => {
    const leaf = await upsertLeaf(placement(), CTX);
    await q('UPDATE ectd_sequences SET status=$1 WHERE id=$2', [status, sequenceId]);
    await expect(upsertLeaf(edit(leaf), CTX)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('does not expose another tenant or another sequence leaf', async () => {
    const leaf = await upsertLeaf(placement(), CTX);
    await expect(upsertLeaf(edit(leaf), { organizationId: 2, userId: 9 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const [other] = await q<{ id: number }>(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
      VALUES (1, 'fda', '0001', 'draft', 1, 9) RETURNING id`);
    await expect(upsertLeaf(edit(leaf, { sequenceId: Number(other.id) }), CTX)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses duplicate placement with differing explicit metadata instead of discarding it', async () => {
    await upsertLeaf(placement(), CTX);
    await expect(upsertLeaf(placement({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' }), CTX))
      .rejects.toMatchObject({ code: 'ALREADY_PLACED' });
  });

  it('returns unchanged for a duplicate with matching explicit metadata', async () => {
    const leaf = await upsertLeaf(placement({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' }), CTX);
    logAction.mockClear();
    expect(await upsertLeaf(placement({ studyId: 'STUDY-101', stfFileTag: 'study-report-body' }), CTX))
      .toMatchObject({ id: leaf.id, unchanged: true, auditTrail: null });
    expect(logAction).not.toHaveBeenCalled();
  });

  it('reports both unconfirmed audits without undoing committed metadata or its sequence transition', async () => {
    const leaf = await upsertLeaf(placement(), CTX);
    await q("UPDATE ectd_sequences SET status='validated', validation_status='passed' WHERE id=$1", [sequenceId]);
    logAction.mockClear();
    logAction.mockImplementationOnce(async () => ({ persisted: false, chained: false, tamperProof: false }))
      .mockImplementationOnce(async () => ({ persisted: false, chained: false, tamperProof: false }));
    const saved = await upsertLeaf(edit(leaf), CTX);
    expect(saved.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(saved.sequenceStatusChanged).toMatchObject({ from: 'validated', to: 'assembling', auditTrail: { persisted: false } });
    expect((await q('SELECT study_id FROM submission_leaves WHERE id=$1', [leaf.id]))[0].study_id).toBe('STUDY-101');
    expect((await q('SELECT status, validation_status FROM ectd_sequences WHERE id=$1', [sequenceId]))[0])
      .toEqual({ status: 'assembling', validation_status: null });
    expect(logAction).toHaveBeenCalledTimes(2);
  });

  it.each([{ reason: undefined }, { reason: 42 }, { studyTaggingEdit: { expectedStudyId: null, expectedStfFileTag: null,
    expectedUpdatedAt: 'October 20, 2026' } }])('refuses malformed direct metadata edits: %j', async (invalid) => {
    const leaf = await upsertLeaf(placement(), CTX);
    await expect(upsertLeaf(edit(leaf, invalid), CTX)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it.each([{ studyId: 'bad/id' }, { studyId: '' }, { stfFileTag: '' }, { stfFileTag: 'a\nwrong-tag' },
    { stfFileTag: 'x'.repeat(129) }, { studyTaggingEdit: {}, studyId: null, stfFileTag: null }])('validates non-route callers before writing: %j', async (invalid) => {
      await expect(upsertLeaf(placement(invalid), CTX)).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await q('SELECT id FROM submission_leaves WHERE sequence_id=$1', [sequenceId])).toHaveLength(0);
    });
});
