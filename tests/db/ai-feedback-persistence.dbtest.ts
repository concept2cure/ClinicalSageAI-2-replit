/**
 * Feedback persistence through genuine authentication, async tenant scope and
 * the deployed runtime role. This test installs no schema, policy or grants.
 * Fault controls delegate to PostgreSQL: the deployed FORCE RLS policy rejects
 * a foreign-tenant INSERT. The completion-loss control suppresses the response
 * after a real, autocommitted business INSERT; it is not a network simulation.
 * All fixture values are disposable synthetic data.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';

const ORG = 94910;
const FOREIGN_ORG = 94911;
const PREFIX = `synthetic-native-feedback-${randomUUID()}`;
const BASE = '/api/concept2cure/feedback';
let owner: Pool;
let runtime: Pool;
let sharedPool: Pool;
let originalQuery: Pool['query'];
let app: express.Express;
let userId: number;
let foreignUserId: number;
let token: string;
let foreignToken: string;
let wrongTenantToken: string;
let control: 'none' | 'business-refusal' | 'audit-refusal' | 'completion-loss' = 'none';
let rejectedSqlCode: string | undefined;
let feedbackAlsTenant: string | undefined;

function queryParts(args: unknown[]) {
  const first = args[0];
  const config = first && typeof first === 'object' && 'text' in first
    ? first as { text: string; values?: unknown[] }
    : undefined;
  const text = typeof first === 'string' ? first : config?.text ?? '';
  const values = Array.isArray(args[1]) ? args[1] as unknown[] : config?.values;
  return { text, values, config };
}

/** Locate the tenant parameter from the actual INSERT, never its assumed offset. */
function tenantParameter(text: string, table: 'ai_feedback' | 'regulatory_audit_logs'): number {
  const insertion = /^\s*insert\s+into\s+(?:"?public"?\.)?"?(ai_feedback|regulatory_audit_logs)"?\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(text);
  if (!insertion || insertion[1].toLowerCase() !== table) return -1;
  const columns = insertion[2].split(',').map(column => column.replaceAll('"', '').trim());
  const position = columns.indexOf('organization_id');
  const placeholder = insertion[3].split(',')[position]?.trim();
  return placeholder && /^\$\d+$/.test(placeholder) ? Number(placeholder.slice(1)) - 1 : -1;
}

function retarget(args: unknown[], parameter: number): unknown[] {
  const { values, config } = queryParts(args);
  if (!values) throw new Error('Synthetic native failure control requires actual SQL parameters');
  const replacement = [...values];
  replacement[parameter] = FOREIGN_ORG;
  return config && !Array.isArray(args[1])
    ? [{ ...config, values: replacement }, ...args.slice(1)]
    : [args[0], replacement, ...args.slice(2)];
}

const post = (body: Record<string, unknown>, bearer = token) =>
  request(app).post(BASE).set('Authorization', `Bearer ${bearer}`).send(body);
const rows = async (messageId: string) =>
  (await owner.query('SELECT * FROM ai_feedback WHERE message_id=$1', [messageId])).rows;
const audits = async (messageId: string) =>
  (await owner.query(`SELECT organization_id,user_id,entity_type,entity_id,action,new_value,metadata
    FROM regulatory_audit_logs WHERE action='FEEDBACK' AND entity_type='ai_response' AND entity_id=$1`, [messageId])).rows;

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required for the native non-superuser feedback proof.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,'Synthetic native feedback audit','synthetic-native-feedback-audit','active'),
    ($2,'Synthetic native feedback foreign audit','synthetic-native-feedback-foreign-audit','active')
    ON CONFLICT(id) DO NOTHING`, [ORG, FOREIGN_ORG]);
  expect((await owner.query('SELECT id,name,status FROM organizations WHERE id=ANY($1::integer[]) ORDER BY id', [[ORG, FOREIGN_ORG]])).rows)
    .toEqual([
      { id: ORG, name: 'Synthetic native feedback audit', status: 'active' },
      { id: FOREIGN_ORG, name: 'Synthetic native feedback foreign audit', status: 'active' },
    ]);
  const passwordHash = await bcrypt.hash('Synthetic-native-feedback-only!', 4);
  const account = async (email: string, name: string) => Number((await owner.query(`INSERT INTO users (email,name,status,password_hash)
    VALUES ($1,$2,'active',$3) ON CONFLICT(email) DO UPDATE SET status='active',mfa_enabled=false,mfa_secret=NULL,
      password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`, [email, name, passwordHash])).rows[0].id);
  userId = await account('synthetic-native-feedback@example.invalid', 'Synthetic feedback author');
  foreignUserId = await account('synthetic-native-feedback-foreign@example.invalid', 'Synthetic foreign feedback author');
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at)
    VALUES ($1,$2,'member',now()-interval '1 day'),($3,$4,'member',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member',created_at=EXCLUDED.created_at`,
  [ORG, userId, FOREIGN_ORG, foreignUserId]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const bearer = (actor: number, organization: number) => jwt.sign({ type: 'access', userId: actor,
    organizationId: String(organization), role: 'member' }, activeJwtSecret(), { expiresIn: '1h' });
  token = bearer(userId, ORG);
  foreignToken = bearer(foreignUserId, FOREIGN_ORG);
  wrongTenantToken = bearer(userId, FOREIGN_ORG);
  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  app.get('/native-feedback-scope', authMiddleware, async (req, res) => {
    const who = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_user_role',true) AS policy_role,
      current_setting('app.current_tenant_id',true) AS tenant_id`);
    res.json({ ...who.rows[0], alsTenantId: getTenantScope()?.tenantId,
      lazyRequestClient: req.dbClient instanceof LazyRequestDbClient });
  });
  app.get('/native-feedback-rows', authMiddleware, async (req, res) => {
    res.json((await requestPgClient(req).query('SELECT id,organization_id,message_id FROM ai_feedback WHERE message_id LIKE $1 ORDER BY id', [`${PREFIX}%`])).rows);
  });
  app.post('/native-feedback-foreign-write', authMiddleware, async (req, res) => {
    try {
      await requestPgClient(req).query(`INSERT INTO ai_feedback
        (organization_id,user_id,message_id,positive) VALUES ($1,$2,$3,true) RETURNING id`,
      [FOREIGN_ORG, userId, `${PREFIX}-forbidden-direct-write`]);
      res.status(500).json({ unexpectedWrite: true });
    } catch (error) { res.status(403).json({ sqlCode: (error as { code?: string }).code }); }
  });
  app.use('/api/concept2cure', (await import('../../server/routes/c2c/context-intelligence')).default);
  sharedPool = (await import('../../server/db/runtime')).getPool();
  originalQuery = sharedPool.query;
  const delegate = originalQuery.bind(sharedPool);
  sharedPool.query = ((...args: unknown[]) => {
    const { text, values } = queryParts(args);
    const business = tenantParameter(text, 'ai_feedback');
    const audit = tenantParameter(text, 'regulatory_audit_logs');
    // The seam applies only to this run's own fixture INSERT. All auth,
    // membership, tenant setup and unrelated concurrent queries stay genuine.
    const owned = values?.some(value => typeof value === 'string' && value.startsWith(PREFIX));
    if (owned && business >= 0 && values?.[business] === ORG) feedbackAlsTenant = getTenantScope()?.tenantId;
    const parameter = owned && control === 'business-refusal' ? business
      : owned && control === 'audit-refusal' ? audit : -1;
    const actualArgs = parameter >= 0 && values?.[parameter] === ORG ? retarget(args, parameter) : args;
    const pending = Reflect.apply(delegate, sharedPool, actualArgs) as Promise<unknown>;
    return pending.then(result => {
      if (owned && business >= 0 && control === 'completion-loss') {
        throw Object.assign(new Error('Synthetic completion signal suppressed after actual business INSERT'), { code: 'ECONNRESET' });
      }
      return result;
    }, error => {
      if (actualArgs !== args) rejectedSqlCode = (error as { code?: string }).code;
      throw error;
    });
  }) as Pool['query'];
});

afterAll(async () => {
  control = 'none';
  if (sharedPool && originalQuery) sharedPool.query = originalQuery;
  if (owner) await owner.end();
  if (runtime) await runtime.end();
  if (sharedPool) await sharedPool.end();
});

function registerFeedbackPersistenceCases1() {
  it('uses genuine auth, ALS, a lazy request connection and deployed non-bypass FORCE RLS', async () => {
    const who = (await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(who).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false });
    const response = await request(app).get('/native-feedback-scope').set('Authorization', `Bearer ${token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ role: who.role, policy_role: 'member', tenant_id: String(ORG),
      alsTenantId: String(ORG), lazyRequestClient: true });
    const policies = await owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid IN ('ai_feedback'::regclass,'regulatory_audit_logs'::regclass)`);
    expect(policies.rows).toHaveLength(2);
    expect(policies.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    // Separate unscoped connection is a fail-closed control, not evidence that
    // the instrumented shared pool fails inside the genuine request ALS scope.
    expect((await runtime.query('SELECT id FROM ai_feedback WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });

  it('persists a real identity and verified actor with canonical regulatory audit for both boolean values', async () => {
    for (const positive of [true, false]) {
      const messageId = `${PREFIX}-${positive}-opaque'; DROP TABLE ai_feedback; --`;
      const conversationId = `${PREFIX}-opaque-conversation`;
      const response = await post({ messageId, positive, conversationId, comment: 'Synthetic feedback only.',
        organizationId: FOREIGN_ORG, userId: foreignUserId });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({ success: true, data: { recorded: true }, meta: { auditTrail: { persisted: true, chained: false } } });
      expect(Number.isInteger(response.body.data.id)).toBe(true);
      expect(response.body.data.id).toBeGreaterThan(0);
      expect(await rows(messageId)).toMatchObject([{ id: response.body.data.id, organization_id: ORG, user_id: userId,
        message_id: messageId, conversation_id: conversationId, positive, comment: 'Synthetic feedback only.' }]);
      expect(await audits(messageId)).toMatchObject([{ organization_id: ORG, user_id: userId,
        action: 'FEEDBACK', entity_type: 'ai_response', entity_id: messageId, new_value: { positive, conversationId } }]);
      expect(feedbackAlsTenant).toBe(String(ORG));
    }
  });

  it('rejects missing/invalid booleans, blank/oversized labels and oversized comments without business or audit receipts', async () => {
    const cases = [
      { positive: true }, { messageId: `${PREFIX}-missing-boolean` },
      { messageId: `${PREFIX}-string-boolean`, positive: 'false' },
      { messageId: `${PREFIX}-number-boolean`, positive: 1 },
      { messageId: '', positive: true }, { messageId: ' '.repeat(5), positive: true },
      { messageId: 'x'.repeat(201), positive: true },
      { messageId: `${PREFIX}-long-conversation`, positive: true, conversationId: 'x'.repeat(201) },
      { messageId: `${PREFIX}-long-comment`, positive: true, comment: 'x'.repeat(4001) },
    ];
    for (const body of cases) {
      const response = await post(body);
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.data).toBeUndefined();
      if (body.messageId) {
        expect(await rows(body.messageId)).toEqual([]);
        expect(await audits(body.messageId)).toEqual([]);
      }
    }
  });
}

function registerFeedbackPersistenceCases2() {

  it('keeps foreign feedback private and refuses forged tenant membership and actual cross-tenant INSERT', async () => {
    const messageId = `${PREFIX}-foreign`;
    const foreign = await post({ messageId, positive: true }, foreignToken);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(200);
    expect(await rows(messageId)).toMatchObject([{ organization_id: FOREIGN_ORG, user_id: foreignUserId }]);
    const own = await request(app).get('/native-feedback-rows').set('Authorization', `Bearer ${token}`);
    expect(own.status).toBe(200);
    expect(own.body.length).toBeGreaterThan(0);
    expect(own.body.every((row: { organization_id: number }) => row.organization_id === ORG)).toBe(true);
    expect(own.body.some((row: { message_id: string }) => row.message_id === messageId)).toBe(false);
    const denied = await request(app).post('/native-feedback-foreign-write').set('Authorization', `Bearer ${token}`);
    expect(denied.status).toBe(403);
    expect(denied.body.sqlCode).toBe('42501');
    expect(await rows(`${PREFIX}-forbidden-direct-write`)).toEqual([]);
    const forged = await post({ messageId: `${PREFIX}-forged-membership`, positive: true }, wrongTenantToken);
    expect([401, 403]).toContain(forged.status);
    expect(await rows(`${PREFIX}-forged-membership`)).toEqual([]);
    expect((await request(app).post(BASE).send({ messageId, positive: true })).status).toBe(401);
  });

  it('contains a proved business INSERT refusal without fake success or audit, then recovers', async () => {
    const messageId = `${PREFIX}-business-refusal`;
    control = 'business-refusal';
    rejectedSqlCode = undefined;
    try {
      const failed = await post({ messageId, positive: true });
      expect(rejectedSqlCode).toBe('42501');
      expect(failed.status, JSON.stringify(failed.body)).toBe(503);
      expect(failed.body).toMatchObject({ success: false, error: { code: 'FEEDBACK_NOT_RECORDED' } });
      expect(failed.body.data).toBeUndefined();
      expect(await rows(messageId)).toEqual([]);
      expect(await audits(messageId)).toEqual([]);
      expect(JSON.stringify(failed.body)).not.toContain('row-level security');
    } finally { control = 'none'; }
    const recovered = await post({ messageId, positive: true });
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
    expect(recovered.body.meta.auditTrail).toEqual({ persisted: true, chained: false });
    expect(await rows(messageId)).toHaveLength(1);
    expect(await audits(messageId)).toHaveLength(1);
  });

  it('reports an unconfirmed completion without inventing rollback, receipt or audit for the real committed row', async () => {
    const messageId = `${PREFIX}-completion-loss`;
    control = 'completion-loss';
    try {
      const unconfirmed = await post({ messageId, positive: false });
      expect(unconfirmed.status, JSON.stringify(unconfirmed.body)).toBe(503);
      expect(unconfirmed.body).toMatchObject({ success: false, error: { code: 'FEEDBACK_SAVE_UNCONFIRMED' } });
      expect(unconfirmed.body.data).toBeUndefined();
      expect(await rows(messageId)).toHaveLength(1);
      expect(await audits(messageId)).toEqual([]);
      expect(JSON.stringify(unconfirmed.body)).not.toMatch(/roll(?:ed)?\s?back|nothing was saved/i);
    } finally { control = 'none'; }
    const recovered = await post({ messageId: `${PREFIX}-after-completion-loss`, positive: false });
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
  });
}

function registerFeedbackPersistenceCases3() {

  it('reports the actual postcommit audit refusal while preserving feedback, then restores audit persistence', async () => {
    const messageId = `${PREFIX}-audit-refusal`;
    control = 'audit-refusal';
    rejectedSqlCode = undefined;
    try {
      const warning = await post({ messageId, positive: true });
      expect(rejectedSqlCode).toBe('42501');
      expect(warning.status, JSON.stringify(warning.body)).toBe(200);
      expect(warning.body).toMatchObject({ success: true, data: { recorded: true },
        meta: { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } } });
      expect(await rows(messageId)).toMatchObject([{ id: warning.body.data.id, organization_id: ORG, user_id: userId }]);
      expect(await audits(messageId)).toEqual([]);
      expect(JSON.stringify(warning.body)).not.toContain('row-level security');
    } finally { control = 'none'; }
    const recoveredId = `${PREFIX}-audit-recovery`;
    const recovered = await post({ messageId: recoveredId, positive: true });
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
    expect(recovered.body.meta.auditTrail).toEqual({ persisted: true, chained: false });
    expect(await rows(recoveredId)).toHaveLength(1);
    expect(await audits(recoveredId)).toHaveLength(1);
  });
}

describe('native AI feedback persistence and audit outcomes', () => {
  registerFeedbackPersistenceCases1();
  registerFeedbackPersistenceCases2();
  registerFeedbackPersistenceCases3();
});
