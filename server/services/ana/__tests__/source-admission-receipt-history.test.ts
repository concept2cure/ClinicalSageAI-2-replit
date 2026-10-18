import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), wrapper: vi.fn(), scope: {} as any }));
vi.mock('../../vault/document-catalog-actor-access.js', () => ({ withAnaSourceReadScope: h.wrapper }));
import { fingerprintSourceAdmissionReceiptV2, type SourceAdmissionReceiptV2 } from '../../../../shared/ana/source-admission-receipts.js';
import { AnaProjectScopeError } from '../project-scope-admission.js';
import { listSourceAdmissionReceiptsForActor } from '../source-admission-receipt-history.js';
const receiptId = '30000000-0000-4000-8000-000000000003';
const documentId = '20000000-0000-4000-8000-000000000002';
const program = '10000000-0000-4000-8000-000000000001';
const descriptor = (): SourceAdmissionReceiptV2 => ({ version: 2, receiptId, checkpoint: 'host_budget_admitted', organizationId: 42,
  actorId: 7, admittedRole: 'viewer', programId: program, documentId,
  originalSha256: 'a'.repeat(64), extractionSha256: 'b'.repeat(64), totalChars: 120,
  ranges: [{ start: 2, end: 8, sha256: 'c'.repeat(64) }, { start: 100, end: 115, sha256: 'd'.repeat(64) }],
  payloadSha256: 'e'.repeat(64), toolUseId: 'tool-1', threadId: 'actor-private-thread' });
const actor = () => ({ organizationId: 42, userId: 7 });
async function rowOf(d: SourceAdmissionReceiptV2 = descriptor()): Promise<Record<string, any>> {
  return { id: d.receiptId, organization_id: d.organizationId, receipt_version: d.version, checkpoint: d.checkpoint,
    actor_user_id: d.actorId, admitted_role: d.admittedRole, program_id: d.programId, document_id: d.documentId,
    original_sha256: d.originalSha256, extraction_sha256: d.extractionSha256, total_chars: d.totalChars, ranges: globalThis.structuredClone(d.ranges),
    payload_sha256: d.payloadSha256, tool_use_id: d.toolUseId, thread_id: d.threadId, receipt_sha256: await fingerprintSourceAdmissionReceiptV2(d),
    accepted_at: new Date('2026-10-14T20:00:00Z'), scope_total: '40' };
}
beforeEach(() => {
  vi.resetAllMocks(); h.scope = { ...actor(), role: 'member', projectId: null, programId: null, accessibleProgramIds: [program], actorFiltered: true };
  h.wrapper.mockImplementation(async (_input, run) => run({ query: h.query }, h.scope));
});
describe('actor-only historical source admission ledger', () => {
  it('uses canonical admission and actor/program filters before window counts and LIMIT', async () => {
    h.query.mockResolvedValue({ rows: [await rowOf()] });
    const page = await listSourceAdmissionReceiptsForActor(actor(), { limit: 1 });
    expect(page).toMatchObject({ total: 40, withheld: 39, actorFiltered: true, checkpoint: 'host_budget_admitted', sourceUse: 'historical_admission_only', providerDelivery: 'unestablished' });
    expect(page.receipts[0]).toMatchObject({ descriptor: descriptor(), acceptedAt: '2026-10-14T20:00:00.000Z' });
    expect(Object.isFrozen(page.receipts[0].descriptor.ranges)).toBe(true); expect(Object.isFrozen(page.receipts)).toBe(true);
    const [sql, params] = h.query.mock.calls[0];
    expect(sql).toContain('r.organization_id=$1 AND r.actor_user_id=$2 AND r.program_id=ANY($3::uuid[])'); expect(sql).toContain('COUNT(*) OVER ()');
    expect(sql.indexOf('r.actor_user_id=$2')).toBeLessThan(sql.lastIndexOf('LIMIT $4')); expect(params).toEqual([42, 7, [program], 1]);
    expect(h.wrapper.mock.calls[0][0]).toMatchObject(actor());
  });
  it('exact document/receipt selections remain filters rather than authorizing scope', async () => {
    h.query.mockResolvedValue({ rows: [{ ...await rowOf(), scope_total: '1' }] });
    expect(await listSourceAdmissionReceiptsForActor(actor(), { receiptId, documentId, limit: 2 })).toMatchObject({ total: 1, withheld: 0 });
    const [sql, params] = h.query.mock.calls[0]; expect(sql).toContain('r.document_id=$5::uuid'); expect(sql).toContain('r.id=$6::uuid'); expect(params).toEqual([42, 7, [program], 2, documentId, receiptId]);
  });
  it('historical metadata survives removed source and preserves the original admitted role', async () => {
    h.query.mockResolvedValue({ rows: [{ ...await rowOf(), scope_total: '1' }] });
    const page = await listSourceAdmissionReceiptsForActor(actor());
    expect(h.query.mock.calls[0][0]).not.toContain('vault.documents'); expect(page.receipts[0].descriptor.admittedRole).toBe('viewer');
    expect(page.notice).toContain('survives source removal'); expect(page.notice).toContain('does not establish a new source read');
  });
  it.each(['actor', 'tenant', 'private_program', 'wrong_document', 'wrong_receipt'])('unexpected returned %s metadata refuses without exposing a page', async kind => {
    const d: any = descriptor(); if (kind === 'actor') d.actorId = 8; if (kind === 'tenant') d.organizationId = 8;
    if (kind === 'private_program') d.programId = '10000000-0000-4000-8000-000000000009';
    if (kind === 'wrong_document') d.documentId = '20000000-0000-4000-8000-000000000009';
    if (kind === 'wrong_receipt') d.receiptId = '30000000-0000-4000-8000-000000000009';
    h.query.mockResolvedValue({ rows: [await rowOf(d)] });
    await expect(listSourceAdmissionReceiptsForActor(actor(), { documentId, receiptId })).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_HISTORY_UNAVAILABLE' });
  });
  it.each(['fingerprint', 'shape', 'invalid_time', 'normalized_time', 'unknown_count', 'unsafe_count', 'mismatched_count'])('malformed ledger %s is unavailable instead of an empty history', async kind => {
    const row = await rowOf(); if (kind === 'fingerprint') row.receipt_sha256 = 'f'.repeat(64); if (kind === 'shape') row.ranges[0].quotedText = 'cannot be persisted';
    if (kind === 'invalid_time') row.accepted_at = 'not-a-time'; if (kind === 'unknown_count') delete row.scope_total;
    if (kind === 'normalized_time') row.accepted_at = '2026-02-31T20:00:00.000Z';
    if (kind === 'unsafe_count') row.scope_total = '9007199254740993';
    const rows = kind === 'mismatched_count' ? [row, { ...await rowOf(), scope_total: '2' }] : [row];
    h.query.mockResolvedValue({ rows }); await expect(listSourceAdmissionReceiptsForActor(actor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_HISTORY_UNAVAILABLE' });
  });
  it.each([{ documentId: '' }, { receiptId: 'model-invented' }, { documentId: null }, { limit: 0 }, { limit: 201 }, { limit: 1.5 }, { limit: NaN }, { actorId: 8 }])('invalid selection cannot broaden before admission: %j', async opts => {
    await expect(listSourceAdmissionReceiptsForActor(actor(), opts as any)).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_HISTORY_FILTER_INVALID' });
    expect(h.wrapper).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
  });
  it('scope revocation after query prevents returning the loaded private context', async () => {
    h.query.mockResolvedValue({ rows: [await rowOf()] });
    h.wrapper.mockImplementation(async (_input, run) => {
      await run({ query: h.query }, h.scope);
      throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', 'Revoked');
    });
    await expect(listSourceAdmissionReceiptsForActor(actor())).rejects.toMatchObject({ code: 'ANA_SOURCE_SCOPE_CHANGED' });
  });
  it('true authenticated empty actor scope is zero without widening the query', async () => {
    h.scope.accessibleProgramIds = []; h.query.mockResolvedValue({ rows: [] });
    expect(await listSourceAdmissionReceiptsForActor(actor())).toMatchObject({ total: 0, withheld: 0, receipts: [] });
    expect(h.query.mock.calls[0][1][2]).toEqual([]);
  });
  it('unknown SQL/policy state is unavailable and does not expose driver detail', async () => {
    h.query.mockRejectedValue(new Error('private foreign thread and secret credential'));
    await expect(listSourceAdmissionReceiptsForActor(actor())).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_HISTORY_UNAVAILABLE', message: expect.not.stringContaining('secret') });
  });
  it('input/filter mutation before asynchronous scope resolution cannot change selected history', async () => {
    const input = actor(); const opts = { receiptId, documentId, limit: 1 }; h.query.mockResolvedValue({ rows: [{ ...await rowOf(), scope_total: '1' }] });
    let seen: any;
    h.wrapper.mockImplementation(async (pinned, run) => {
      seen = pinned; await Promise.resolve(); return run({ query: h.query }, h.scope);
    });
    const pending = listSourceAdmissionReceiptsForActor(input, opts); input.userId = 8; opts.documentId = 'bad'; opts.limit = 200;
    await pending; expect(seen.userId).toBe(7); expect(h.query.mock.calls[0][1]).toEqual([42, 7, [program], 1, documentId, receiptId]);
  });
});
