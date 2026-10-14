import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantScope } from '../../../db/tenantStore';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), updated: 0 }));
// The suggestion is written in a transaction with its audit row (S4); the audit
// writer is stubbed, the catalog statements reach the same mock.
vi.mock('../../../db.js', () => ({ pool: { query: h.query, connect: async () => ({ query: h.query, release: () => undefined }) } }));
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow: vi.fn(async () => undefined) }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../../ana/project-scope-admission.js', () => ({ admitAnaProjectScope: vi.fn(async () => ({ projectId: 83, programId: '10000000-0000-4000-8000-000000000001' })), AnaProjectScopeError: class extends Error {} }));
import { completeCatalog } from '../document-catalog.service';
const id = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks(); h.updated = 0;
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT d.id')) return { rows: [{ id, program_id: id, organization_id: 7, content_hash: 'a'.repeat(64),
      catalog_content_hash: 'a'.repeat(64), catalog_status: 'extracted', char_count: 4,
      extracted_text: 'text', file_name: 'source.txt', original_file_available: true, data_eligible: true, superseded: false }], rowCount: 1 };
    if (sql.includes('SELECT char_start')) return { rows: [{ char_start: 0, char_end: 4 }], rowCount: 1 };
    if (sql.includes('SELECT ou.role')) return { rows: [{ role: 'member' }], rowCount: 1 };
    if (sql.includes('SELECT id FROM regulatory_programs')) return { rows: [{ id }], rowCount: 1 };
    if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 83 }], rowCount: 1 };
    // The locked row: absent when the bytes changed since the read.
    if (sql.includes('SELECT c.') && sql.includes('FOR UPDATE')) return h.updated ? { rows: [{ state: null, confirmed_at: null }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (sql.includes('UPDATE vault.document_catalog')) return { rows: h.updated ? [{ document_id: id, content_hash: 'a'.repeat(64), revision: '2026-10-14 12:00:00+00' }] : [], rowCount: h.updated };
    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|LOCK|SET LOCAL|SELECT set_config|SELECT pg_advisory)/.test(sql.trim()) || sql.includes('FOR SHARE')) return { rows: [], rowCount: null };
    throw new Error('Unexpected SQL in catalog test');
  });
});
const complete = () => runWithTenantScope({ tenantId: '7', role: 'member', source: 'test' }, () => completeCatalog({ documentId: id, organizationId: 7, userId: 41, documentKind: 'csr', purpose: 'Review', summary: 'Summary' }));
describe('catalog completion persistence receipts', () => {
  it.each(['vector', 'fallback'])('refuses zero updated rows on the %s path', async mode => {
    if (mode === 'vector') h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
    else h.embed.mockRejectedValue(new Error('Embedding unavailable'));
    const outcome = await complete();
    expect(outcome).toMatchObject({ ok: false, refusal: expect.stringContaining('has a newer version than the one you read') });
    // Refused at the lock, before any UPDATE: nothing is written for other bytes.
    expect(h.query.mock.calls.filter(([sql]) => sql.includes('UPDATE vault.document_catalog'))).toHaveLength(0);
  });
  it.each(['vector', 'fallback'])('preserves a successful one-row %s completion', async mode => {
    h.updated = 1;
    if (mode === 'vector') h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
    else h.embed.mockRejectedValue(new Error('Embedding unavailable'));
    expect(await complete()).toMatchObject({ ok: true });
  });
});
describe('the kind is the Vault vocabulary (S4)', () => {
  it('refuses a kind outside it before reading anything', async () => {
    const outcome = await completeCatalog({ documentId: id, organizationId: 7, documentKind: 'CSR', purpose: 'Review', summary: 'Summary' });
    expect(outcome).toMatchObject({ ok: false, refusal: expect.stringContaining('is not an evidence kind the Vault records') });
    expect(h.query).not.toHaveBeenCalled();
  });
});
