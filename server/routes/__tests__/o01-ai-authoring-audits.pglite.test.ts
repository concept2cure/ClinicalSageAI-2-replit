/** Real saved draft/feedback state and canonical audit writers; controlled gateway, no live AI calls. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../../shared/schema';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

interface GatewayInput { onStream?: (text: string, metadata: { type: string }) => void; organizationId?: number; userId?: number }
const h = vi.hoisted(() => ({ db: null as PgliteDatabase | null, pg: null as PGlite | null,
  gateway: vi.fn(), retrieval: vi.fn(), feedbackReplyLost: false }));
vi.mock('../../db', () => {
  const pool = { query: async (sql: string, args?: unknown[]) => {
    const result = await h.pg!.query(sql, args);
    if (h.feedbackReplyLost && /INSERT INTO ai_feedback/.test(sql)) { h.feedbackReplyLost = false; throw Object.assign(new Error('Synthetic connection reply lost'), { code: 'ECONNRESET' }); }
    return result;
  }, connect: async () => ({ query: (sql: string, args?: unknown[]) => h.pg!.query(sql, args), release() {} }) };
  return { get db() { return h.db; }, pool, getPool: () => pool };
});
vi.mock('../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/tenantContext', () => ({ tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(), requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../utils/logger', () => ({ createScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('../../services/ai-gateway', () => ({ getGateway: () => ({ route: h.gateway }) }));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway: () => ({ route: h.gateway, getEnabledProviders: () => ['controlled-fixture'] }) }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: {} }));
vi.mock('../../db/currentTenant', () => ({ currentTenantOrgUuid: async () => '00000000-0000-4000-8000-000000000009' }));
vi.mock('../../services/data-room-retrieval', async importOriginal => ({ ...await importOriginal<typeof import('../../services/data-room-retrieval')>(), retrieveDataRoomEvidence: h.retrieval }));
vi.mock('../../services/intelligence/rim-interceptors.js', () => ({ interceptFeedback: vi.fn(), interceptComplianceScan: vi.fn() }));
vi.mock('../../services/intelligence/index.js', () => ({ computeReadinessScore: async () => null, generateRecommendations: async () => null }));
vi.mock('../../lib/tamper-proof-audit', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/tamper-proof-audit')>(),
  getTamperProofAuditLog: () => ({ initialize: async () => undefined, log: async () => { throw new Error('Synthetic secondary store unavailable'); } }) }));
import aiEditing from '../c2c/ai-editing';
import contextIntelligence from '../c2c/context-intelligence';
import submissionRoutes from '../submissions';
import { expandRoleClaims } from '../../middleware/auth';
import { generateSection } from '../../services/authoring/section-generation-service';

let pg: PGlite;
function app(userId = 7, organizationId = 9) {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => {
    Object.assign(req, { userId, userRole: 'admin', userEmail: 'synthetic@example.test',
      tenantContext: { organizationId, clientWorkspaceId: organizationId === 9 ? 1 : 2 }, tenantId: organizationId,
      user: { id: userId, userId, organizationId, role: 'admin', roles: expandRoleClaims('admin', undefined) } }); next();
  }); a.use('/api/concept2cure', aiEditing, contextIntelligence); a.use('/api/submissions', submissionRoutes); return a;
}
beforeAll(async () => {
  pg = new PGlite(); h.pg = pg; h.db = drizzle(pg);
  const core = await readFile('migrations/0000_sweet_joseph.sql', 'utf8');
  for (const table of [schema.organizations, schema.users, schema.organizationUsers, schema.clientWorkspaces, schema.projects,
    schema.concept2cureArtifacts, schema.concept2cureArtifactVersions, schema.regulatoryAuditLogs, schema.coauthorDocuments]) {
    const cfg = getTableConfig(table), ddl = core.match(new RegExp(`CREATE TABLE "${cfg.name}" \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!ddl) throw new Error(`Canonical DDL missing: ${cfg.name}`); await pg.exec(ddl);
    const known = new Set((await pg.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [cfg.name])).rows.map(r => r.column_name));
    // Unused nullable pgvector column has no bearing on these SQL persistence/response checks.
    for (const c of cfg.columns) if (!known.has(c.name)) await pg.exec(`ALTER TABLE "${cfg.name}" ADD COLUMN "${c.name}" ${c.getSQLType().replace(/^vector\(\d+\)$/, 'text')}`);
  }
  for (const path of ['db/migrations/20260314_phase12_multi_user_review.sql', 'db/migrations/20260401_project_sharing_visibility.sql', 'db/migrations/20261014_ai_feedback_persistence.sql']) await pg.exec(await readFile(path, 'utf8'));
  const submission = (await readFile('migrations/20260604_submission_core_canonical.sql', 'utf8')).match(/CREATE TABLE IF NOT EXISTS public\.submissions \([\s\S]*?\n\);/)?.[0];
  if (!submission) throw new Error('Canonical submission DDL missing'); await pg.exec(submission);
  await pg.exec(AUDIT_LOGS_PGLITE_DDL); await pg.exec('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS chain_seq BIGSERIAL');
  await pg.exec(`INSERT INTO organizations(id,name,slug) VALUES(9,'Synthetic nine','nine'),(10,'Synthetic ten','ten');
    INSERT INTO users(id,name,email,password_hash) VALUES(7,'Synthetic member','member7@example.test','fixture'),(8,'Other member','member8@example.test','fixture');
    INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES(1,9,'Own workspace','own'),(2,10,'Foreign workspace','foreign');
    INSERT INTO projects(id,organization_id,client_workspace_id,name,type,status,created_by_id,owner_id,settings)
      VALUES(3,9,1,'Own private source','IND','active',7,7,'{}'),(4,9,1,'Other private source','IND','active',8,8,'{}'),(5,10,2,'Foreign source','IND','active',8,8,'{}');
    INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(3,9,'private'),(4,9,'private'),(5,10,'private');
    INSERT INTO project_members(project_id,organization_id,user_id,role) VALUES(3,9,7,'owner');
    INSERT INTO submissions(id,title,application_type,client_type,primary_region,organization_id,created_by) VALUES(11,'Own submission','ind','pharma','fda',9,7);`);
});
beforeEach(async () => {
  h.feedbackReplyLost = false; h.gateway.mockReset(); h.retrieval.mockReset(); h.retrieval.mockResolvedValue({ status: 'empty', hits: [] });
  h.gateway.mockImplementation(async (input: GatewayInput) => { input.onStream?.('Actual streamed draft.', { type: 'text' }); return { content: 'Actual generated draft.', model: 'controlled-model-version', usage: { inputTokens: 2, outputTokens: 3 } }; });
  await pg.exec(`ALTER TABLE regulatory_audit_logs DROP CONSTRAINT IF EXISTS o01_ai_audit_refused;
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS o01_ai_audit_refused;
    ALTER TABLE ai_feedback DROP CONSTRAINT IF EXISTS o01_feedback_refused;
    ALTER TABLE coauthor_documents DROP CONSTRAINT IF EXISTS o01_draft_refused;
    DELETE FROM ai_feedback; DELETE FROM coauthor_documents; DELETE FROM regulatory_audit_logs; DELETE FROM audit_logs;
    DELETE FROM organization_users; INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,7,'member'),(9,8,'member');`);
});
afterAll(async () => { await pg?.close(); });
const feedback = { messageId: 'opaque-synthetic-message', conversationId: 'opaque-synthetic-conversation', positive: true, comment: 'Synthetic feedback note' };
const edit = { action: 'rewrite', text: 'Human supplied draft.', contextAttachment: 'adhoc' };
const template = { contextAttachment: 'adhoc', variables: { PRODUCT_NAME: 'Synthetic product', INDICATION: 'Synthetic indication', PHASE: 'Phase I', REGION: 'FDA' } };
const auditRows = async () => (await pg.query('SELECT action FROM regulatory_audit_logs')).rows;

describe('editing and template suggestion outcomes reach the JSON caller', () => {
  it.each([true, false])('actual regulatory audit insert unavailable=%s', async failed => {
    if (failed) await pg.exec('ALTER TABLE regulatory_audit_logs ADD CONSTRAINT o01_ai_audit_refused CHECK(false) NOT VALID');
    for (const [path, body] of [['/ai/edit-section', edit], ['/ai/templates/ctd-clinical-overview/generate', template]] as const) {
      const res = await request(app()).post(`/api/concept2cure${path}`).send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(200); expect(res.body.data.result).toBe('Actual generated draft.');
      expect(res.body.meta?.auditTrail).toMatchObject(failed ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : { persisted: true, chained: false });
    }
    expect(await auditRows()).toHaveLength(failed ? 0 : 2);
    for (const [input] of h.gateway.mock.calls as [GatewayInput][]) expect(input).toMatchObject({ organizationId: 9, userId: 7 });
  });
  it.each([4, 5])('does not pass private/foreign project %s context to retrieval or a provider', async projectId => {
    for (const [path, body] of [['/ai/edit-section', edit], ['/ai/templates/ctd-clinical-overview/generate', template]] as const) {
      const res = await request(app()).post(`/api/concept2cure${path}`).send({ ...body, projectId, contextAttachment: 'project' });
      expect(res.status).toBe(404);
    }
    expect(h.retrieval).not.toHaveBeenCalled(); expect(h.gateway).not.toHaveBeenCalled(); expect(await auditRows()).toHaveLength(0);
  });
  it('can use an actually accessible project despite a stale administrator claim', async () => {
    for (const [path, body] of [['/ai/edit-section', edit], ['/ai/templates/ctd-clinical-overview/generate', template]] as const) {
      const res = await request(app()).post(`/api/concept2cure${path}`).send({ ...body, projectId: 'proj_3', contextAttachment: 'project' });
      expect(res.status).toBe(200);
    }
    expect(h.retrieval).toHaveBeenCalledTimes(2); expect(h.gateway).toHaveBeenCalledTimes(2);
    for (const call of h.retrieval.mock.calls) expect(call[2]).toMatchObject({ projectId: '3' });
  });
});

describe('feedback returns evidence of its actual business and audit writes', () => {
  it.each([true, false])('saved feedback with audit unavailable=%s', async failed => {
    if (failed) await pg.exec('ALTER TABLE regulatory_audit_logs ADD CONSTRAINT o01_ai_audit_refused CHECK(false) NOT VALID');
    const res = await request(app()).post('/api/concept2cure/feedback').send({ ...feedback, organizationId: 10, userId: 8 });
    expect(res.status).toBe(200); expect(res.body.data).toMatchObject({ recorded: true, id: expect.any(Number) });
    expect(res.body.meta?.auditTrail).toMatchObject(failed ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : { persisted: true, chained: false });
    expect((await pg.query('SELECT organization_id,user_id,message_id,positive FROM ai_feedback')).rows).toEqual([{ organization_id: 9, user_id: 7, message_id: feedback.messageId, positive: true }]);
    expect(await auditRows()).toHaveLength(failed ? 0 : 1);
  });
  it('proven insert refusal is not recorded:true and recovery saves a real feedback row', async () => {
    await pg.exec('ALTER TABLE ai_feedback ADD CONSTRAINT o01_feedback_refused CHECK(false) NOT VALID');
    const refused = await request(app()).post('/api/concept2cure/feedback').send(feedback);
    expect(refused.status).toBe(503); expect(refused.body.error.code).toBe('FEEDBACK_NOT_RECORDED'); expect(refused.body.data).toBeUndefined();
    expect((await pg.query('SELECT id FROM ai_feedback')).rows).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
    await pg.exec('ALTER TABLE ai_feedback DROP CONSTRAINT o01_feedback_refused');
    const recovered = await request(app()).post('/api/concept2cure/feedback').send(feedback);
    expect(recovered.status).toBe(200); expect(recovered.body.data.recorded).toBe(true); expect(await auditRows()).toHaveLength(1);
  });
  it('a lost connection reply does not invent rollback or a confirmed saved identity', async () => {
    h.feedbackReplyLost = true;
    const res = await request(app()).post('/api/concept2cure/feedback').send(feedback);
    expect(res.status).toBe(503); expect(res.body.error.code).toBe('FEEDBACK_SAVE_UNCONFIRMED'); expect(res.body.data).toBeUndefined();
    expect((await pg.query('SELECT id FROM ai_feedback')).rows).toHaveLength(1); expect(await auditRows()).toHaveLength(0);
  });
  it.each([{ positive: 'true' }, { messageId: '' }, { messageId: 'x'.repeat(201) }, { comment: 'x'.repeat(4001) }])('rejects malformed feedback before persistence', async change => {
    const res = await request(app()).post('/api/concept2cure/feedback').send({ ...feedback, ...change });
    expect(res.status).toBe(400); expect((await pg.query('SELECT id FROM ai_feedback')).rows).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });
  it('revoked membership cannot submit feedback using the old session claim', async () => {
    await pg.exec('DELETE FROM organization_users WHERE organization_id=9 AND user_id=7');
    const res = await request(app()).post('/api/concept2cure/feedback').send(feedback);
    expect(res.status).toBe(403); expect((await pg.query('SELECT id FROM ai_feedback')).rows).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });
});

describe('saved section generation carries its real audit through the actual SSE route', () => {
  it.each([true, false])('saved draft and done frame with audit unavailable=%s', async failed => {
    if (failed) await pg.exec('ALTER TABLE audit_logs ADD CONSTRAINT o01_ai_audit_refused CHECK(false) NOT VALID');
    const res = await request(app()).post('/api/submissions/11/sections/generate').send({ sectionCode: '2.5', evidence: [] });
    expect(res.status).toBe(200);
    const frames = res.text.split('\n\n').map(frame => ({ event: frame.match(/^event: (.*)/m)?.[1], data: frame.match(/^data: (.*)/m)?.[1] })).filter(frame => frame.data).map(frame => ({ event: frame.event, data: JSON.parse(frame.data!) }));
    expect(frames.map(frame => frame.event)).toContain('chunk');
    const done = frames.find(frame => frame.event === 'done')?.data;
    expect(done).toMatchObject({ documentId: expect.any(Number), sectionCode: '2.5', body: '<p>Actual generated draft.</p>' });
    expect(done.auditTrail).toMatchObject(failed ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : { persisted: true, chained: true });
    expect((await pg.query('SELECT id,content FROM coauthor_documents')).rows).toEqual([{ id: done.documentId, content: done.body }]);
    expect((await pg.query('SELECT id FROM audit_logs')).rows).toHaveLength(failed ? 0 : 1); expect(frames.some(frame => frame.event === 'error')).toBe(false);
  });
  it('a failed draft insert creates no document or successful audit result', async () => {
    await pg.exec('ALTER TABLE coauthor_documents ADD CONSTRAINT o01_draft_refused CHECK(false) NOT VALID');
    await expect(generateSection({ submissionId: 11, sectionCode: '2.5', evidence: [] }, { organizationId: 9, userId: 7 })).rejects.toBeDefined();
    expect((await pg.query('SELECT id FROM coauthor_documents')).rows).toHaveLength(0); expect((await pg.query('SELECT id FROM audit_logs')).rows).toHaveLength(0);
  });
  it.each(['provider', 'save'])('the %s failure is contained in the actual error frame with no done receipt', async cause => {
    if (cause === 'provider') h.gateway.mockRejectedValueOnce(new Error('Synthetic private provider diagnostic'));
    else await pg.exec('ALTER TABLE coauthor_documents ADD CONSTRAINT o01_draft_refused CHECK(false) NOT VALID');
    const res = await request(app()).post('/api/submissions/11/sections/generate').send({ sectionCode: '2.5', evidence: [] });
    expect(res.text).toContain('event: error'); expect(res.text).not.toContain('event: done');
    expect(res.text).not.toMatch(/Synthetic private provider diagnostic|coauthor_documents|o01_draft_refused|constraint/);
    expect((await pg.query('SELECT id FROM coauthor_documents')).rows).toHaveLength(0); expect((await pg.query('SELECT id FROM audit_logs')).rows).toHaveLength(0);
  });
});
