/** Sequential SQL orchestration/admission fixtures. These mocks do not prove
 * PostgreSQL concurrency, database privileges or deployed RLS. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantScope } from '../../../db/tenantStore';

const h = vi.hoisted(() => ({
  query: vi.fn(), audit: vi.fn(), project: vi.fn(),
  memberRole: 'member' as string | null, source: {} as Record<string, unknown>,
  record: {} as Record<string, unknown>, zero: false, vectorError: null as any,
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.query, connect: async () => ({ query: h.query, release: vi.fn() }) } }));
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow: h.audit }));
vi.mock('../../ana/project-scope-admission.js', () => ({
  admitAnaProjectScope: h.project,
  AnaProjectScopeError: class extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  },
}));
import { readCatalogRecord, reviewCatalogRecord, writeCatalogSuggestion } from '../document-catalog-governance.service';
import { AnaProjectScopeError } from '../../ana/project-scope-admission';

const DOC = '10000000-0000-4000-8000-000000000001';
const PROGRAM = '20000000-0000-4000-8000-000000000002';
const HASH = 'a'.repeat(64);
const TEXT = 'Assay A sensitivity: 95.0%.';
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const scope = <T>(fn: () => T, tenantId = '7', role = 'member') => runWithTenantScope({ tenantId, role, source: 'test' }, fn);
const suggestion = () => ({
  documentId: DOC, contentHash: HASH, expectedExtractedTextSha256: digest(TEXT),
  organizationId: 7, programId: PROGRAM, documentTitle: 'Assay report',
  documentKind: 'report', purpose: 'Source review', summary: 'Assay A sensitivity: 95.0%.',
  keyData: { sensitivity: '95.0%' }, embeddingStatus: 'failed' as const, embeddingLiteral: null as string | null,
  userId: 41, proposer: null,
});
const review = () => ({ programId: PROGRAM, documentId: DOC, organizationId: 7, userId: 41,
  action: 'confirm' as const, expectedRevision: '2026-10-14 12:00:00+00',
  expectedContentHash: HASH, expectedExtractedTextSha256: digest(TEXT),
});

beforeEach(() => {
  vi.clearAllMocks(); h.memberRole = 'member'; h.zero = false; h.vectorError = null;
  h.source = { id: DOC, program_id: PROGRAM, organization_id: 7, document_title: 'Assay report',
    content_hash: HASH, extracted_text: TEXT, data_eligible: true, original_file_available: true,
    superseded: false, deleted_at: null, program_deleted_at: null, catalog_content_hash: HASH,
    catalog_status: 'extracted', extraction_method: 'text', extraction_error: null };
  h.record = { catalog_state: 'suggested', document_kind: 'report', purpose: 'Source review',
    summary: 'Assay A sensitivity: 95.0%.', key_data: { sensitivity: '95.0%' }, confirmed_at: null,
    content_hash: HASH, revision: '2026-10-14 12:00:00+00' };
  h.project.mockResolvedValue({ projectId: 83, programId: PROGRAM, projectRef: PROGRAM });
  h.audit.mockResolvedValue(undefined);
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT ou.role')) return { rows: h.memberRole ? [{ role: h.memberRole }] : [], rowCount: h.memberRole ? 1 : 0 };
    if (sql.includes('SELECT d.')) return { rows: [{ ...h.source, ...(!sql.includes('FOR ') ? h.record : {}) }], rowCount: 1 };
    if (sql.includes('SELECT c.')) return { rows: [h.record], rowCount: 1 };
    if (sql.includes('UPDATE vault.document_catalog')) {
      if (sql.includes('embedding =') && h.vectorError) throw h.vectorError;
      return { rows: h.zero ? [] : [{ document_id: DOC, content_hash: HASH, revision: '2026-10-14 12:01:00+00' }], rowCount: h.zero ? 0 : 1 };
    }
    if (sql.includes('FROM regulatory_programs')) return { rows: [{ id: PROGRAM }], rowCount: 1 };
    if (sql.includes('FROM projects')) return { rows: [{ id: 83 }], rowCount: 1 };
    return { rows: [], rowCount: null };
  });
});

describe('catalog suggestion final-write admission', () => {
  it('refuses revoked private-project admission and uses the transaction client', async () => {
    h.project.mockRejectedValue(new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'Project access denied'));
    expect(await scope(() => writeCatalogSuggestion(suggestion()))).toMatchObject({ ok: false, refusal: 'Project access denied' });
    expect(h.project.mock.calls[0][0].query).toBe(h.query);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('preserves a private input snapshot while connection acquisition yields', async () => {
    const args = suggestion(); const pending = scope(() => writeCatalogSuggestion(args));
    args.keyData.sensitivity = '99.2%'; args.summary = 'Unrelated altered summary';
    expect(await pending).toMatchObject({ ok: true });
    const values = h.query.mock.calls.find(([sql]) => sql.includes('UPDATE vault.document_catalog'))?.[1];
    expect(values[2]).toBe('Assay A sensitivity: 95.0%.'); expect(JSON.parse(values[3])).toEqual({ sensitivity: '95.0%' });
  });
  it('refuses a stale session editor after the persisted membership becomes viewer', async () => {
    h.memberRole = 'viewer';
    expect(await scope(() => writeCatalogSuggestion(suggestion()))).toMatchObject({ ok: false });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([sql]) => sql.includes('UPDATE vault.document_catalog'))).toBe(false);
  });
  it.each(['missing actor', 'wrong tenant', 'inactive membership'])('refuses %s before catalog DML', async mode => {
    const args = suggestion(); if (mode === 'missing actor') args.userId = null as any;
    if (mode === 'inactive membership') h.memberRole = null;
    expect(await scope(() => writeCatalogSuggestion(args), mode === 'wrong tenant' ? '9' : '7')).toMatchObject({ ok: false });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it.each(['text', 'withdrawal', 'superseded', 'scope', 'hash'])('refuses changed %s at the locked source boundary', async mode => {
    if (mode === 'text') h.source.extracted_text = 'Assay B sensitivity: 95.0%.';
    if (mode === 'withdrawal') h.source.data_eligible = false;
    if (mode === 'superseded') h.source.superseded = true;
    if (mode === 'scope') h.source.organization_id = 8;
    if (mode === 'hash') h.source.content_hash = 'b'.repeat(64);
    expect(await scope(() => writeCatalogSuggestion(suggestion()))).toMatchObject({ ok: false });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses a key-data value not stated in the freshly locked text', async () => {
    const args = suggestion(); args.keyData.sensitivity = '99.2%';
    expect(await scope(() => writeCatalogSuggestion(args))).toMatchObject({ ok: false });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('refuses a program removed at canonical held ownership before catalog metadata or DML', async () => {
    const original = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string) => sql.includes('FROM regulatory_programs') && sql.includes('FOR SHARE')
      ? { rows: [], rowCount: 0 } : original(sql));
    expect(await scope(() => writeCatalogSuggestion(suggestion()))).toMatchObject({ ok: false, refusal: expect.stringContaining('No such document') });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([sql]) => sql.includes('SELECT c.') || sql.includes('UPDATE vault.document_catalog'))).toBe(false);
  });
  it('does not replace a human-confirmed record', async () => {
    h.record.catalog_state = 'confirmed'; h.record.confirmed_at = '2026-10-13';
    expect(await scope(() => writeCatalogSuggestion(suggestion()))).toMatchObject({ ok: false, refusal: expect.stringContaining('person confirmed') });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('reserves catalog then documents before source admission and audits exact hashes', async () => {
    expect(await scope(() => writeCatalogSuggestion(suggestion()))).toMatchObject({ ok: true });
    const calls = h.query.mock.calls.map(([sql]) => sql as string);
    const catalog = calls.findIndex(sql => sql.includes('LOCK TABLE vault.document_catalog'));
    const documents = calls.findIndex(sql => sql.includes('LOCK TABLE vault.documents'));
    const loaded = calls.findIndex(sql => sql.includes('SELECT d.') && sql.includes('FOR '));
    const heldProgram = calls.findIndex(sql => sql.includes('FROM regulatory_programs') && sql.includes('FOR SHARE'));
    const heldProject = calls.findIndex(sql => sql.includes('FROM projects') && sql.includes('FOR UPDATE'));
    expect(heldProgram).toBeGreaterThan(documents); expect(heldProject).toBeGreaterThan(heldProgram);
    expect(h.query.mock.calls[heldProgram][1]).toEqual([PROGRAM, 7]);
    expect(catalog).toBeGreaterThan(-1); expect(documents).toBeGreaterThan(catalog); expect(loaded).toBeGreaterThan(documents);
    expect(h.audit.mock.calls[0][1].details).toMatchObject({ contentHash: HASH, extractedTextSha256: digest(TEXT),
      checkScope: { kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed' } });
  });
});

describe('catalog persistence receipts and vector fallback', () => {
  it.each(['vector', 'plain'])('refuses zero-row %s writes without successful audit', async mode => {
    h.zero = true; const args = suggestion(); if (mode === 'vector') args.embeddingLiteral = '[1,2,3]';
    expect(await scope(() => writeCatalogSuggestion(args))).toMatchObject({ ok: false });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.query.mock.calls.filter(([sql]) => sql.includes('UPDATE vault.document_catalog'))).toHaveLength(1);
  });
  it.each(['42501', '22P02'])('does not turn vector SQL %s into plain success', async code => {
    h.vectorError = Object.assign(new Error('Vector operation failed'), { code });
    const args = suggestion(); args.embeddingLiteral = '[1,2,3]';
    await expect(scope(() => writeCatalogSuggestion(args))).rejects.toThrow('Vector operation failed');
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.query.mock.calls.filter(([sql]) => sql.includes('UPDATE vault.document_catalog'))).toHaveLength(1);
  });
  it('permits only the missing vector type fallback and still obtains a row receipt', async () => {
    h.vectorError = Object.assign(new Error('type "vector" does not exist'), { code: '42704' });
    const args = suggestion(); args.embeddingLiteral = '[1,2,3]';
    expect(await scope(() => writeCatalogSuggestion(args))).toEqual({ ok: true, embeddingStatus: 'failed' });
    expect(h.audit).toHaveBeenCalledTimes(1);
  });
  it('rolls back and reports no completion if chained audit fails', async () => {
    h.audit.mockRejectedValue(new Error('Audit unavailable'));
    await expect(scope(() => writeCatalogSuggestion(suggestion()))).rejects.toThrow('Audit unavailable');
    expect(h.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(h.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });
});

describe('whole-record review and honest historical catalog view', () => {
  it('preserves legacy review semantics without inventing extraction or context acceptance', async () => {
    const args = review(); delete (args as Partial<typeof args>).expectedExtractedTextSha256;
    expect(await scope(() => reviewCatalogRecord(args))).toMatchObject({ ok: true, state: 'confirmed' });
    expect(h.audit.mock.calls[0][1].details).toMatchObject({ extractionBindingShown: false, reviewScope: 'whole_catalog_record',
      checkScope: { context: 'not_recorded', scientificQualification: 'unassessed' } });
  });
  it('returns no catalog data for a document with conflicting recorded tenant ownership', async () => {
    h.source.organization_id = 8;
    expect(await scope(() => readCatalogRecord({ programId: PROGRAM, documentId: DOC, organizationId: 7, userId: 41 }))).toBeNull();
    expect(h.query.mock.calls.find(([sql]) => sql.includes('SELECT d.organization_id'))?.[0]).toContain('d.organization_id = $3');
  });
  it('refuses changed extraction even when header revision and original bytes match', async () => {
    h.source.extracted_text = 'Assay A sensitivity: 99.2%.';
    expect(await scope(() => reviewCatalogRecord(review()))).toMatchObject({ ok: false, code: 'EXTRACTION_CHANGED' });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'withdrawn', 'zero rows'])('refuses review after %s and audits no decision', async mode => {
    if (mode === 'viewer') h.memberRole = 'viewer';
    if (mode === 'withdrawn') h.source.data_eligible = false;
    if (mode === 'zero rows') h.zero = true;
    expect(await scope(() => reviewCatalogRecord(review()))).toMatchObject({ ok: false });
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('preserves a historical human decision while disclosing withdrawn current use', async () => {
    h.record.catalog_state = 'confirmed'; h.record.confirmed_by = 41; h.record.confirmed_at = '2026-10-13';
    h.source.data_eligible = false;
    const record = await scope(() => readCatalogRecord({ programId: PROGRAM, documentId: DOC, organizationId: 7, userId: 41 } as any));
    expect(record).toMatchObject({ state: 'confirmed', canWrite: false, checkScope: { kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed' },
      currentUse: { eligible: false, reasonCode: 'SOURCE_DATA_WITHDRAWN' } });
  });
});
