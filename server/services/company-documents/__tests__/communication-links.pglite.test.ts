import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';

const mocks = vi.hoisted(() => ({ read: vi.fn(), access: vi.fn(), source: vi.fn(), audit: vi.fn(), actor: vi.fn() }));
vi.mock('../profile', async () => ({ CompanyDocumentsError: (await import('../validation')).CompanyDocumentsError, readCompanyLegalDocument: mocks.read }));
vi.mock('../../vault/vault-write-authority', () => ({ requireCurrentVaultProgramWrite: mocks.access }));
vi.mock('../../c2c/current-program-access', () => ({ readCurrentProgramActor: mocks.actor }));
vi.mock('../../vault/vault-lifecycle', () => ({ readVaultLifecycleSource: mocks.source }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: mocks.audit }));
import { appendCommunicationLegalLinks } from '../communication-links';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';
const document: CompanyLegalDocument = { id: 'legal-1', title: 'Delegated authority', kind: 'power_of_attorney', programId: PROGRAM, vaultDocumentId: SOURCE,
  version: '2', contentHash: 'a'.repeat(64), agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en', effectiveOn: null,
  expiresOn: null, active: true, registeredAt: '2026-10-18T00:00:00Z', registeredBy: '3' };
let pg: PGlite;
const q = { query: (sql: string, args?: unknown[]) => pg.query(sql, args) };
const req = (patch = {}) => ({ organizationId: 7, userId: 3, user: { id: 3, organizationId: 7 }, tenantContext: { organizationId: 7 }, dbClient: q,
  body: { registryIds: ['legal-1'], outcome: 'rejected', reason: 'Agency requested a revised power of attorney', ...patch } }) as unknown as Request;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE concept2cure_agency_communications(organization_id int,project_id int,event_id text,audit_metadata jsonb);
    CREATE TABLE concept2cure_submission_center_items(organization_id int,project_id int,item_id text,metadata jsonb);
    CREATE TABLE link_audits(details jsonb);
    CREATE TABLE original_approval(status text);`);
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  await pg.exec(`TRUNCATE concept2cure_agency_communications,concept2cure_submission_center_items,link_audits,original_approval;
    INSERT INTO concept2cure_agency_communications VALUES(7,42,'event-1','{"visibilityTier":"shared_client_c2c"}');
    INSERT INTO concept2cure_submission_center_items VALUES(7,42,'handoff-1','{"existingFact":"retained"}');
    INSERT INTO original_approval VALUES('approved');`);
  mocks.read.mockResolvedValue({ document }); mocks.access.mockResolvedValue({ projectId: 42 });
  mocks.actor.mockResolvedValue({ userId: 3, role: 'member' });
  mocks.source.mockResolvedValue({ id: SOURCE, programId: PROGRAM, version: '2', contentHash: 'a'.repeat(64) });
  mocks.audit.mockImplementation(async (client, entry) => client.query('INSERT INTO link_audits VALUES($1::jsonb)', [JSON.stringify(entry.details)]));
});

describe('immutable legal links on existing communication and handoff records', () => {
  it('retains an exact snapshot and an agency rejection without changing Vault approval', async () => {
    const result = await appendCommunicationLegalLinks(req(), 42, 'agency', 'event-1', tier => tier === 'shared_client_c2c');
    expect(result.companyLegalDocuments).toHaveLength(1);
    expect(result.companyLegalDocuments[0]).toMatchObject({ registryId: 'legal-1', vaultDocumentId: SOURCE, version: '2', contentHash: 'a'.repeat(64), linkedBy: 3, outcome: 'rejected' });
    const metadata = (await pg.query<{ audit_metadata: Record<string, unknown> }>('SELECT audit_metadata FROM concept2cure_agency_communications')).rows[0].audit_metadata;
    expect(metadata.visibilityTier).toBe('shared_client_c2c'); expect(metadata.companyLegalDocuments).toEqual(result.companyLegalDocuments);
    expect((await pg.query<{ status: string }>('SELECT status FROM original_approval')).rows[0].status).toBe('approved');
    expect((await pg.query('SELECT * FROM link_audits')).rows).toHaveLength(1);
    const duplicate = await appendCommunicationLegalLinks(req(), 42, 'agency', 'event-1');
    expect(duplicate.unchanged).toBe(true); expect(duplicate.companyLegalDocuments).toHaveLength(1);
    expect((await pg.query('SELECT * FROM link_audits')).rows).toHaveLength(1);
  });

  it('preserves handoff metadata and appends a later outcome without rewriting the original reference', async () => {
    const first = await appendCommunicationLegalLinks(req({ outcome: 'referenced' }), 42, 'handoff', 'handoff-1');
    const second = await appendCommunicationLegalLinks(req({ outcome: 'acknowledged' }), 42, 'handoff', 'handoff-1');
    expect(second.companyLegalDocuments).toHaveLength(2); expect(second.companyLegalDocuments[0]).toEqual(first.companyLegalDocuments[0]);
    const row = (await pg.query<{ metadata: Record<string, unknown> }>('SELECT metadata FROM concept2cure_submission_center_items')).rows[0];
    expect(row.metadata.existingFact).toBe('retained');
  });

  it.each(['source', 'project', 'visibility', 'audit'] as const)('writes nothing when %s verification fails', async mode => {
    if (mode === 'source') mocks.source.mockResolvedValue({ programId: PROGRAM, version: '3', contentHash: 'b'.repeat(64) });
    if (mode === 'project') mocks.access.mockResolvedValue({ projectId: 99 });
    if (mode === 'audit') mocks.audit.mockRejectedValue(new Error('Audit store refused'));
    await expect(appendCommunicationLegalLinks(req(), 42, 'agency', 'event-1', () => mode !== 'visibility')).rejects.toBeTruthy();
    const metadata = (await pg.query<{ audit_metadata: Record<string, unknown> }>('SELECT audit_metadata FROM concept2cure_agency_communications')).rows[0].audit_metadata;
    expect(metadata.companyLegalDocuments).toBeUndefined(); expect((await pg.query('SELECT * FROM link_audits')).rows).toHaveLength(0);
  });

  it('does not accept a client-provided hash, version or approval verdict', async () => {
    await expect(appendCommunicationLegalLinks(req({ contentHash: 'b'.repeat(64), approved: true }), 42, 'agency', 'event-1')).rejects.toMatchObject({ code: 'INVALID_COMPANY_DOCUMENTS' });
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
