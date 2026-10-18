/** The legal acceptance and its real sealed audit row commit together, or neither exists. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ pg: null as PGlite | null, detachedAudit: vi.fn(), release: vi.fn(), statements: [] as string[], loseCommitResponse: false }));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, args?: unknown[]) => {
    h.statements.push(sql);
    if (!h.pg) return { rows: [] };
    if (!args && sql.includes(';')) return (await h.pg.exec(sql)).at(-1) ?? { rows: [] };
    const result = await h.pg.query(sql, args);
    if (sql === 'COMMIT' && h.loseCommitResponse) throw new Error('Synthetic lost commit response');
    return result;
  };
  return { pool: { query, connect: async () => ({ query, release: h.release }) } };
});
vi.mock('../../auditService.js', async original => ({
  ...(await original<typeof import('../../auditService')>()),
  default: { logAction: h.detachedAudit },
}));
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { verifyAuditChain, verifyAuditChainSeals, type PoolClient } from '../../audit/chain';
import { buildAcceptanceHash, hashAgreementContent, getOutstandingAgreements, recordAcceptance } from '../eula-service';
import licensingRoutes from '../../../routes/licensing';
const agreementId = '10000000-0000-4000-8000-000000000001';
const organizationAgreementId = '10000000-0000-4000-8000-000000000002';

beforeAll(async () => {
  vi.stubEnv('AUDIT_HMAC_KEY', 'synthetic-eula-audit-key-only-for-local-tests');
  h.pg = new PGlite();
  await h.pg.exec(await readFile('db/migrations/20260621_intelligent_licensing_eula.sql', 'utf8'));
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(await readFile('migrations/20260921_audit_logs_chain_seq.sql', 'utf8'));
  await h.pg.query("INSERT INTO license_agreements(id,agreement_key,version,title,body,scope) VALUES($1,'local-test-terms','1','Synthetic local test terms','Synthetic terms used only by automated tests.','user')", [agreementId]);
  await h.pg.query("INSERT INTO license_agreements(id,agreement_key,version,title,body,scope) VALUES($1,'local-test-org-terms','1','Synthetic local organization terms','Synthetic terms used only by automated tests.','organization')", [organizationAgreementId]);
});
beforeEach(async () => {
  await h.pg!.exec(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS eula_audit_unavailable;
    ALTER TABLE license_acceptances DROP CONSTRAINT IF EXISTS eula_acceptance_unavailable;
    DELETE FROM license_acceptances; DELETE FROM audit_logs;`);
  h.loseCommitResponse = false; h.statements.length = 0; h.release.mockClear(); h.detachedAudit.mockReset();
  h.detachedAudit.mockResolvedValue({ persisted: false, chained: false, tamperProof: false });
});
afterAll(async () => { await h.pg?.close(); vi.unstubAllEnvs(); });

const accept = () => recordAcceptance({ agreementId, userId: 7, organizationId: 9, ipAddress: '127.0.0.1', userAgent: 'local-test-agent', method: 'clickwrap' });
describe('append-only acceptance with canonical enlisted audit', () => {
  it('writes the acceptance, actor, provenance and sealed tenant audit inside one transaction', async () => {
    const result = await accept();
    expect(result).toMatchObject({ agreementId, agreementKey: 'local-test-terms', agreementVersion: '1', userId: 7, organizationId: 9, method: 'clickwrap' });
    const rows = await h.pg!.query<{ accepted_at: Date; acceptance_hash: string; ip_address: string; user_agent: string }>('SELECT * FROM license_acceptances');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ ip_address: '127.0.0.1', user_agent: 'local-test-agent' });
    expect(rows.rows[0].acceptance_hash).toBe(buildAcceptanceHash({ userId: 7, organizationId: 9, agreementKey: 'local-test-terms', agreementVersion: '1', agreementContentHash: hashAgreementContent({ body: 'Synthetic terms used only by automated tests.', url: null })!, acceptedAt: new Date(rows.rows[0].accepted_at).toISOString() }));
    const audits = await h.pg!.query<{ chain_seq: string; new_values: { hash: string }; sha256_chain: string; hmac_seal: string }>('SELECT * FROM audit_logs');
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({ tenant_id: 9, user_id: 7, action: 'license_accepted', record_id: agreementId, new_values: { hash: rows.rows[0].acceptance_hash } });
    expect(Number(audits.rows[0].chain_seq)).toBeGreaterThan(0);
    expect(audits.rows[0].sha256_chain).toMatch(/^[a-f0-9]{64}$/);
    expect(audits.rows[0].hmac_seal).toMatch(/^[a-f0-9]{64}$/);
    expect((await verifyAuditChain(h.pg! as unknown as PoolClient, { tenantId: 9 })).ok).toBe(true);
    expect((await verifyAuditChainSeals(h.pg! as unknown as PoolClient, { tenantId: 9 })).valid).toBe(true);
    const begin = h.statements.indexOf('BEGIN'), commit = h.statements.indexOf('COMMIT');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(h.statements.findIndex(sql => /INSERT INTO license_acceptances/.test(sql))).toBeGreaterThan(begin);
    expect(h.statements.findIndex(sql => /INSERT INTO audit_logs/.test(sql))).toBeLessThan(commit);
    expect(h.detachedAudit).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalledOnce();
  });
  it('an unavailable audit store rolls back the legal acceptance; recovery then writes both', async () => {
    await h.pg!.exec('ALTER TABLE audit_logs ADD CONSTRAINT eula_audit_unavailable CHECK(false) NOT VALID');
    await expect(accept()).rejects.toThrow();
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(0);
    expect((await h.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
    expect(h.statements).toContain('ROLLBACK'); expect(h.statements).not.toContain('COMMIT');
    await h.pg!.exec('ALTER TABLE audit_logs DROP CONSTRAINT eula_audit_unavailable');
    await accept();
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(1);
    expect((await h.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(1);
  });
  it('a failed acceptance insert cannot leave an audit event claiming acceptance', async () => {
    await h.pg!.exec('ALTER TABLE license_acceptances ADD CONSTRAINT eula_acceptance_unavailable CHECK(false) NOT VALID');
    await expect(accept()).rejects.toThrow();
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(0);
    expect((await h.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
    expect(h.statements).toContain('ROLLBACK'); expect(h.release).toHaveBeenCalledOnce();
  });
  it('a nonexistent agreement leaves no acceptance or audit', async () => {
    await expect(recordAcceptance({ agreementId: '20000000-0000-4000-8000-000000000099', userId: 7, organizationId: 9 })).rejects.toThrow('not found');
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(0);
    expect((await h.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
  });
  it('a lost COMMIT response reports uncertainty while retaining the actual atomic acceptance and audit', async () => {
    h.loseCommitResponse = true;
    await expect(accept()).rejects.toMatchObject({ code: 'LICENSE_ACCEPTANCE_COMMIT_UNCONFIRMED', recoveryUrl: '/api/licensing/acceptances' });
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(1);
    expect((await h.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(1);
    expect(h.statements).not.toContain('ROLLBACK'); expect(h.release).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
  });
});

function app(authenticated = true) {
  const router = express(); router.use(express.json());
  // The application's global auth gate supplies this verified principal. This
  // isolated router test does not claim to exercise token verification or RLS.
  if (authenticated) router.use((req, _res, next) => { Object.assign(req, { userId: 7, user: { id: 7, role: 'member', organizationId: 9 }, tenantContext: { organizationId: 9 } }); next(); });
  router.use('/api/licensing', licensingRoutes); return router;
}
describe('actual acceptance HTTP consumer', () => {
  it('binds acceptance and audit to the authenticated actor/org, ignoring supplied foreign identity', async () => {
    const res = await request(app()).post(`/api/licensing/agreements/${agreementId}/accept`).send({ userId: 88, organizationId: 99, method: 'sso' });
    expect(res.status).toBe(201); expect(res.body.acceptance).toMatchObject({ userId: 7, organizationId: 9, method: 'clickwrap' });
    expect((await h.pg!.query('SELECT user_id,organization_id FROM license_acceptances')).rows).toEqual([{ user_id: 7, organization_id: 9 }]);
    expect((await h.pg!.query('SELECT user_id,tenant_id FROM audit_logs')).rows).toEqual([{ user_id: 7, tenant_id: 9 }]);
  });
  it('does not claim acceptance in HTTP when the enlisted audit fails', async () => {
    await h.pg!.exec('ALTER TABLE audit_logs ADD CONSTRAINT eula_audit_unavailable CHECK(false) NOT VALID');
    const res = await request(app()).post(`/api/licensing/agreements/${agreementId}/accept`).send({});
    expect(res.status).toBe(500); expect(res.body.accepted).toBeUndefined();
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain('eula_audit_unavailable');
  });
  it('refuses an unauthenticated acceptance before any persistence', async () => {
    const res = await request(app(false)).post(`/api/licensing/agreements/${agreementId}/accept`).send({ userId: 7 });
    expect(res.status).toBe(401); expect(h.statements).toHaveLength(0);
  });
  it('returns an explicit non-retry claim for an unconfirmed commit and exposes acceptance-history recovery', async () => {
    h.loseCommitResponse = true;
    const res = await request(app()).post(`/api/licensing/agreements/${agreementId}/accept`).send({});
    expect(res.status).toBe(503); expect(res.body).toMatchObject({ code: 'LICENSE_ACCEPTANCE_COMMIT_UNCONFIRMED', recoveryUrl: '/api/licensing/acceptances' });
    expect(res.body.error).toMatch(/Review.*before trying again/); expect(res.body.accepted).toBeUndefined();
    expect(res.body.error).not.toMatch(/rolled back|no change/i);
    const history = await request(app()).get('/api/licensing/acceptances');
    expect(history.status).toBe(200); expect(history.body.acceptances).toHaveLength(1);
  });
});

describe('existing user/organization agreement scope semantics', () => {
  it('one colleague cannot satisfy another user\'s individual agreement', async () => {
    await recordAcceptance({ agreementId, userId: 8, organizationId: 9 });
    expect((await getOutstandingAgreements(7, 9)).map(a => a.id)).toContain(agreementId);
    expect((await getOutstandingAgreements(8, 9)).map(a => a.id)).not.toContain(agreementId);
  });
  it('an organization acceptance applies to that organization and cannot follow its actor into another tenant', async () => {
    await recordAcceptance({ agreementId: organizationAgreementId, userId: 7, organizationId: 9 });
    expect((await getOutstandingAgreements(8, 9)).map(a => a.id)).not.toContain(organizationAgreementId);
    expect((await getOutstandingAgreements(7, 10)).map(a => a.id)).toContain(organizationAgreementId);
    expect((await getOutstandingAgreements(7, null)).map(a => a.id)).toContain(organizationAgreementId);
  });
  it('an individual acceptance follows only its actor across their organizations', async () => {
    await accept();
    expect((await getOutstandingAgreements(7, 10)).map(a => a.id)).not.toContain(agreementId);
    expect((await getOutstandingAgreements(8, 10)).map(a => a.id)).toContain(agreementId);
  });
});
