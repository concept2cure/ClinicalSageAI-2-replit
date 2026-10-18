/**
 * IND supplemental audit outcomes through the mounted API, genuine auth/ALS
 * and the deployed PostgreSQL schema. No table, policy, grant or trigger is
 * installed here. Business/audit fault controls are deliberately distinguished:
 * a business INSERT is rejected by FORCE RLS; an audit row is refused by its
 * real tenant boundary; an unexpected sink rejection is an explicit seam.
 * Every record is synthetic and is retained with its immutable audit history.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { getTenantScope } from '../../server/db/tenantStore';
import { requestPgClient } from '../../server/db/requestDb';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';

const ORG = 94960;
const FOREIGN_ORG = 94961;
const PREFIX = `synthetic-native-ind-audit-${randomUUID()}`;
const BASE = '/api/ind-lifecycle';
const TABLES = ['ind_safety_reports', 'ind_annual_reports', 'ind_amendments', 'ind_dispatch_snapshots'];
let owner: Pool;
let runtime: Pool;
let sharedPool: Pool;
let originalQuery: Pool['query'];
let app: express.Express;
let userId: number;
let submissionId: number;
let foreignSubmissionId: number;
let sequenceId: number;
let token: string;
let viewerToken: string;
let foreignToken: string;
let forgedToken: string;
let control: 'none' | 'audit-refusal' | 'audit-thrown' | 'business-refusal' = 'none';
let rejectedSqlCode: string | undefined;
let auditSpy: { mockRestore(): void } | undefined;
let nextSequence = 40;

const event = (suffix: string) => ({
  id: `${PREFIX}-${suffix}`, organizationId: 'untrusted-input-org', projectId: 'synthetic-ind-study',
  eventType: 'SAE', patientId: 'synthetic-subject', eventDescription: 'Synthetic reportable event for audit testing.',
  onsetDate: '2026-01-01T00:00:00Z', reportDate: '2026-01-01T00:00:00Z', seriousnessCriteria: 'life_threatening',
  causality: 'probable', outcome: 'not_recovered', reporterType: 'investigator', countryOfOccurrence: 'US',
  regulatoryReportingDeadline: '2026-01-01T00:00:00Z', reportedToAuthorities: false,
  expeditedReportRequired: true, expectedness: 'unexpected', createdAt: '2026-01-01T00:00:00Z',
});
const report = (suffix: string) => ({
  projectId: 'synthetic-ind-study', indNumber: 'SYNTHETIC-NOT-FDA', productName: `${PREFIX}-${suffix}`,
  reportingPeriodStart: '2026-01-01T00:00:00Z', reportingPeriodEnd: '2026-12-31T00:00:00Z',
  studyStatuses: [], safetyReportsInPeriod: [], ibChanges: [],
});
const amendment = (suffix: string) => ({
  organizationId: String(FOREIGN_ORG), projectId: 'synthetic-ind-study', indNumber: 'SYNTHETIC-NOT-FDA',
  changedDocuments: [{ documentId: `${PREFIX}-${suffix}`, title: `${PREFIX} amendment ${suffix}`,
    category: 'protocol_amendment_summary', changeKind: 'added' }],
});
const post = (path: string, body: unknown, bearer = token) =>
  request(app).post(`${BASE}${path}`).set('Authorization', `Bearer ${bearer}`).send(body);
const get = (path: string, bearer = token) =>
  request(app).get(`${BASE}${path}`).set('Authorization', `Bearer ${bearer}`);
const audits = async (id: string, action?: string) => (await owner.query(
  'SELECT tenant_id,actor_id,action,record_id,chain_seq,hmac_seal FROM audit_logs WHERE record_id=$1 AND ($2::text IS NULL OR action=$2)',
  [id, action ?? null],
)).rows;
const tamperProofAudits = async (id: string, action: string) => (await owner.query(
  'SELECT organization_id,user_id,action FROM audit.tamper_proof_log WHERE resource_id=$1 AND action=$2', [id, action],
)).rows;

function queryParts(args: unknown[]) {
  const first = args[0];
  const config = first && typeof first === 'object' && 'text' in first
    ? first as { text: string; values?: unknown[] } : undefined;
  return { text: typeof first === 'string' ? first : config?.text ?? '',
    values: Array.isArray(args[1]) ? args[1] as unknown[] : config?.values, config };
}
function businessTenantParameter(text: string): number {
  const insertion = /^\s*insert\s+into\s+(?:"?public"?\.)?"?(ind_safety_reports|ind_annual_reports|ind_amendments|ind_dispatch_snapshots)"?\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(text);
  if (!insertion) return -1;
  const columns = insertion[2].split(',').map(column => column.replaceAll('"', '').trim());
  const position = columns.indexOf('organization_id');
  const placeholder = insertion[3].split(',')[position]?.trim();
  return placeholder && /^\$\d+$/.test(placeholder) ? Number(placeholder.slice(1)) - 1 : -1;
}
async function account(kind: string, passwordHash: string): Promise<number> {
  return Number((await owner.query(`INSERT INTO users (email,name,status,password_hash)
    VALUES ($1,$2,'active',$3) ON CONFLICT(email) DO UPDATE SET status='active',mfa_enabled=false,mfa_secret=NULL,
      password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`,
  [`synthetic-native-ind-audit-${kind}@example.invalid`, `Synthetic IND ${kind}`, passwordHash])).rows[0].id);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required for the genuine non-bypass IND proof.');
  process.env.AUDIT_HMAC_KEY ??= 'synthetic-ind-audit-test-hmac-key-no-production-use';
  process.env.AUDIT_HMAC_SECRET ??= 'synthetic-ind-tamper-proof-key-no-production-use';
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,'Synthetic IND audit','synthetic-native-ind-audit','active'),
    ($2,'Synthetic foreign IND audit','synthetic-native-ind-audit-foreign','active') ON CONFLICT(id) DO NOTHING`, [ORG, FOREIGN_ORG]);
  const passwordHash = await bcrypt.hash('Synthetic-IND-audit-only!', 4);
  userId = await account('member', passwordHash);
  const viewerId = await account('viewer', passwordHash);
  const foreignId = await account('foreign', passwordHash);
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at) VALUES
    ($1,$2,'member',now()-interval '1 day'),($1,$3,'viewer',now()-interval '1 day'),($4,$5,'member',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,created_at=EXCLUDED.created_at`,
  [ORG, userId, viewerId, FOREIGN_ORG, foreignId]);
  const seedSubmission = async (organization: number, actor: number) => Number((await owner.query(`INSERT INTO submissions
    (title,application_type,client_type,primary_region,organization_id,created_by)
    VALUES ($1,'ind','biotech','fda',$2,$3) RETURNING id`, [PREFIX, organization, actor])).rows[0].id);
  submissionId = await seedSubmission(ORG, userId);
  foreignSubmissionId = await seedSubmission(FOREIGN_ORG, foreignId);
  sequenceId = Number((await owner.query(`INSERT INTO ectd_sequences (submission_id,region,sequence_number,type,organization_id,created_by)
    VALUES ($1,'fda','0000','annual',$2,$3) RETURNING id`, [submissionId, ORG, userId])).rows[0].id);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const bearer = (actor: number, organization: number) => jwt.sign({ type: 'access', userId: actor,
    organizationId: String(organization), role: 'admin' }, activeJwtSecret(), { expiresIn: '1h' });
  token = bearer(userId, ORG);
  viewerToken = bearer(viewerId, ORG);
  foreignToken = bearer(foreignId, FOREIGN_ORG);
  forgedToken = bearer(userId, FOREIGN_ORG);
  const { authenticateToken } = await import('../../server/middleware/auth');
  app = express();
  app.use(express.json());
  app.get('/native-ind-scope', authenticateToken, async (req, res) => {
    const connection = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_user_role',true) AS policy_role,current_setting('app.current_tenant_id',true) AS tenant_id,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`);
    res.json({ ...connection.rows[0], alsTenantId: getTenantScope()?.tenantId,
      lazyRequestClient: req.dbClient instanceof LazyRequestDbClient });
  });
  app.use(BASE, authenticateToken, (await import('../../server/routes/ind-lifecycle.routes')).default);
  const auditService = (await import('../../server/services/auditService')).default;
  const realAudit = auditService.logAction.bind(auditService);
  auditSpy = vi.spyOn(auditService, 'logAction').mockImplementation(async (...args) => {
    const entry = args[0];
    const ownedAction = typeof entry === 'object' && /^IND_(AMENDMENT|ANNUAL_REPORT|SAFETY_REPORT|DISPATCH_SNAPSHOT)_/.test(entry.action)
      && entry.organizationId === ORG;
    if (ownedAction && control === 'audit-thrown') throw new Error('Synthetic private IND audit rejection');
    if (ownedAction && control === 'audit-refusal') return realAudit({ ...entry, organizationId: FOREIGN_ORG });
    return Reflect.apply(realAudit, auditService, args);
  });
  sharedPool = (await import('../../server/db/runtime')).getPool();
  originalQuery = sharedPool.query;
  const delegate = originalQuery.bind(sharedPool);
  sharedPool.query = ((...args: unknown[]) => {
    const { text, values, config } = queryParts(args);
    const parameter = businessTenantParameter(text);
    const owned = values?.some(value => typeof value === 'string' && value.includes(PREFIX));
    if (control !== 'business-refusal' || !owned || parameter < 0 || values?.[parameter] !== ORG) {
      return Reflect.apply(delegate, sharedPool, args);
    }
    const replacement = [...values];
    replacement[parameter] = FOREIGN_ORG;
    const actualArgs = config && !Array.isArray(args[1])
      ? [{ ...config, values: replacement }, ...args.slice(1)] : [args[0], replacement, ...args.slice(2)];
    return (Reflect.apply(delegate, sharedPool, actualArgs) as Promise<unknown>).catch(error => {
      rejectedSqlCode = (error as { code?: string }).code;
      throw error;
    });
  }) as Pool['query'];
});
afterEach(() => { control = 'none'; });
afterAll(async () => {
  auditSpy?.mockRestore();
  if (sharedPool && originalQuery) sharedPool.query = originalQuery;
  await owner?.end();
  await runtime?.end();
  await sharedPool?.end();
});

describe('IND audit outcome native qualification', () => {
  it('uses genuine membership, ALS, LazyRequestDbClient, configured transport and FORCE RLS as app_service', async () => {
    const who = (await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(who).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false });
    const response = await request(app).get('/native-ind-scope').set('Authorization', `Bearer ${token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ role: 'app_service', policy_role: 'member', tenant_id: String(ORG),
      alsTenantId: String(ORG), lazyRequestClient: true, tls: shouldUseSsl(process.env.APP_DATABASE_URL) });
    const posture = (await owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])`, [TABLES])).rows;
    expect(posture).toHaveLength(4);
    expect(posture.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect((await runtime.query('SELECT id FROM ind_annual_reports WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });

});

describe('IND draft and filing audit outcomes', () => {
  const registers = [
    { name: 'safety', path: 'safety-reports', filePath: 'safety-report/file', table: 'ind_safety_reports', action: 'IND_SAFETY_REPORT',
      body: (suffix: string) => ({ event: event(suffix) }), fileBody: (suffix: string) => ({ event: event(suffix) }) },
    { name: 'annual', path: 'annual-reports', filePath: 'annual-report/file', table: 'ind_annual_reports', action: 'IND_ANNUAL_REPORT',
      body: (suffix: string) => ({ report: report(suffix) }), fileBody: (_suffix: string) => ({ acknowledgeGaps: true }) },
    { name: 'amendment', path: 'amendments', filePath: 'amendment/file', table: 'ind_amendments', action: 'IND_AMENDMENT',
      body: amendment, fileBody: amendment },
  ];
  for (const register of registers) {
    for (const outcome of ['none', 'audit-refusal', 'audit-thrown'] as const) {
      it(`${register.name} returns its real draft and filed record for ${outcome}, without a false 500`, async () => {
        control = outcome;
        const suffix = `${register.name}-${outcome}`;
        const drafted = await post(`/submission/${submissionId}/${register.path}`, {
          ...register.body(suffix), organizationId: FOREIGN_ORG, userId: -1,
        });
        expect(drafted.status, JSON.stringify(drafted.body)).toBe(201);
        const expected = outcome === 'none' ? { persisted: true, chained: true }
          : { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' };
        expect(drafted.body).toMatchObject({ organizationId: ORG, createdBy: userId, status: 'draft',
          auditTrail: expected, meta: { auditTrail: expected } });
        expect(JSON.stringify(drafted.body)).not.toMatch(/Synthetic private IND audit rejection|row-level security/);
        const stored = (await owner.query(`SELECT id,organization_id,status FROM ${register.table} WHERE id=$1`, [drafted.body.id])).rows;
        expect(stored).toMatchObject([{ id: drafted.body.id, organization_id: ORG, status: 'draft' }]);
        const draftedAudits = await audits(drafted.body.id, `${register.action}_DRAFTED`);
        expect(draftedAudits).toHaveLength(outcome === 'none' ? 1 : 0);
        expect(await tamperProofAudits(drafted.body.id, `${register.action}_DRAFTED`)).toHaveLength(outcome === 'none' ? 1 : 0);
        if (outcome === 'none') {
          expect(draftedAudits[0]).toMatchObject({ tenant_id: ORG, actor_id: userId });
          expect(draftedAudits[0].chain_seq).not.toBeNull();
          expect(draftedAudits[0].hmac_seal).toBeTruthy();
        }
        expect((await get(`/${register.path}/${drafted.body.id}`, foreignToken)).status).toBe(404);
        const filed = await post(`/${register.filePath}`, { ...register.fileBody(suffix), submissionId,
          sequenceNumber: String(nextSequence++).padStart(4, '0'), draftId: drafted.body.id });
        expect(filed.status, JSON.stringify(filed.body)).toBe(201);
        expect(filed.body).toMatchObject({ draft: { id: drafted.body.id, status: 'filed', auditTrail: expected },
          meta: { auditTrail: expected } });
        expect((await owner.query(`SELECT status,sequence_id FROM ${register.table} WHERE id=$1`, [drafted.body.id])).rows)
          .toMatchObject([{ status: 'filed', sequence_id: filed.body.sequence.id }]);
        expect(await audits(drafted.body.id, `${register.action}_FILED`)).toHaveLength(outcome === 'none' ? 1 : 0);
        expect(await tamperProofAudits(drafted.body.id, `${register.action}_FILED`)).toHaveLength(outcome === 'none' ? 1 : 0);
        const retry = await post(`/${register.filePath}`, { ...register.fileBody(suffix), submissionId,
          sequenceNumber: String(nextSequence++).padStart(4, '0'), draftId: drafted.body.id });
        expect(retry.status).toBe(409);
        expect(retry.body.error.code).toBe('ALREADY_FILED');
      });
    }
  }

});

describe('IND snapshots and admission', () => {
  for (const outcome of ['none', 'audit-refusal', 'audit-thrown'] as const) {
    it(`returns the saved blocked snapshot and root outcome for ${outcome}`, async () => {
      control = outcome;
      const response = await post(`/sequence/${sequenceId}/dispatch-gate/snapshot`, {});
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const expected = outcome === 'none' ? { persisted: true, chained: true }
        : { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' };
      expect(response.body).toMatchObject({ snapshot: { organizationId: ORG, sequenceId, canDispatch: false,
        auditTrail: expected }, meta: { auditTrail: expected } });
      expect((await owner.query('SELECT can_dispatch FROM ind_dispatch_snapshots WHERE id=$1', [response.body.snapshot.id])).rows)
        .toEqual([{ can_dispatch: false }]);
      expect(await audits(response.body.snapshot.id, 'IND_DISPATCH_SNAPSHOT_CREATED')).toHaveLength(outcome === 'none' ? 1 : 0);
      expect(await tamperProofAudits(response.body.snapshot.id, 'IND_DISPATCH_SNAPSHOT_CREATED')).toHaveLength(outcome === 'none' ? 1 : 0);
      const history = await get(`/sequence/${sequenceId}/snapshots`);
      expect(history.status).toBe(200);
      expect(history.body.some((row: { id: string }) => row.id === response.body.snapshot.id)).toBe(true);
      expect((await post(`/sequence/${sequenceId}/dispatch-gate/snapshot`, {}, foreignToken)).status).toBe(404);
    });
  }

  it('denies anonymous, viewer and forged membership before a register write', async () => {
    const path = `/submission/${submissionId}/annual-reports`;
    expect((await request(app).post(`${BASE}${path}`).send({ report: report('anonymous') })).status).toBe(401);
    expect((await post(path, { report: report('viewer') }, viewerToken)).status).toBe(403);
    expect([401, 403]).toContain((await post(path, { report: report('forged') }, forgedToken)).status);
    expect((await owner.query('SELECT id FROM ind_annual_reports WHERE product_name=ANY($1::text[])',
      [['anonymous', 'viewer', 'forged'].map(suffix => `${PREFIX}-${suffix}`)])).rows).toEqual([]);
    const foreign = await post(`/submission/${foreignSubmissionId}/annual-reports`, { report: report('foreign-own') }, foreignToken);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(201);
    expect((await get(`/annual-reports/${foreign.body.id}`)).status).toBe(404);
  });

  it('reports an actual PostgreSQL business refusal without an audit or a saved row, then recovers', async () => {
    control = 'business-refusal';
    const body = { report: report('business-refusal') };
    const auditCount = async () => Number((await owner.query(
      "SELECT count(*) FROM audit_logs WHERE tenant_id=$1 AND action='IND_ANNUAL_REPORT_DRAFTED'", [ORG],
    )).rows[0].count);
    const auditCountBefore = await auditCount();
    const failed = await post(`/submission/${submissionId}/annual-reports`, body);
    expect(rejectedSqlCode).toBe('42501');
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: { code: 'INTERNAL', message: 'Request failed.' } });
    expect((await owner.query('SELECT id FROM ind_annual_reports WHERE product_name=$1', [body.report.productName])).rows).toEqual([]);
    expect(await auditCount()).toBe(auditCountBefore);
    control = 'none';
    const recovered = await post(`/submission/${submissionId}/annual-reports`, body);
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(201);
    expect(recovered.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect((await owner.query('SELECT id FROM ind_annual_reports WHERE product_name=$1', [body.report.productName])).rows).toHaveLength(1);
    expect(await audits(recovered.body.id, 'IND_ANNUAL_REPORT_DRAFTED')).toHaveLength(1);
  });
});
