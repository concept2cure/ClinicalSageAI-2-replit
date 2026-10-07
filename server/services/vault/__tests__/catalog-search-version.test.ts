import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
import { searchCatalog } from '../document-catalog-search';
beforeEach(() => {
  vi.clearAllMocks();
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
  h.query.mockResolvedValueOnce({ rows: [{ searchable: '0', unsearchable: '1' }] });
  h.query.mockResolvedValueOnce({ rows: [] });
});
describe('semantic catalog source-version query contract', () => {
  it('binds both counts and hits to the current version and project tenant', async () => {
    const programId = '10000000-0000-4000-8000-000000000001';
    expect(await searchCatalog(7, 'study endpoint', { programId })).toEqual({ hits: [], searchedCount: 0, unsearchableCount: 1 });
    const [countSql, countArgs] = h.query.mock.calls[0];
    const [hitSql, hitArgs] = h.query.mock.calls[1];
    for (const sql of [countSql, hitSql]) {
      expect(sql).toContain('c.content_hash = d.content_hash');
      expect(sql).toContain('rp.organization_id = $1');
      expect(sql).toContain('d.deleted_at IS NULL');
    }
    expect(countSql).toContain('LEFT JOIN vault.document_catalog');
    expect(countArgs).toEqual([7, programId]);
    expect(hitArgs).toEqual([7, '[1,2,3]', 0.15, 8, programId]);
  });
});
