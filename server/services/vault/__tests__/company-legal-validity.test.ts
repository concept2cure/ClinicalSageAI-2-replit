import { describe, expect, it, vi } from 'vitest';
import { companyLegalVaultTargetRefusal, vaultVersionNotTransmittable } from '../vault-lifecycle';

const hash = 'a'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111';
const record = { id: 'legal_original', title: 'Authorization', kind: 'authorization', programId: '22222222-2222-4222-8222-222222222222', active: true, vaultDocumentId: id, contentHash: hash, version: '1', agencies: [], countries: [], submissionTypes: [], language: 'en', registeredAt: '2026-01-01', registeredBy: '3', effectiveOn: null, expiresOn: '2000-01-01' };
function source(records: unknown, overrides = {}) {
  return { query: vi.fn().mockImplementation(async (sql: string, _params?: unknown[]) => ({ rows: /FROM audit_logs/.test(sql) ? [] : /SELECT id,document/.test(sql)
    ? (Array.isArray(records) ? records : []).map(document => ({ id: document.id, document }))
    : [{ current: true, stage: 'approved', content_hash: hash, company_legal_documents: records, ...overrides }] })) };
}
describe('the canonical Vault transmit gate enforces company legal validity', () => {
  it('refuses an expired registered version even though its signature remains approved', async () => {
    const q = source([record]);
    expect(await vaultVersionNotTransmittable(q, 1, id, hash)).toMatch(/expired/);
    expect(q.query).toHaveBeenCalledTimes(1);
    expect(q.query.mock.calls[0][0]).toContain('public.company_legal_registry');
  });
  it('retains approval and current-version gates independently of company settings', async () => {
    expect(await vaultVersionNotTransmittable(source([], { current: false }), 1, id, hash)).toMatch(/superseded/);
    expect(await vaultVersionNotTransmittable(source([], { stage: 'draft' }), 1, id, hash)).toMatch(/not approved/);
    expect(await vaultVersionNotTransmittable(source([], { content_hash: 'b'.repeat(64) }), 1, id, hash)).toMatch(/different content/);
  });
  it('does not break ordinary approved Vault documents without a company policy', async () => {
    expect(await vaultVersionNotTransmittable(source([]), 1, id, hash)).toBeNull();
  });
  it('does not silently ignore malformed company validity records', async () => {
    expect(await vaultVersionNotTransmittable(source({ forged: true }), 1, id, hash)).toMatch(/could not be verified/);
  });
  it('refuses an approved current PDF outside the actual submission market', async () => {
    const registered = { ...record, expiresOn: null, programId: record.programId, agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'] };
    const target = { programId: record.programId, agency: 'EMA', country: 'EU', submissionType: 'ind' };
    expect(await vaultVersionNotTransmittable(source([registered]), 1, id, hash, target)).toMatch(/agency/);
    expect(await vaultVersionNotTransmittable(source([registered]), 1, id, hash, { ...target, agency: 'FDA', country: 'US' })).toBeNull();
  });
  it('checks target applicability at draft placement without treating placement as approval', async () => {
    const registered = { ...record, expiresOn: null, programId: record.programId, agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'] };
    const q = source([registered], { stage: 'draft' });
    const target = { programId: record.programId, agency: 'FDA', country: 'US', submissionType: 'IND' };
    expect(await companyLegalVaultTargetRefusal(q, 1, id, target)).toBeNull();
    expect(await vaultVersionNotTransmittable(q, 1, id, hash, target)).toMatch(/not approved/);
    expect(q.query.mock.calls[0][1]).toEqual([1, id]);
  });
});
