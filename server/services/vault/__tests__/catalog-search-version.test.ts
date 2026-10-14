import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), scope: vi.fn(), factory: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: h.factory }));
vi.mock('../../c2c/current-program-access.js', async (original) => ({
  ...await original<typeof import('../../c2c/current-program-access.js')>(),
  getCurrentAccessibleProgramScope: h.scope,
}));
import { searchCatalog, CatalogSearchUnavailableError } from '../document-catalog-search';
import { supersededSql } from '../vault-version-family';
beforeEach(() => {
  vi.clearAllMocks();
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
  h.factory.mockReturnValue({ embed: h.embed });
  h.scope.mockImplementation(async (_db, input) => ({ scope: 'verified-accessible-programs',
    actor: { userId: input.userId, role: 'member' }, programIds: input.programId ? [input.programId] : ['10000000-0000-4000-8000-000000000001'], reconciliationRequired: false }));
  h.query.mockResolvedValueOnce({ rows: [{ searchable: '0', unsearchable: '1' }] });
  h.query.mockResolvedValueOnce({ rows: [] });
});
describe('semantic catalog source-version query contract', () => {
  it('binds both counts and hits to the current version and project tenant', async () => {
    const programId = '10000000-0000-4000-8000-000000000001';
    const db = { query: h.query };
    expect(await searchCatalog(db, 7, 'study endpoint', { userId: 3, programId })).toEqual({ hits: [], searchedCount: 0, unsearchableCount: 1 });
    expect(h.factory).toHaveBeenCalledWith(db);
    const [countSql, countArgs] = h.query.mock.calls[0];
    const [hitSql, hitArgs] = h.query.mock.calls[1];
    for (const sql of [countSql, hitSql]) {
      expect(sql).toContain('c.content_hash = d.content_hash');
      expect(sql).toContain('rp.organization_id = $1');
      expect(sql).toContain('d.deleted_at IS NULL');
      expect(sql).toContain(`AND NOT ${supersededSql('d')}`);
    }
    expect(countSql).toContain('LEFT JOIN vault.document_catalog');
    expect(countArgs).toEqual([7, [programId]]);
    expect(hitArgs).toEqual([7, '[1,2,3]', 0.15, 8, [programId]]);
  });

  it('keeps provider failure unavailable rather than an empty current corpus', async () => {
    h.embed.mockRejectedValueOnce(new Error('Embedding unavailable'));
    await expect(searchCatalog({ query: h.query }, 7, 'study endpoint', { userId: 3 })).rejects.toBeInstanceOf(CatalogSearchUnavailableError);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('does not turn a database failure into no current matches', async () => {
    h.query.mockReset().mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(searchCatalog({ query: h.query }, 7, 'study endpoint', { userId: 3 })).rejects.toThrow('Database unavailable');
    expect(h.query).toHaveBeenCalledTimes(1);
  });
});
