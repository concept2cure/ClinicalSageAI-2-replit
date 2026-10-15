import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), write: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../document-catalog-governance.service.js', () => ({ catalogStateOf: () => 'suggested', writeCatalogSuggestion: h.write }));
import { completeCatalog } from '../document-catalog.service.js';
const id = '20000000-0000-4000-8000-000000000002';
const text = 'Assay was 99.2% for batch B-104.';
beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockImplementation(async (sql: string) => sql.includes('SELECT d.id')
    ? { rows: [{ id, organization_id: 42, program_id: id, content_hash: 'a'.repeat(64), catalog_content_hash: 'a'.repeat(64), catalog_status: 'extracted', char_count: text.length, extracted_text: text, file_name: 'assay.txt', original_file_available: true }] }
    : { rows: [{ char_start: 0, char_end: text.length }] });
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
  h.write.mockResolvedValue({ ok: true, embeddingStatus: 'embedded' });
});
const args = () => ({ documentId: id, organizationId: 42, documentKind: 'cert', purpose: 'Release source', summary: 'Assay measured.', keyData: { assay: '99.2', lot: 'B-104' }, userId: 7, proposer: { actorKind: 'agent:ana' as const, model: 'served', threadId: 'thread', turnId: 'turn', audit: { reason: 'release', nested: { identity: 'server' } } } });
describe('catalog exact private suggestion snapshot', () => {
  it('pins exact extraction digest in the final writer handoff', async () => {
    expect(await completeCatalog(args())).toMatchObject({ ok: true });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ expectedExtractedTextSha256: createHash('sha256').update(text).digest('hex') }));
  });
  it('mutation during embedding cannot change checked fields or proposer', async () => {
    const input = args();
    h.embed.mockImplementation(async () => {
      input.keyData.assay = '88.4'; input.summary = 'Mutated'; input.proposer.model = 'body-swapped'; input.proposer.audit.nested.identity = 'changed';
      return { embedding: [1, 2, 3] };
    });
    expect(await completeCatalog(input)).toMatchObject({ ok: true });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Assay measured.', keyData: { assay: '99.2', lot: 'B-104' }, proposer: expect.objectContaining({ model: 'served', audit: expect.objectContaining({ nested: { identity: 'server' } }) }) }));
  });
  it('mutation while source load waits cannot redefine the submitted candidate', async () => {
    const input = args();
    const query = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string) => {
      input.keyData.assay = '88.4'; input.purpose = 'Mutated purpose';
      return query(sql);
    });
    expect(await completeCatalog(input)).toMatchObject({ ok: true });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'Release source', keyData: { assay: '99.2', lot: 'B-104' } }));
  });
  it('a locked-source refusal is returned without a successful catalog claim', async () => {
    h.write.mockResolvedValue({ ok: false, refusal: 'The exact extraction changed.', code: 'SOURCE_EXTRACTION_CHANGED' });
    expect(await completeCatalog(args())).toMatchObject({ ok: false, refusal: 'The exact extraction changed.' });
  });
  it('a locked value refusal preserves the exact unverified leaves', async () => {
    const unverifiedKeyData = [{ path: 'assay', value: '99.2', problem: 'not_in_text' }];
    h.write.mockResolvedValue({ ok: false, refusal: 'Locked text no longer states the proposed value.', unverifiedKeyData });
    expect(await completeCatalog(args())).toMatchObject({ ok: false, unverifiedKeyData });
  });
  it('a stale metadata undercount cannot make a partial actual-text read complete', async () => {
    const query = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT char_start')) return { rows: [{ char_start: 0, char_end: 5 }] };
      const result = await query(sql);
      if (sql.includes('SELECT d.id')) result.rows[0].char_count = 5;
      return result;
    });
    expect(await completeCatalog(args())).toMatchObject({ ok: false, coverage: { charCount: text.length, complete: false } });
    expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
});
