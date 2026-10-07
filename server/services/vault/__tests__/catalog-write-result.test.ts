import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), updated: 0 }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
import { completeCatalog } from '../document-catalog.service';
const id = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks(); h.updated = 0;
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT d.id')) return { rows: [{ id, program_id: id, content_hash: 'a'.repeat(64),
      catalog_content_hash: 'a'.repeat(64), catalog_status: 'extracted', char_count: 4,
      extracted_text: 'text', file_name: 'source.txt', original_file_available: true }], rowCount: 1 };
    if (sql.includes('SELECT char_start')) return { rows: [{ char_start: 0, char_end: 4 }], rowCount: 1 };
    if (sql.includes('UPDATE vault.document_catalog')) return { rows: [], rowCount: h.updated };
    throw new Error('Unexpected SQL in catalog test');
  });
});
describe('catalog completion persistence receipts', () => {
  it.each(['vector', 'fallback'])('refuses zero updated rows on the %s path', async mode => {
    if (mode === 'vector') h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
    else h.embed.mockRejectedValue(new Error('Embedding unavailable'));
    const outcome = await completeCatalog({ documentId: id, organizationId: 7, documentKind: 'CSR', purpose: 'Review', summary: 'Summary' });
    expect(outcome).toMatchObject({ ok: false, refusal: expect.stringContaining('changed before the write') });
    expect(h.query.mock.calls.filter(([sql]) => sql.includes('UPDATE vault.document_catalog'))).toHaveLength(1);
  });
  it.each(['vector', 'fallback'])('preserves a successful one-row %s completion', async mode => {
    h.updated = 1;
    if (mode === 'vector') h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
    else h.embed.mockRejectedValue(new Error('Embedding unavailable'));
    expect(await completeCatalog({ documentId: id, organizationId: 7, documentKind: 'CSR', purpose: 'Review', summary: 'Summary' })).toMatchObject({ ok: true });
  });
});
