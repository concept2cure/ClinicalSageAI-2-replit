/** Real receipt writers and private identities; synthetic client transport faults.
 * These controls qualify lifecycle decisions, not native PostgreSQL commit delivery. */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { runWithTenantScope } from '../../../db/tenantStore.js';
import { deferReadReceipt, readReceiptContext, type DeferredReadReceipt, type DeferredReadReceipts } from '../read-receipts.js';
import { verifyDeferredReadReceipt, writeGuardedLegacyReadReceipt, writeGuardedSourceAdmissionReceipt, type SourceReadReceiptDependencies } from '../source-read-receipt.js';
import type { CatalogDocumentRow } from '../../vault/document-catalog.service.js';
import { validateSourceAdmissionReceiptV2 } from '../../../../shared/ana/source-admission-receipts.js';
const DOC = '10000000-0000-4000-8000-000000000001';
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = 'Recorded synthetic source text.';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function receipt(): DeferredReadReceipt {
  const span = { start: 0, end: TEXT.length };
  const sourceSnapshot = { organizationId: 42, userId: 7, programId: PROGRAM, documentId: DOC, contentHash: 'a'.repeat(64),
    extractedTextSha256: hash(TEXT), totalChars: TEXT.length, span, threadId: 'server-thread' };
  const result = JSON.stringify({ ok: true, documentId: DOC, contentHash: sourceSnapshot.contentHash,
    extractedTextSha256: sourceSnapshot.extractedTextSha256, totalChars: TEXT.length, window: { ...span, text: TEXT } });
  const map: DeferredReadReceipts = new Map();
  expect(deferReadReceipt(readReceiptContext(map, 'server-tool'), { documentId: DOC, contentHash: sourceSnapshot.contentHash,
    span, readBy: 7, result, sourceSnapshot })).toBe(true);
  return map.get('server-tool')!;
}
function fixture(mode: 'healthy' | 'before_commit' | 'after_commit', insertFails = false, rollbackFails = false) {
  const queries: string[] = [];
  const state = { pending: false, durable: false, discarded: false };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (state.discarded) throw new Error('Physical client discarded');
    queries.push(sql);
    if (sql.includes('INSERT INTO vault.document_read_receipts')) {
      if (insertFails) throw new Error('Synthetic insert refusal');
      state.pending = true;
      return { rowCount: 1, rows: [{ id: 'legacy-row-41', document_id: values![0], content_hash: values![1],
        char_start: values![2], char_end: values![3], read_by: values![4], thread_id: values![5] }] };
    }
    if (sql === 'COMMIT') {
      if (mode === 'before_commit') throw new Error('Synthetic transport lost before server commit');
      state.durable = state.pending; state.pending = false;
      if (mode === 'after_commit') throw new Error('Synthetic commit reply lost');
    }
    if (sql === 'ROLLBACK') {
      if (rollbackFails) throw new Error('Synthetic rollback transport lost');
      state.pending = false;
    }
    return { rowCount: 0, rows: [] };
  });
  const release = vi.fn((error?: Error) => { if (error) { state.discarded = true; state.pending = false; } });
  const client = { query, release };
  const document: CatalogDocumentRow = { id: DOC, organizationId: 42, isCurrent: true, programId: PROGRAM,
    contentHash: 'a'.repeat(64), extractedText: TEXT, disposition: null, documentCode: null, documentTitle: 'Synthetic source',
    documentType: null, fileName: 'source.txt', mimeType: 'text/plain', folderId: null, evidenceKind: null, ctdSection: null,
    placementStatus: 'unfiled', catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'utf8',
      extractionConfidence: null, extractionError: null, charCount: TEXT.length, wordCount: null, pageCount: null,
      documentKind: null, purpose: null, summary: null, keyData: null, catalogedAt: null } };
  const dependencies: SourceReadReceiptDependencies = {
    connect: async () => client,
    admitScope: async () => ({ organizationId: 42, userId: 7, role: 'viewer', projectId: 3, programId: PROGRAM,
      accessibleProgramIds: [PROGRAM], actorFiltered: true }),
    holdActor: async () => ({ role: 'viewer', projectId: 3 }),
    loadDocument: async () => document,
    appendAdmission: async (_q, raw) => {
      const descriptor = validateSourceAdmissionReceiptV2(raw);
      state.pending = true; return { receiptId: descriptor.receiptId, outcome: 'recorded' };
    },
  };
  return { dependencies, queries, release, state };
}
const scoped = (work: () => Promise<unknown>) => runWithTenantScope({ tenantId: '42', role: 'member', source: 'request', caller: 'receipt-lifecycle-test' }, work);

describe('receipt transaction completion and physical connection ownership', () => {
  for (const kind of ['legacy', 'durable'] as const) {
    const write = kind === 'legacy' ? writeGuardedLegacyReadReceipt : writeGuardedSourceAdmissionReceipt;
    it.each(['before_commit', 'after_commit'] as const)(`${kind} keeps %s unconfirmed and discards the owned client`, async mode => {
      const f = fixture(mode); const r = receipt();
      const error = await scoped(() => write(r, f.dependencies)).then(() => null, failure => failure);
      expect(error).toMatchObject({ code: 'ANA_SOURCE_READ_COMMIT_UNCONFIRMED', outcome: 'unconfirmed',
        recovery: { organizationId: 42, actorId: 7, documentId: DOC } });
      if (kind === 'legacy') expect(error.recovery.legacyReceiptId).toBe('legacy-row-41');
      else expect(error.recovery.receiptId).toBe(r.admissionId);
      expect(JSON.stringify(error)).not.toContain(TEXT);
      expect(f.queries).toContain('COMMIT'); expect(f.queries).not.toContain('ROLLBACK');
      expect(f.release).toHaveBeenCalledExactlyOnceWith(error);
      expect(f.state).toMatchObject({ discarded: true, pending: false, durable: mode === 'after_commit' });
    });
    it(`${kind} returns a known success only after confirmed COMMIT`, async () => {
      const f = fixture('healthy'); const result = await scoped(() => write(receipt(), f.dependencies));
      if (kind === 'durable') expect(result).toMatchObject({ outcome: 'recorded' });
      expect(f.state).toEqual({ pending: false, durable: true, discarded: false });
      expect(f.queries).not.toContain('ROLLBACK'); expect(f.release).toHaveBeenCalledOnce(); expect(f.release.mock.calls[0][0]).toBeUndefined();
    });
    it(`${kind} rolls back a pre-commit write refusal`, async () => {
      const f = fixture('healthy', true);
      await expect(scoped(() => write(receipt(), f.dependencies))).rejects.toThrow('Synthetic insert refusal');
      expect(f.queries).toContain('ROLLBACK'); expect(f.queries).not.toContain('COMMIT');
      expect(f.state.durable).toBe(false); expect(f.release).toHaveBeenCalledOnce(); expect(f.release.mock.calls[0][0]).toBeUndefined();
    });
  }
  it('discards on failed rollback while preserving the original pre-commit refusal', async () => {
    const f = fixture('healthy', true, true);
    await expect(scoped(() => writeGuardedLegacyReadReceipt(receipt(), f.dependencies))).rejects.toThrow('Synthetic insert refusal');
    expect(f.release.mock.calls[0][0]).toBeInstanceOf(Error); expect(f.state.discarded).toBe(true);
  });
  it('read-only handoff verification also discards an uncertain completed transaction', async () => {
    const f = fixture('after_commit');
    await expect(scoped(() => verifyDeferredReadReceipt(receipt(), f.dependencies))).rejects.toMatchObject({ code: 'ANA_SOURCE_READ_COMMIT_UNCONFIRMED' });
    expect(f.queries).not.toContain('ROLLBACK'); expect(f.release.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
