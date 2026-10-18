import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
const m = vi.hoisted(() => ({ access: vi.fn(), profile: vi.fn(), connection: vi.fn(), audit: vi.fn(), enumerate: vi.fn(), lease: vi.fn(), entitled: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../db/runtime', () => ({ getPool: () => ({ query: m.enumerate }) }));
vi.mock('../../../db/withTenantConnection', () => ({ withTenantConnection: m.connection }));
vi.mock('../../../db/scheduledOnce', () => ({ runScheduledOnce: m.lease }));
vi.mock('../../tenant/tenant-lifecycle', () => ({ filterTenantsForBackgroundWork: m.entitled }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: m.audit }));
vi.mock('../profile', () => ({ loadCompanyDocumentProfile: m.profile, context: vi.fn(), writeProfile: vi.fn(), readCompanyLegalDocument: vi.fn(), readCompanyDocumentProfile: vi.fn(),
  CompanyDocumentsError: class CompanyDocumentsError extends Error {} }));
vi.mock('../../c2c/current-program-access', () => ({ requireCurrentProgramAccess: m.access, readCurrentProgramActor: vi.fn(),
  ProgramReadAccessError: class ProgramReadAccessError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } } }));
vi.mock('../../vault/vault-lifecycle', () => ({ readVaultLifecycleSource: vi.fn(), vaultVersionNotTransmittable: vi.fn() }));
vi.mock('../../vault/vault-where-used', () => ({ readVaultPlacements: vi.fn() }));
vi.mock('../../submission-service/submission-request-read', () => ({ readSubmissionSequenceForRequest: vi.fn(), requireSubmissionReadStillCurrent: vi.fn() }));
import { syncCompanyLegalRenewal, notifyCompanyLegalRenewal } from '../legal-workflow';
import { processCompanyLegalRenewals, runCompanyLegalRenewalSweep } from '../../../jobs/companyLegalRenewalSweep';
import { ProgramReadAccessError } from '../../c2c/current-program-access';

let db: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => db.query<Record<string, unknown>>(sql, params) };
function document(overrides: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument {
  return { id: 'legal_a', title: 'Private sponsor authorization', kind: 'authorization', programId: 'program-a', vaultDocumentId: 'vault-a', contentHash: 'a'.repeat(64), version: '1',
    agencies: [], countries: [], submissionTypes: [], language: 'en', effectiveOn: null, expiresOn: '2026-10-25', active: true, registeredAt: '2026-01-01', registeredBy: '3',
    workflow: { custodianUserId: '8', reminderDays: [30, 7, 0], replacementId: null, revokedAt: null, revokedBy: null, revocationReason: null, authority: null, signatureEvidence: null,
      translationOfId: null, certifiedTranslationEvidence: null, updatedAt: '2026-10-01', updatedBy: '3' }, ...overrides };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations VALUES (7);
    CREATE TABLE c2c_project_work_items(id serial PRIMARY KEY,work_item_id text UNIQUE,org_id integer,project_id integer,source_type text,source_id integer,source_ref text,
      owner_id integer,title text,status text,priority text,due_at timestamptz,blocker_type text,updated_at timestamptz,resolved_at timestamptz,
      UNIQUE NULLS NOT DISTINCT(org_id,source_type,source_id,source_ref));
    CREATE TABLE mdx_notifications(id serial PRIMARY KEY,organization_id integer,recipient_user_id integer,recipient_role text,category text,severity text,title text,body text,
      resource_type text,resource_id text,action_url text,metadata jsonb,expires_at timestamptz);`);
});
beforeEach(async () => {
  await db.exec('TRUNCATE c2c_project_work_items,mdx_notifications RESTART IDENTITY');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
  Object.values(m).forEach(mock => mock.mockReset());
  m.access.mockResolvedValue({ projectId: 10, programId: 'program-a' });
  m.profile.mockResolvedValue({ revision: 4, legalDocuments: [document()] });
  m.audit.mockResolvedValue(undefined);
  m.lease.mockImplementation(async (_name, work) => ({ ran: true, value: await work() }));
  m.entitled.mockResolvedValue(new Set([7]));
  m.connection.mockImplementation(async (options, work) => { expect(options).toMatchObject({ tenantId: 7, source: 'job' }); expect(options.role).toBeUndefined(); return work(q); });
});
afterEach(() => vi.useRealTimers());
afterAll(async () => { await db.close(); });
async function counts() {
  return { tasks: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM c2c_project_work_items')).rows[0].count,
    notices: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM mdx_notifications')).rows[0].count };
}
describe('native company legal renewal projection and notices', () => {
  it('upserts one native task and one durable notice per exact expiry threshold', async () => {
    await q.query('BEGIN');
    await syncCompanyLegalRenewal(q, 7, 3, document());
    await notifyCompanyLegalRenewal(q, 7, document());
    await syncCompanyLegalRenewal(q, 7, 3, document());
    await notifyCompanyLegalRenewal(q, 7, document());
    await q.query('COMMIT');
    expect(await counts()).toEqual({ tasks: 1, notices: 1 });
    const rows = await db.query<{ due_at: Date; source_ref: string; owner_id: number; body: string }>('SELECT due_at,source_ref,owner_id FROM c2c_project_work_items');
    expect(new Date(rows.rows[0].due_at).toISOString()).toBe('2026-09-25T00:00:00.000Z');
    expect(rows.rows[0]).toMatchObject({ source_ref: 'legal_a', owner_id: 8 });
    const notice = (await db.query<{ body: string; resource_type: string }>('SELECT body,resource_type FROM mdx_notifications')).rows[0];
    expect(notice.body).not.toContain('Private sponsor authorization'); expect(notice.resource_type).toBe('regulatory_program');
    vi.setSystemTime(new Date('2026-10-25T12:00:00.000Z')); await notifyCompanyLegalRenewal(q, 7, document());
    vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z')); await notifyCompanyLegalRenewal(q, 7, document());
    expect(await counts()).toEqual({ tasks: 1, notices: 3 });
  });
  it('rolls back task and notice delivery when the scheduled audit cannot be written', async () => {
    m.audit.mockRejectedValue(new Error('Ledger unavailable'));
    await expect(processCompanyLegalRenewals(7)).rejects.toThrow('Ledger unavailable');
    expect(await counts()).toEqual({ tasks: 0, notices: 0 });
  });
  it('skips a withdrawn custodian and still processes another currently admitted document', async () => {
    m.profile.mockResolvedValue({ revision: 4, legalDocuments: [document(), document({ id: 'legal_b', vaultDocumentId: 'vault-b', workflow: { ...document().workflow!, custodianUserId: '9' } })] });
    m.access.mockImplementation(async (_q, input) => { if (input.userId === 8) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Removed'); return { projectId: 10 }; });
    expect(await processCompanyLegalRenewals(7)).toEqual({ projected: 1, notified: 1 });
    expect(await counts()).toEqual({ tasks: 1, notices: 1 });
    expect(m.audit).toHaveBeenCalledOnce();
  });
  it('resolves a revoked version’s renewal task and sends no further renewal notice', async () => {
    await syncCompanyLegalRenewal(q, 7, 3, document());
    const revoked = document({ workflow: { ...document().workflow!, revokedAt: '2026-10-18T12:00:00.000Z' } });
    await syncCompanyLegalRenewal(q, 7, 3, revoked);
    expect(await notifyCompanyLegalRenewal(q, 7, revoked)).toBeNull();
    expect((await db.query<{ status: string }>('SELECT status FROM c2c_project_work_items')).rows[0].status).toBe('resolved');
  });
  it('finds migrated registry tenants without a settings array and skips tenants not entitled to background work', async () => {
    m.enumerate.mockResolvedValueOnce({ rows: [{ id: 7 }, { id: 8 }] }).mockResolvedValueOnce({ rows: [] });
    const result = await runCompanyLegalRenewalSweep();
    expect(result).toMatchObject({ organizations: 1, skippedNotEntitled: 1, errors: 0, projected: 1, notified: 1 });
    expect(m.enumerate.mock.calls[0][0]).toContain('public.company_legal_registry');
    expect(m.enumerate.mock.calls[1][1]).toEqual([8]);
    expect(m.connection).toHaveBeenCalledOnce();
    await processCompanyLegalRenewals(7);
    expect(await counts()).toEqual({ tasks: 1, notices: 1 });
    expect(m.audit).toHaveBeenCalledOnce();
  });
});
