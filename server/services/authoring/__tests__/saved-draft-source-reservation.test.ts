import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queryable } from '../../vault/document-catalog.service';
const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForOrg: m.load }));
import { withSavedDraftSourceReservation } from '../draft-source-references';

const program = '20000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const doc = { client_program_id: program, provenance: { projectSourceReferences: [{ sectionCode: '12',
  qualification: 'unassessed', verification: 'current_at_save', sources: [{ documentId: sourceId,
    programId: program, contentHash: 'a'.repeat(64), span: { start: 0, end: 20, totalChars: 20 } }] }] } };
function harness() {
  const events: string[] = [];
  const q = { query: vi.fn(async (sql: string) => { events.push(sql); return { rows: [], rowCount: 0 }; }), release: vi.fn() };
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), connect: vi.fn(async () => q) };
  const work = vi.fn(async (executor: Queryable) => { events.push('receipt'); return executor; });
  return { events, q, pool, work };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.load.mockResolvedValue({ id: sourceId, programId: program, contentHash: 'a'.repeat(64), fileName: 'tlfs.pdf',
    extractedText: 'Exact study evidence', catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } });
});
describe('source reservations contain new rendition receipts', () => {
  it('reserves predecessor/successor writes before reading sources and keeps the receipt inside the same transaction', async () => {
    const h = harness();
    m.load.mockImplementation(async () => {
      h.events.push('source-read');
      return { id: sourceId, programId: program, contentHash: 'a'.repeat(64), fileName: 'tlfs.pdf',
        extractedText: 'Exact study evidence', catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } };
    });
    expect(await withSavedDraftSourceReservation(doc, h.pool, 7, h.work)).toBe(h.q);
    const tableLock = h.events.findIndex(sql => sql.startsWith('LOCK TABLE vault.documents, vault.document_catalog IN SHARE MODE'));
    expect(h.events[0]).toBe('BEGIN');
    expect(h.events.findIndex(sql => sql.includes('pg_advisory_xact_lock'))).toBeLessThan(tableLock);
    expect(tableLock).toBeLessThan(h.events.indexOf('source-read'));
    expect(h.events.indexOf('source-read')).toBeLessThan(h.events.indexOf('receipt'));
    expect(h.events.at(-1)).toBe('COMMIT');
    expect(m.load).toHaveBeenCalledWith(sourceId, 7, { includeText: true, executor: h.q, programId: program, currentOnly: true });
    expect(h.q.release).toHaveBeenCalledOnce();
  });
  it('a source made unavailable before reservation produces no rendition receipt', async () => {
    const h = harness(); m.load.mockResolvedValue(null);
    await expect(withSavedDraftSourceReservation(doc, h.pool, 7, h.work)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    expect(h.work).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toBe('ROLLBACK');
    expect(h.q.release).toHaveBeenCalledOnce();
  });
  it('refused source-store locking fails closed before work', async () => {
    const h = harness();
    h.q.query.mockImplementation(async sql => {
      h.events.push(sql);
      if (sql.startsWith('LOCK TABLE')) throw Object.assign(new Error('source check-in is in flight'), { code: '55P03' });
      return { rows: [], rowCount: 0 };
    });
    await expect(withSavedDraftSourceReservation(doc, h.pool, 7, h.work)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    expect(m.load).not.toHaveBeenCalled();
    expect(h.work).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toBe('ROLLBACK');
  });
  it('a failed renderer or receipt rolls back and preserves the failure', async () => {
    const h = harness(); h.work.mockRejectedValue(new Error('renderer failed'));
    await expect(withSavedDraftSourceReservation(doc, h.pool, 7, h.work)).rejects.toThrow('renderer failed');
    expect(h.events.at(-1)).toBe('ROLLBACK');
    expect(h.events).not.toContain('COMMIT');
    expect(h.q.release).toHaveBeenCalledOnce();
  });
  it('a legacy/manual rendition uses the existing path without claiming a source reservation', async () => {
    const h = harness();
    expect(await withSavedDraftSourceReservation({}, h.pool, 7, h.work)).toBe(h.pool);
    expect(h.pool.connect).not.toHaveBeenCalled();
    expect(m.load).not.toHaveBeenCalled();
  });
});
