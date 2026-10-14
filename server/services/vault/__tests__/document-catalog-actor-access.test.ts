import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), rows: [] as any[] }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../document-catalog-governance.service.js', () => ({ catalogStateOf: () => null, writeCatalogSuggestion: vi.fn() }));
import { loadDocumentForOrg, listProjectDocuments } from '../document-catalog.service.js';
const program = '10000000-0000-4000-8000-000000000001';
const doc = '20000000-0000-4000-8000-000000000002';
beforeEach(() => { vi.clearAllMocks(); h.rows = []; h.query.mockImplementation(async () => ({ rows: h.rows })); });
describe('server-only catalog actor query filters', () => {
  it('bounds a full-text selected source to authorized programs in SQL', async () => {
    await loadDocumentForOrg(doc, 42, { includeText: true, allowedProgramIds: [program] } as any);
    expect(h.query.mock.calls[0][0]).toContain('d.program_id = ANY(');
    expect(h.query.mock.calls[0][1]).toContainEqual([program]);
  });
  it('an empty authorized program list cannot widen to all tenant sources', async () => {
    await loadDocumentForOrg(doc, 42, { includeText: true, allowedProgramIds: [] } as any);
    expect(h.query.mock.calls[0][0]).toContain('d.program_id = ANY(');
    expect(h.query.mock.calls[0][1]).toContainEqual([]);
  });
  it('applies permitted programs before window totals and LIMIT', async () => {
    await listProjectDocuments(42, { limit: 1, allowedProgramIds: [program], currentOnly: true } as any);
    const [sql, args] = h.query.mock.calls[0];
    expect(sql).toContain('d.program_id = ANY(');
    expect(args).toContainEqual([program]);
    expect(sql.indexOf('d.program_id = ANY(')).toBeLessThan(sql.lastIndexOf('LIMIT $2'));
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM vault.documents succ');
  });
  it('runs source listing on the supplied protected executor, never the global pool', async () => {
    const q = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await listProjectDocuments(42, { executor: q, allowedProgramIds: [program] } as any);
    expect(q.query).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });
});
