import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as receipts from '../read-receipts.js';
import { notDeliveredResult, type ToolResultEntry } from '../agentic-loop.js';
import { SourceReadSnapshotError } from '../source-read-receipt.js';

const h = vi.hoisted(() => ({
  current: null as any, admitted: true, inserted: [] as unknown[][],
  queries: [] as string[], releases: 0, insertFails: false,
  insertMode: 'ok' as 'ok' | 'zero' | 'wrong_actor',
  abortAfterInsert: null as AbortController | null,
  abortAfterCommit: null as AbortController | null,
  load: vi.fn(), admit: vi.fn(),
}));
vi.mock('../../../db.js', () => ({
  pool: { connect: async () => ({
    query: async (sql: string, values: unknown[] = []) => {
      h.queries.push(sql);
      if (sql.includes('INSERT INTO vault.document_read_receipts')) {
        if (h.insertFails) throw new Error('internal insert failed');
        if (h.insertMode === 'zero') return { rowCount: 0, rows: [] };
        h.inserted.push([...values]);
        h.abortAfterInsert?.abort();
        return { rowCount: 1, rows: [{ id: '41', document_id: values[0], content_hash: values[1],
          char_start: values[2], char_end: values[3], read_by: h.insertMode === 'wrong_actor' ? 999 : values[4], thread_id: values[5] }] };
      }
      if (sql === 'COMMIT') h.abortAfterCommit?.abort();
      return { rowCount: 0, rows: [] };
    },
    release: () => { h.releases++; },
  }) },
}));
vi.mock('../../../db/tenantStore.js', () => ({ getTenantScope: () => ({ tenantId: '42', role: 'member' }) }));
vi.mock('../../tenant/governed-tenant-context.js', () => ({ setTenantContextTx: vi.fn(async () => {}) }));
vi.mock('../source-read-scope.js', () => ({ admitAnaSourceReadScope: h.admit }));
vi.mock('../../vault/document-catalog-admission.js', () => ({
  admitCatalogActor: async () => {
    if (!h.admitted) throw new Error('private project revoked');
    return { role: 'viewer', projectId: 3 };
  },
}));
vi.mock('../../vault/document-catalog.service.js', () => ({
  loadDocumentForOrg: h.load,
  recordReadReceipt: async (r: any) => { h.inserted.push([r.documentId, r.contentHash, r.span.start, r.span.end, r.readBy]); },
}));

const DOC = '10000000-0000-4000-8000-000000000001';
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = 'Arm A 12/30.';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const source = () => ({ id: DOC, organizationId: 42, programId: PROGRAM,
  contentHash: 'a'.repeat(64), extractedText: TEXT, disposition: null,
  catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } });
function candidate() {
  const snapshot = { organizationId: 42, userId: 7, programId: PROGRAM,
    documentId: DOC, contentHash: 'a'.repeat(64), extractedTextSha256: sha(TEXT),
    totalChars: TEXT.length, span: { start: 0, end: TEXT.length }, threadId: 'thread-7' };
  const result = JSON.stringify({ ok: true, documentId: DOC, contentHash: snapshot.contentHash,
    extractedTextSha256: snapshot.extractedTextSha256, totalChars: TEXT.length,
    window: { ...snapshot.span, text: TEXT } });
  return { documentId: DOC, contentHash: snapshot.contentHash, span: { ...snapshot.span },
    readBy: 7, result, sourceSnapshot: snapshot };
}
const entry = (content: string): ToolResultEntry => ({ tool_use_id: 'r1', name: 'read_project_document', content });
function deferred(r = candidate()) {
  const map: receipts.DeferredReadReceipts = new Map();
  receipts.deferReadReceipt(receipts.readReceiptContext(map, 'r1'), r);
  return map;
}
beforeEach(() => {
  vi.clearAllMocks(); h.current = source(); h.admitted = true;
  h.inserted = []; h.queries = []; h.releases = 0; h.insertFails = false;
  h.insertMode = 'ok'; h.abortAfterInsert = null; h.abortAfterCommit = null;
  h.load.mockImplementation(async () => h.current);
  h.admit.mockImplementation(async () => {
    if (!h.admitted) throw new Error('private project revoked');
    return { organizationId: 42, userId: 7, role: 'viewer', projectId: 3,
      programId: PROGRAM, accessibleProgramIds: [PROGRAM], actorFiltered: true };
  });
});

describe('server-pinned legacy read receipt snapshots', () => {
  it('keeps a private snapshot when the caller changes its receipt, span and actor after deferral', () => {
    const r = candidate(); const map = deferred(r);
    r.span.end = 1; r.sourceSnapshot.span.end = 1; r.sourceSnapshot.userId = 999;
    r.result = '{"ok":false}';
    expect(map.get('r1')).toMatchObject({ result: candidate().result, span: { end: TEXT.length },
      sourceSnapshot: { userId: 7, span: { end: TEXT.length } } });
  });
  it('does not accept a same-length re-extraction under unchanged original bytes', async () => {
    const r = candidate(); const map = deferred(r);
    h.current.extractedText = 'Arm B 21/30.';
    expect(h.current.extractedText.length).toBe(TEXT.length);
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(0);
    expect(h.inserted).toEqual([]); expect(map.size).toBe(0);
  });
  it('does not write when current private-project access was revoked', async () => {
    const r = candidate(); const map = deferred(r); h.admitted = false;
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(0);
    expect(h.inserted).toEqual([]);
  });
  it.each(['program', 'hash', 'withdrawal', 'successor'] as const)('does not write after source %s change', async change => {
    const r = candidate(); const map = deferred(r);
    if (change === 'program') h.current.programId = DOC;
    if (change === 'hash') h.current.contentHash = 'b'.repeat(64);
    if (change === 'withdrawal') h.current.disposition = 'remove_data';
    if (change === 'successor') h.current = null;
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(0);
    expect(h.inserted).toEqual([]);
  });
  it('rejects an unchanged payload whose source window differs from the actual stored slice', async () => {
    const r = candidate(); r.result = r.result.replace(TEXT, 'Arm B 21/30.');
    const map = deferred(r);
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(0);
    expect(h.inserted).toEqual([]);
  });
  it('rejects out-of-bounds source spans before recording a receipt', async () => {
    const r = candidate(); r.span.end = TEXT.length + 1; r.sourceSnapshot.span.end = r.span.end;
    const map = deferred(r);
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(0);
    expect(h.inserted).toEqual([]);
  });
  it('uses fresh read authority and only legacy storage columns for a mocked successful INSERT', async () => {
    const r = candidate(); const map = deferred(r);
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(1);
    expect(h.inserted).toEqual([[DOC, 'a'.repeat(64), 0, TEXT.length, 7, 'thread-7']]);
    const insert = h.queries.find(q => q.includes('INSERT INTO vault.document_read_receipts'))!;
    expect(insert).not.toContain('extracted_text_sha256');
    expect(h.load).toHaveBeenCalledWith(DOC, 42, expect.objectContaining({ currentOnly: true, programId: PROGRAM, includeText: true, executor: expect.any(Object) }));
    expect(h.queries).toContain('COMMIT'); expect(h.releases).toBe(1); expect(map.size).toBe(0);
  });
  it.each(['zero', 'wrong_actor', 'error'] as const)('does not count a failed persistence receipt (%s)', async mode => {
    const r = candidate(); const map = deferred(r);
    if (mode === 'error') h.insertFails = true; else h.insertMode = mode;
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map)).toBe(0);
    expect(h.queries).toContain('ROLLBACK'); expect(h.queries).not.toContain('COMMIT');
    expect(h.releases).toBe(1); expect(map.size).toBe(0);
  });
  it('clears a pre-cancelled round without opening a receipt connection', async () => {
    const r = candidate(); const map = deferred(r); const controller = new AbortController(); controller.abort();
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map, undefined, { signal: controller.signal })).toBe(0);
    expect(h.queries).toEqual([]); expect(map.size).toBe(0);
  });
  it('rolls back cancellation observed after INSERT and before COMMIT', async () => {
    const r = candidate(); const map = deferred(r); const controller = new AbortController();
    h.abortAfterInsert = controller;
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map, undefined, { signal: controller.signal })).toBe(0);
    expect(h.queries).toContain('ROLLBACK'); expect(h.queries).not.toContain('COMMIT');
  });
  it('retains the actual committed count when cancellation arrives after COMMIT', async () => {
    const r = candidate(); const map = deferred(r); const controller = new AbortController();
    h.abortAfterCommit = controller;
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map, undefined, { signal: controller.signal })).toBe(1);
    expect(h.queries).toContain('COMMIT'); expect(h.queries).not.toContain('ROLLBACK');
  });
});

describe('settlement source refusal and ordinary write failures', () => {
  it('notifies the host when insertion observes a typed source refusal after the first handoff check', async () => {
    const r = candidate(); const map = deferred(r); const refused: string[] = [];
    const count = await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map,
      async () => { throw new SourceReadSnapshotError(); }, { onSourceRefused: id => { refused.push(id); } });
    expect(count).toBe(0); expect(refused).toEqual(['r1']); expect(map.size).toBe(0);
  });
  it('normalizes canonical actor/source verification refusal so the host withdraws it', async () => {
    const r = candidate(); const map = deferred(r); const refused: string[] = []; h.admitted = false;
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map, undefined,
      { onSourceRefused: id => { refused.push(id); } })).toBe(0);
    expect(refused).toEqual(['r1']); expect(h.inserted).toEqual([]);
  });
  it('retains authorized read content for an ordinary SQL42501 receipt insertion failure', async () => {
    const r = candidate(); const map = deferred(r); const refused: string[] = [];
    const count = await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map,
      async () => { throw Object.assign(new Error('receipt INSERT permission denied'), { code: '42501' }); },
      { onSourceRefused: id => { refused.push(id); } });
    expect(count).toBe(0); expect(refused).toEqual([]);
  });
  it('stops a three-read round after typed source refusal and preserves the first committed count', async () => {
    const r = candidate(); const map: receipts.DeferredReadReceipts = new Map(); const refused: string[] = [];
    const entries = ['r1', 'r2', 'r3'].map(id => {
      receipts.deferReadReceipt(receipts.readReceiptContext(map, id), r);
      return { ...entry(r.result), tool_use_id: id };
    });
    let writes = 0;
    const committed = await receipts.settleReadReceipts(entries, entries, map, async () => {
      writes++; if (writes === 2) throw new SourceReadSnapshotError();
    }, { onSourceRefused: id => { refused.push(id); } });
    expect(committed).toBe(1); expect(writes).toBe(2); expect(refused).toEqual(['r2']); expect(map.size).toBe(0);
  });
  it('ordinary SQL42501 in a three-read round does not stop later authorized receipt attempts', async () => {
    const r = candidate(); const map: receipts.DeferredReadReceipts = new Map(); const refused: string[] = [];
    const entries = ['r1', 'r2', 'r3'].map(id => {
      receipts.deferReadReceipt(receipts.readReceiptContext(map, id), r);
      return { ...entry(r.result), tool_use_id: id };
    });
    let writes = 0;
    const committed = await receipts.settleReadReceipts(entries, entries, map, async () => {
      writes++; if (writes === 2) throw Object.assign(new Error('receipt INSERT denied'), { code: '42501' });
    }, { onSourceRefused: id => { refused.push(id); } });
    expect(committed).toBe(2); expect(writes).toBe(3); expect(refused).toEqual([]); expect(map.size).toBe(0);
  });
  it('canonical withdrawal after observed source refusal does not invent a receipt rollback outcome', () => {
    const r = candidate(); const entries = [entry(r.result)];
    receipts.withdrawSourceReadResult(entries, 'r1');
    const body = JSON.parse(entries[0].content);
    expect(body).toMatchObject({ sourceContext: 'not_admitted', legacyReceiptOutcome: 'unconfirmed' });
    expect(body).not.toHaveProperty('receiptRecorded');
    expect(entries[0].content).not.toContain(TEXT); expect(entries[0].content).not.toContain(DOC);
  });
  it('an ordinary failed conditional persistence result does not become a source-access refusal', async () => {
    const r = candidate(); const map = deferred(r); const refused: string[] = []; h.insertMode = 'zero';
    expect(await receipts.settleReadReceipts([entry(r.result)], [entry(r.result)], map, undefined,
      { onSourceRefused: id => { refused.push(id); } })).toBe(0);
    expect(refused).toEqual([]); expect(h.queries).toContain('ROLLBACK');
  });
});

describe('last controlled source-result handoff', () => {
  it('keeps an unchanged admitted read without writing or claiming provider service', async () => {
    const r = candidate(); const map = deferred(r);
    const guarded = await receipts.guardReadResultsForHandoff([entry(r.result)], [entry(r.result)], map);
    expect(guarded).toEqual([entry(r.result)]); expect(h.inserted).toEqual([]);
    expect(map.size).toBe(1); expect(h.releases).toBe(1);
    expect(h.queries).toContain('COMMIT'); expect(h.queries).not.toContain('ROLLBACK');
  });
  it.each(['source_changed', 'private_revoked'] as const)('replaces denied source context with no source-bearing metadata (%s)', async mode => {
    const r = candidate(); const map = deferred(r);
    if (mode === 'private_revoked') h.admitted = false; else h.current.extractedText = 'Arm B 21/30.';
    const guarded = await receipts.guardReadResultsForHandoff([entry(r.result)], [entry(r.result)], map);
    expect(guarded[0].content).not.toContain(TEXT); expect(guarded[0].content).not.toContain(DOC);
    expect(JSON.parse(guarded[0].content)).toMatchObject({ sourceContext: 'not_admitted', receiptRecorded: false });
    expect(map.size).toBe(0); expect(h.inserted).toEqual([]);
  });
  it('preserves an existing budget replacement and drops its receipt candidate without a source query', async () => {
    const r = candidate(); const map = deferred(r);
    const replaced = entry(notDeliveredResult(0));
    expect(await receipts.guardReadResultsForHandoff([entry(r.result)], [replaced], map)).toEqual([replaced]);
    expect(h.load).not.toHaveBeenCalled(); expect(map.size).toBe(0);
  });
  it('does not accept a post-deferral amended payload', async () => {
    const r = candidate(); const map = deferred(r); const amended = entry(r.result + ' amended');
    const guarded = await receipts.guardReadResultsForHandoff([entry(r.result)], [amended], map);
    expect(guarded[0].content).not.toContain(TEXT);
    expect(JSON.parse(guarded[0].content)).toMatchObject({ sourceContext: 'not_admitted' });
    expect(map.size).toBe(0); expect(h.load).not.toHaveBeenCalled();
  });
  it('withholds a pending source read when cancellation occurs during verification', async () => {
    const r = candidate(); const map = deferred(r); const controller = new AbortController();
    const guarded = await receipts.guardReadResultsForHandoff([entry(r.result)], [entry(r.result)], map,
      { signal: controller.signal, verify: async () => { controller.abort(); } });
    expect(JSON.parse(guarded[0].content)).toMatchObject({ cancelled: true, receiptRecorded: false });
    expect(map.size).toBe(0); expect(h.inserted).toEqual([]);
  });
  it('late cancellation also withdraws earlier amended/budget-safe source results', async () => {
    const r = candidate(); const map = deferred(r); const controller = new AbortController();
    receipts.deferReadReceipt(receipts.readReceiptContext(map, 'r2'), r);
    const second = { ...entry(r.result), tool_use_id: 'r2' };
    const guarded = await receipts.guardReadResultsForHandoff([entry(r.result), second],
      [entry(r.result + ' amended'), second], map,
      { signal: controller.signal, verify: async () => { controller.abort(); } });
    expect(guarded.map(e => JSON.parse(e.content).cancelled)).toEqual([true, true]);
    expect(guarded.some(e => e.content.includes(TEXT))).toBe(false);
    expect(map.size).toBe(0);
  });
  it('rejects mutation through the publicly visible deferred map value', () => {
    const map = deferred();
    expect(() => { map.get('r1')!.sourceSnapshot.span.end = 1; }).toThrow();
    expect(() => { map.get('r1')!.result = '{"ok":false}'; }).toThrow();
    expect(map.get('r1')!.sourceSnapshot.span.end).toBe(TEXT.length);
  });
});
