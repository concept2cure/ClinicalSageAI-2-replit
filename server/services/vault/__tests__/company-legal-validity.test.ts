import { describe, expect, it, vi } from 'vitest';
import { companyLegalVaultTargetRefusal, vaultVersionNotTransmittable } from '../vault-lifecycle';

const hash = 'a'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111';
const record = { active: true, vaultDocumentId: id, contentHash: hash, effectiveOn: null, expiresOn: '2000-01-01' };
function source(records: unknown, overrides = {}) {
  return { query: vi.fn().mockResolvedValue({ rows: [{ current: true, stage: 'approved', content_hash: hash,
    company_legal_documents: records, ...overrides }] }) };
}
describe('the canonical Vault transmit gate enforces company legal validity', () => {
  it('refuses an expired registered version even though its signature remains approved', async () => {
    const q = source([record]);
    expect(await vaultVersionNotTransmittable(q, 1, id, hash)).toMatch(/expired/);
    expect(q.query).toHaveBeenCalledTimes(1);
    expect(q.query.mock.calls[0][0]).toContain('companyDocuments,legalDocuments');
  });
  it('retains approval and current-version gates independently of company settings', async () => {
    expect(await vaultVersionNotTransmittable(source([], { current: false }), 1, id, hash)).toMatch(/superseded/);
    expect(await vaultVersionNotTransmittable(source([], { stage: 'draft' }), 1, id, hash)).toMatch(/not approved/);
    expect(await vaultVersionNotTransmittable(source([], { content_hash: 'b'.repeat(64) }), 1, id, hash)).toMatch(/different content/);
  });
  it('does not break ordinary approved Vault documents without a company policy', async () => {
    expect(await vaultVersionNotTransmittable(source(null), 1, id, hash)).toBeNull();
  });
  it('does not silently ignore malformed company validity records', async () => {
    expect(await vaultVersionNotTransmittable(source({ forged: true }), 1, id, hash)).toMatch(/could not be verified/);
  });
  it('refuses an approved current PDF outside the actual submission market', async () => {
    const registered = { ...record, expiresOn: null, programId: 'program-one', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'] };
    const target = { programId: 'program-one', agency: 'EMA', country: 'EU', submissionType: 'ind' };
    expect(await vaultVersionNotTransmittable(source([registered]), 1, id, hash, target)).toMatch(/agency/);
    expect(await vaultVersionNotTransmittable(source([registered]), 1, id, hash, { ...target, agency: 'FDA', country: 'US' })).toBeNull();
  });
  it('checks target applicability at draft placement without treating placement as approval', async () => {
    const registered = { ...record, expiresOn: null, programId: 'program-one', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'] };
    const q = source([registered], { stage: 'draft' });
    const target = { programId: 'program-one', agency: 'FDA', country: 'US', submissionType: 'IND' };
    expect(await companyLegalVaultTargetRefusal(q, 1, id, target)).toBeNull();
    expect(await vaultVersionNotTransmittable(q, 1, id, hash, target)).toMatch(/not approved/);
    expect(q.query.mock.calls[0][1]).toEqual([1]);
  });
});
