import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), rows: [] as any[] }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../document-catalog-governance.service.js', () => ({ catalogStateOf: () => 'confirmed', writeCatalogSuggestion: vi.fn() }));
import { getCatalogBootstrapDigest, listProjectDocuments } from '../document-catalog.service.js';
const id = '20000000-0000-4000-8000-000000000002';
const program = '10000000-0000-4000-8000-000000000001';
const row = () => ({ id, organization_id: 42, program_organization_id: 42, program_deleted_at: null, program_id: program, program_name: 'Client program', file_name: 'assay.txt', document_title: 'Assay source', document_kind: 'cert', purpose: 'Measured source', catalog_status: 'cataloged', placement_status: 'suggested', scope_total: '340', scope_not_studied: '300', scope_extraction_failed: '2', scope_unfiled: '3', created_at: '2026-10-14T00:00:00Z' });
beforeEach(() => { vi.clearAllMocks(); h.rows = [row()]; h.query.mockImplementation(async () => ({ rows: h.rows })); });
describe('catalog discovery and recall recorded-source scope', () => {
  it.each([7, null, undefined])('refuses malformed document organization %s without producing headers or fabricated totals', async organizationId => {
    h.rows[0].organization_id = organizationId;
    await expect(listProjectDocuments(42)).rejects.toMatchObject({ code: 'CATALOG_SOURCE_SCOPE_INVALID' });
    await expect(getCatalogBootstrapDigest(42)).rejects.toMatchObject({ code: 'CATALOG_SOURCE_SCOPE_INVALID' });
  });
  it.each(['foreign_parent', 'deleted_parent', 'unidentified_parent'])('refuses a source with an invalid live program relationship: %s', async kind => {
    if (kind === 'foreign_parent') h.rows[0].program_organization_id = 7;
    if (kind === 'deleted_parent') h.rows[0].program_deleted_at = '2026-10-13T00:00:00Z';
    if (kind === 'unidentified_parent') delete h.rows[0].program_deleted_at;
    await expect(listProjectDocuments(42)).rejects.toMatchObject({ code: 'CATALOG_SOURCE_SCOPE_INVALID' });
    await expect(getCatalogBootstrapDigest(42)).rejects.toMatchObject({ code: 'CATALOG_SOURCE_SCOPE_INVALID' });
  });
  it('scopes recorded source and live parent before computing window totals', async () => {
    const page = await listProjectDocuments(42, { limit: 1, programId: program });
    expect(page).toMatchObject({ total: 340, withheld: 339, notYetStudied: 300, extractionFailed: 2, unfiled: 3 });
    expect(page.documents[0]).toMatchObject({ fileName: 'assay.txt', catalogState: 'confirmed', checkScope: { context: 'not_recorded' } });
    expect(h.query.mock.calls[0][0]).toContain('d.organization_id = $1');
    expect(h.query.mock.calls[0][0]).toContain('rp.deleted_at IS NULL');
    expect(h.query.mock.calls[0][1]).toEqual([42, 1, program]);
    expect(await getCatalogBootstrapDigest(42, 1)).toMatchObject({ total: 340, withheld: 339, files: [expect.objectContaining({ fileName: 'assay.txt', catalogState: 'confirmed', checkScope: expect.objectContaining({ context: 'not_recorded' }) })] });
  });
  it('a verified empty query remains empty, while query failure remains visible', async () => {
    h.rows = [];
    expect(await getCatalogBootstrapDigest(42)).toMatchObject({ total: 0, files: [], withheld: 0 });
    h.query.mockRejectedValue(new Error('Catalog discovery unavailable'));
    await expect(listProjectDocuments(42)).rejects.toThrow('Catalog discovery unavailable');
    await expect(getCatalogBootstrapDigest(42)).rejects.toThrow('Catalog discovery unavailable');
  });
});
