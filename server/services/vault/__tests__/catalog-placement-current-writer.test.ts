import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), require: vi.fn(), audit: vi.fn(), release: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query, connect: async () => ({ query: h.query, release: h.release }) } }));
vi.mock('../../c2c/current-program-access', async importOriginal => ({
  ...await importOriginal<typeof import('../../c2c/current-program-access')>(), requireCurrentProgramAccess: h.require,
}));
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow: h.audit }));
import { ProgramReadAccessError } from '../../c2c/current-program-access';
import { writeCatalogSuggestion, reviewCatalogRecord } from '../document-catalog-governance.service';
import { placeVaultDocument } from '../vault-placement.service';
const ID = 'a399e467-8844-4ccf-be50-8982e2b9afc9';
const PROGRAM = '3e33fcb8-c7e0-40c5-a456-cf3cbf94237f';
const who = { documentId: ID, programId: PROGRAM, organizationId: 12, userId: 48 };
const suggestion = { ...who, contentHash: 'a'.repeat(64), documentTitle: 'Study', documentKind: 'csr', purpose: 'Review', summary: 'Summary', keyData: null, embeddingStatus: 'failed' as const, embeddingLiteral: null, proposer: null };
beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockResolvedValue({ rows: [{ catalog_state: null, document_kind: null, purpose: null, confirmed_at: null }], rowCount: 1 });
  h.require.mockResolvedValue({ actor: { userId: 48, role: 'viewer' }, programId: PROGRAM, projectId: 91 });
});
describe('catalogue and placement writers verify current actor on their transaction', () => {
  it('refuses a suggestion from a current viewer before catalogue metadata or a write', async () => {
    expect(await writeCatalogSuggestion(suggestion)).toMatchObject({ ok: false });
    expect(h.require).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), expect.objectContaining({ userId: 48, programId: PROGRAM, forShare: true }));
    expect(h.query.mock.calls.some(([sql]) => sql.includes('c.summary') || sql.includes('UPDATE vault.document_catalog'))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('returns a named permission refusal before suggestion metadata if the current parent is private', async () => {
    h.require.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Current project access does not permit this operation.'));
    expect(await writeCatalogSuggestion(suggestion)).toMatchObject({ ok: false, refusal: expect.stringContaining('Current project access') });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('checks a review using the current writer identity, despite absent cached request role', async () => {
    expect(await reviewCatalogRecord({ ...who, action: 'confirm', expectedRevision: '2026-10-14' })).toMatchObject({ ok: false, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(h.require).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), expect.objectContaining({ userId: 48, forShare: true }));
    expect(h.query.mock.calls.some(([sql]) => sql.includes('d.document_title'))).toBe(false);
  });
  it('checks placement using the current writer identity before reading private programme modality', async () => {
    expect(await placeVaultDocument({ ...who, folderId: null })).toMatchObject({ ok: false, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(h.require).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), expect.objectContaining({ userId: 48, forShare: true }));
    expect(h.query.mock.calls.some(([sql]) => sql.includes('product_types') || sql.includes('document_title'))).toBe(false);
  });
  it('rolls back a suggestion when permission is revoked after its audited write', async () => {
    h.require.mockResolvedValueOnce({ actor: { userId: 48, role: 'member' }, programId: PROGRAM })
      .mockRejectedValueOnce(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Access was revoked.'));
    expect(await writeCatalogSuggestion(suggestion)).toMatchObject({ ok: false, refusal: 'Access was revoked.' });
    expect(h.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(h.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(h.audit).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh member suggestion without relying on a cached request role', async () => {
    h.require.mockResolvedValue({ actor: { userId: 48, role: 'member' }, programId: PROGRAM });
    expect(await writeCatalogSuggestion(suggestion)).toEqual({ ok: true, embeddingStatus: 'failed' });
    expect(h.require).toHaveBeenCalledTimes(2);
    expect(h.query.mock.calls.find(([sql]) => sql.includes('c.summary'))?.[0]).toContain('d.program_id = $3::uuid');
    expect(h.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

});
