import { describe, it, expect, vi } from 'vitest';
import { verifySavedDraftSourceReferences, withSavedDraftSourceReservation } from '../draft-source-references';
import type { Queryable } from '../../vault/document-catalog.service';

const program = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64);
const doc = (kind: 'vault' | 'data-room' = 'vault') => ({ client_program_id: program,
  provenance: { source: 'import', importSource: { kind, id: kind === 'vault' ? id : '12', sha256: hash, programId: program } } });
function harness(available = true, sourceHash = hash) {
  const events: string[] = [];
  const q = { query: vi.fn<Queryable['query']>(async (sql, args) => {
    events.push(sql);
    if (/FROM regulatory_programs/i.test(sql)) return { rows: [{ id: program }], rowCount: 1 };
    if (/FROM (vault.documents d|cre_evidence_sources s)/i.test(sql)) {
      expect(args).toEqual([sql.includes('vault.documents') ? id : '12', program, 7]);
      expect(sql).toContain('document_data_dispositions');
      expect(sql).not.toContain('original_file_available');
      return { rows: available ? [{ hash: sourceHash }] : [], rowCount: available ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }), release: vi.fn() };
  const pool = { query: q.query, connect: vi.fn(async () => q) };
  return { q, pool, events };
}

describe('exact imported origins remain dependencies of the authored document', () => {
  it.each(['vault', 'data-room'] as const)('verifies %s imports even with no model excerpt receipts', async kind => {
    const h = harness();
    await verifySavedDraftSourceReferences(doc(kind), h.q, 7);
    expect(h.events.some(sql => /FROM (vault.documents d|cre_evidence_sources s)/.test(sql))).toBe(true);
  });

  it.each([[false, hash], [true, 'b'.repeat(64)]])('refuses withdrawn or changed originals (%s)', async (available, sourceHash) => {
    const h = harness(Boolean(available), String(sourceHash));
    await expect(verifySavedDraftSourceReferences(doc(), h.q, 7)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
  });

  it('does not silently ignore malformed saved source identities', async () => {
    const h = harness();
    const malformed = doc(); malformed.provenance.importSource.programId = id;
    await expect(verifySavedDraftSourceReferences(malformed, h.q, 7)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    expect(h.q.query).not.toHaveBeenCalled();
  });

  it('holds exact source rows through the rendition receipt without a global table lock', async () => {
    const h = harness();
    await withSavedDraftSourceReservation(doc('data-room'), h.pool, 7, async q => { expect(q).toBe(h.q); h.events.push('receipt'); });
    expect(h.events[0]).toBe('BEGIN');
    expect(h.events.some(sql => sql.startsWith('LOCK TABLE'))).toBe(false);
    const read = h.events.findIndex(sql => sql.includes('FOR SHARE OF s'));
    expect(read).toBeGreaterThan(h.events.findIndex(sql => sql.includes('pg_advisory_xact_lock')));
    expect(read).toBeLessThan(h.events.indexOf('receipt'));
    expect(h.events.at(-1)).toBe('COMMIT');
  });

  it('an unavailable exact import source produces no rendition or receipt', async () => {
    const h = harness(false); const work = vi.fn();
    await expect(withSavedDraftSourceReservation(doc(), h.pool, 7, work)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    expect(work).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toBe('ROLLBACK');
  });
});
