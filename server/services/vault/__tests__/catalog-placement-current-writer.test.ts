import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { runWithTenantScope } from '../../../db/tenantStore';
const h = vi.hoisted(() => ({ query: vi.fn(), require: vi.fn(), project: vi.fn(), memberRole: 'viewer', audit: vi.fn(), release: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query, connect: async () => ({ query: h.query, release: h.release }) } }));
vi.mock('../../c2c/current-program-access', async importOriginal => ({
  ...await importOriginal<typeof import('../../c2c/current-program-access')>(), requireCurrentProgramAccess: h.require,
}));
vi.mock('../../ana/project-scope-admission.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../ana/project-scope-admission.js')>(), admitAnaProjectScope: h.project,
}));
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow: h.audit }));
import { AnaProjectScopeError } from '../../ana/project-scope-admission';
import { writeCatalogSuggestion, reviewCatalogRecord } from '../document-catalog-governance.service';
import { placeVaultDocument } from '../vault-placement.service';
const ID = 'a399e467-8844-4ccf-be50-8982e2b9afc9';
const PROGRAM = '3e33fcb8-c7e0-40c5-a456-cf3cbf94237f';
const who = { documentId: ID, programId: PROGRAM, organizationId: 12, userId: 48 };
const TEXT = 'Stored study extraction.';
const suggestion = { ...who, expectedExtractedTextSha256: createHash('sha256').update(TEXT).digest('hex'), contentHash: 'a'.repeat(64), documentTitle: 'Study', documentKind: 'csr', purpose: 'Review', summary: 'Summary', keyData: null, embeddingStatus: 'failed' as const, embeddingLiteral: null, proposer: null };
const inTenant = <T>(fn: () => T) => runWithTenantScope({ tenantId: '12', source: 'test' }, fn);
beforeEach(() => {
  vi.clearAllMocks();
  h.memberRole = 'viewer';
  h.project.mockResolvedValue({ projectId: 91, programId: PROGRAM });
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT ou.role')) return { rows: [{ role: h.memberRole }], rowCount: 1 };
    if (sql.includes('SELECT d.')) return { rows: [{ id: ID, program_id: PROGRAM, organization_id: 12,
      document_title: 'Study', content_hash: 'a'.repeat(64), extracted_text: TEXT, data_eligible: true,
      original_file_available: true, superseded: false, deleted_at: null, program_deleted_at: null,
      catalog_content_hash: 'a'.repeat(64), catalog_status: 'extracted', extraction_method: 'text', extraction_error: null }], rowCount: 1 };
    if (sql.includes('SELECT c.')) return { rows: [{ catalog_state: null, document_kind: null, purpose: null, confirmed_at: null }], rowCount: 1 };
    if (sql.includes('UPDATE vault.document_catalog')) return { rows: [{ document_id: ID, content_hash: 'a'.repeat(64), revision: '2026-10-14 12:00:00+00' }], rowCount: 1 };
    if (sql.includes('SELECT id FROM regulatory_programs')) return { rows: [{ id: PROGRAM }], rowCount: 1 };
    if (sql.includes('SELECT id FROM projects')) return { rows: [{ id: 91 }], rowCount: 1 };
    return { rows: [], rowCount: null };
  });
  h.require.mockResolvedValue({ actor: { userId: 48, role: 'viewer' }, programId: PROGRAM, projectId: 91 });
});
describe('catalogue and placement writers verify current actor on their transaction', () => {
  it('refuses a suggestion from a current viewer before catalogue metadata or a write', async () => {
    expect(await inTenant(() => writeCatalogSuggestion(suggestion))).toMatchObject({ ok: false });
    expect(h.query.mock.calls.some(([sql]) => sql.includes('SELECT ou.role') && sql.includes('FOR SHARE OF ou, u, o'))).toBe(true);
    expect(h.query.mock.calls.some(([sql]) => sql.includes('c.summary') || sql.includes('UPDATE vault.document_catalog'))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('returns a named permission refusal before suggestion metadata if the current parent is private', async () => {
    h.memberRole = 'member';
    h.project.mockRejectedValue(new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'Current project access does not permit this operation.'));
    expect(await inTenant(() => writeCatalogSuggestion(suggestion))).toMatchObject({ ok: false, refusal: expect.stringContaining('Current project access') });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('checks a review using the current writer identity, despite absent cached request role', async () => {
    expect(await inTenant(() => reviewCatalogRecord({ ...who, action: 'confirm', expectedRevision: '2026-10-14' }))).toMatchObject({ ok: false, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(h.query.mock.calls.some(([sql]) => sql.includes('SELECT ou.role') && sql.includes('FOR SHARE OF ou, u, o'))).toBe(true);
    expect(h.query.mock.calls.some(([sql]) => sql.includes('d.document_title'))).toBe(false);
  });
  it('checks placement using the current writer identity before reading private programme modality', async () => {
    expect(await placeVaultDocument({ ...who, folderId: null })).toMatchObject({ ok: false, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(h.require).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), expect.objectContaining({ userId: 48, forShare: true }));
    expect(h.query.mock.calls.some(([sql]) => sql.includes('product_types') || sql.includes('document_title'))).toBe(false);
  });
  it('rolls back a suggestion when permission is revoked after its audited write', async () => {
    h.memberRole = 'member';
    h.project.mockResolvedValueOnce({ projectId: 91, programId: PROGRAM })
      .mockResolvedValueOnce({ projectId: 91, programId: PROGRAM })
      .mockRejectedValueOnce(new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'Access was revoked.'));
    expect(await inTenant(() => writeCatalogSuggestion(suggestion))).toMatchObject({ ok: false, refusal: 'Access was revoked.' });
    expect(h.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(h.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(h.audit).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh member suggestion without relying on a cached request role', async () => {
    h.memberRole = 'member';
    expect(await inTenant(() => writeCatalogSuggestion(suggestion))).toEqual({ ok: true, embeddingStatus: 'failed' });
    expect(h.project).toHaveBeenCalledTimes(4);
    expect(h.query.mock.calls.find(([sql]) => sql.includes('c.summary'))?.[0]).toContain('d.program_id = $3::uuid');
    expect(h.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

});
