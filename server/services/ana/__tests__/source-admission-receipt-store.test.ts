import { describe, expect, it, vi } from 'vitest';
import { fingerprintSourceAdmissionReceiptV2, type SourceAdmissionReceiptV2 } from '../../../../shared/ana/source-admission-receipts.js';
import { appendSourceAdmissionReceipt, readSourceAdmissionReceiptRow } from '../source-admission-receipt-store.js';
const id = '30000000-0000-4000-8000-000000000003';
const descriptor = (): SourceAdmissionReceiptV2 => ({ version: 2, receiptId: id, checkpoint: 'host_budget_admitted', organizationId: 42,
  actorId: 7, admittedRole: 'viewer', programId: '10000000-0000-4000-8000-000000000001', documentId: '20000000-0000-4000-8000-000000000002',
  originalSha256: 'a'.repeat(64), extractionSha256: 'b'.repeat(64), totalChars: 120,
  ranges: [{ start: 2, end: 8, sha256: 'c'.repeat(64) }, { start: 100, end: 115, sha256: 'd'.repeat(64) }],
  payloadSha256: 'e'.repeat(64), toolUseId: 'tool-α', threadId: 'thread-1' });
async function rowOf(d: SourceAdmissionReceiptV2 = descriptor()): Promise<Record<string, any>> {
  return { id: d.receiptId, organization_id: d.organizationId, receipt_version: d.version, checkpoint: d.checkpoint,
    actor_user_id: d.actorId, admitted_role: d.admittedRole, program_id: d.programId, document_id: d.documentId,
    original_sha256: d.originalSha256, extraction_sha256: d.extractionSha256, total_chars: d.totalChars,
    ranges: globalThis.structuredClone(d.ranges), payload_sha256: d.payloadSha256, tool_use_id: d.toolUseId, thread_id: d.threadId,
    receipt_sha256: await fingerprintSourceAdmissionReceiptV2(d) };
}
describe('immutable exact-source admission metadata append', () => {
  it('records only one real exact INSERT RETURNING row, with no source or payload body', async () => {
    const d = descriptor(); const q = { query: vi.fn().mockResolvedValue({ rows: [await rowOf(d)], rowCount: 1 }) };
    const out = await appendSourceAdmissionReceipt(q, d);
    expect(out).toEqual({ receiptId: id, outcome: 'recorded' }); expect(Object.isFrozen(out)).toBe(true);
    const [sql, values] = q.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO public.ana_source_read_receipts'); expect(sql).toContain('ON CONFLICT (id) DO NOTHING RETURNING');
    expect(sql).not.toContain('UPDATE'); expect(values).toHaveLength(16);
    expect(values[11]).toBe(JSON.stringify(d.ranges)); expect(values[15]).toBe(await fingerprintSourceAdmissionReceiptV2(d));
    expect(q.query).toHaveBeenCalledOnce();
  });
  it('an identical stable-ID retry acknowledges existing history without an UPDATE', async () => {
    const q = { query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [await rowOf()], rowCount: 1 }) };
    expect(await appendSourceAdmissionReceipt(q, descriptor())).toEqual({ receiptId: id, outcome: 'already_recorded' });
    expect(q.query.mock.calls[1][0]).toContain('id=$1::uuid AND organization_id=$2 AND actor_user_id=$3');
    expect(q.query.mock.calls[1][1]).toEqual([id, 42, 7]);
    expect(q.query.mock.calls.every(call => !call[0].includes('UPDATE'))).toBe(true);
  });
  it.each([['zero', 0, 0], ['missing_rows', 1, 0], ['ambiguous', 2, 2], ['unknown_count', undefined, 1], ['returned_without_insert', 0, 1]])('cannot acknowledge uncertain INSERT outcome: %s', async (_kind, count, n) => {
    const row = await rowOf(); const q = { query: vi.fn().mockResolvedValueOnce({ rows: Array(n).fill(row), rowCount: count }).mockResolvedValueOnce({ rows: [], rowCount: 0 }) };
    await expect(appendSourceAdmissionReceipt(q, descriptor())).rejects.toMatchObject({ code: count === 0 && n === 0 ? 'ANA_ADMISSION_RECEIPT_CONFLICT' : 'ANA_ADMISSION_RECEIPT_UNCONFIRMED' });
  });
  it.each(['actor', 'program', 'document', 'original', 'extraction', 'payload', 'ranges', 'role', 'thread', 'tool'])('a reused ID with altered immutable %s cannot be accepted', async kind => {
    const changed: any = globalThis.structuredClone(descriptor());
    if (kind === 'actor') changed.actorId = 8;
    if (kind === 'program') changed.programId = '10000000-0000-4000-8000-000000000009';
    if (kind === 'document') changed.documentId = '20000000-0000-4000-8000-000000000009';
    if (kind === 'original') changed.originalSha256 = 'f'.repeat(64);
    if (kind === 'extraction') changed.extractionSha256 = 'f'.repeat(64);
    if (kind === 'payload') changed.payloadSha256 = 'f'.repeat(64);
    if (kind === 'ranges') changed.ranges = [{ start: 3, end: 8, sha256: 'c'.repeat(64) }];
    if (kind === 'role') changed.admittedRole = 'member';
    if (kind === 'thread') changed.threadId = 'other-thread';
    if (kind === 'tool') changed.toolUseId = 'other-tool';
    const q = { query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [await rowOf(changed)], rowCount: 1 }) };
    await expect(appendSourceAdmissionReceipt(q, descriptor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_CONFLICT' });
  });
  it('wrong INSERT RETURNING identity is unconfirmed even if its independent fingerprint is valid', async () => {
    const changed = { ...descriptor(), actorId: 8 }; const q = { query: vi.fn().mockResolvedValue({ rows: [await rowOf(changed)], rowCount: 1 }) };
    await expect(appendSourceAdmissionReceipt(q, descriptor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_UNCONFIRMED' });
  });
  it.each(['fingerprint', 'range_shape', 'unknown_range_field', 'missing_context', 'bad_checkpoint'])('malformed stored ledger metadata is never confirmed: %s', async kind => {
    const row = await rowOf(); if (kind === 'fingerprint') row.receipt_sha256 = 'f'.repeat(64);
    if (kind === 'range_shape') row.ranges = [{ start: 5, end: 2, sha256: 'c'.repeat(64) }];
    if (kind === 'unknown_range_field') row.ranges[0].quote = 'This source body cannot be stored';
    if (kind === 'missing_context') delete row.tool_use_id;
    if (kind === 'bad_checkpoint') row.checkpoint = 'provider_served';
    const q = { query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }) };
    await expect(appendSourceAdmissionReceipt(q, descriptor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_UNCONFIRMED' });
  });
  it('foreign/inaccessible same-ID conflict has the same safe refusal and no exposed row', async () => {
    const q = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    await expect(appendSourceAdmissionReceipt(q, descriptor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_CONFLICT' });
  });
  it.each(['body', 'accepted_at', 'sparse_ranges', 'bad_actor', 'overlap', 'unknown_id'])('malformed incoming descriptor refuses before SQL: %s', async kind => {
    const d: any = descriptor(); if (kind === 'body') d.quotedText = 'private text'; if (kind === 'accepted_at') d.accepted_at = new Date();
    if (kind === 'sparse_ranges') d.ranges = Array(2);
    if (kind === 'bad_actor') d.actorId = 0;
    if (kind === 'overlap') d.ranges = [{ start: 0, end: 10, sha256: 'a'.repeat(64) }, { start: 5, end: 20, sha256: 'b'.repeat(64) }];
    if (kind === 'unknown_id') d.receiptId = 'model-selected';
    const q = { query: vi.fn() }; await expect(appendSourceAdmissionReceipt(q, d)).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_INVALID' }); expect(q.query).not.toHaveBeenCalled();
  });
  it('input mutation during async fingerprinting cannot rewrite the inserted immutable identity', async () => {
    const d: any = descriptor(); const row = await rowOf(d); const q = { query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }) };
    const pending = appendSourceAdmissionReceipt(q, d); d.actorId = 8; d.ranges[0].start = 6; d.receiptId = '30000000-0000-4000-8000-000000000009';
    expect(await pending).toEqual({ receiptId: id, outcome: 'recorded' }); expect(q.query.mock.calls[0][1][4]).toBe(7); expect(JSON.parse(q.query.mock.calls[0][1][11])[0].start).toBe(2);
  });
  it('returned row mutation during fingerprint verification cannot alter projected history', async () => {
    const row = await rowOf(); const pending = readSourceAdmissionReceiptRow(row);
    row.actor_user_id = 8; row.ranges[0].start = 6; row.receipt_sha256 = 'f'.repeat(64);
    const out = await pending; expect(out.descriptor.actorId).toBe(7); expect(out.descriptor.ranges[0].start).toBe(2); expect(Object.isFrozen(out.descriptor.ranges[0])).toBe(true);
  });
  it('SQL errors cannot disclose sensitive driver detail or fabricate empty success', async () => {
    const q = { query: vi.fn().mockRejectedValue(new Error('private foreign thread and credential detail')) };
    await expect(appendSourceAdmissionReceipt(q, descriptor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_UNCONFIRMED', message: expect.not.stringContaining('private foreign') });
  });
});
