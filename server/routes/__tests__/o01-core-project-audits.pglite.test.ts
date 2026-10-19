/** Mounted project writes, actual persisted state and the canonical regulatory audit writer. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../../../shared/schema';

const h = vi.hoisted(() => ({ db: null as PgliteDatabase | null, pg: null as PGlite | null }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  pool: {
    query: (sql: string, args?: unknown[]) => h.pg!.query(sql, args),
    connect: async () => ({ query: (sql: string, args?: unknown[]) => h.pg!.query(sql, args), release() {} }),
  },
}));
vi.mock('../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../middleware/tenantContext', () => ({ tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(), requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/enterprise-performance', () => ({ cacheResponse: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../utils/logger', () => ({ createScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
// Project bootstrap is independent of the ordinary project/audit writes under test.
vi.mock('../../services/intelligence/project-intelligence-service.js', () => ({ getOrCreateProfile: async () => undefined }));
vi.mock('../../services/regulatory/projectBootstrapFromRegistry.js', () => ({ bootstrapFromRegistry: async () => null }));
vi.mock('../../../services/regulatory/ind-ectd-sections.js', () => ({ getAllINDSections: () => [] }));
import routes from '../concept2cure';

let pg: PGlite;
function app(userId = 7, orgId = 9, claimedRole = 'admin') {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => {
    Object.assign(req, { userId, userRole: claimedRole, userEmail: 'member@example.test',
      user: { id: userId, organizationId: orgId, role: claimedRole },
      tenantContext: { organizationId: orgId, clientWorkspaceId: orgId === 9 ? 1 : 2 }, tenantId: orgId }); next();
  }); a.use('/api/concept2cure', routes); return a;
}
beforeAll(async () => {
  pg = new PGlite(); h.pg = pg; h.db = drizzle(pg);
  const base = await readFile('migrations/0000_sweet_joseph.sql', 'utf8');
  for (const table of [schema.organizations, schema.users, schema.organizationUsers, schema.clientWorkspaces, schema.projects,
    schema.concept2cureConversations, schema.concept2cureMessages, schema.concept2cureArtifacts, schema.concept2cureArtifactVersions, schema.regulatoryAuditLogs,
    // Read by getOwnershipDerivationData, which the ownership-preferences PATCH calls (IAM-31 cases below);
    // its sixth table, concept2cure_review_tasks, comes from the phase13 migration applied below.
    schema.concept2cureSignatures, schema.concept2cureSubmissionSnapshots, schema.projectActivities]) {
    const cfg = getTableConfig(table);
    const ddl = base.match(new RegExp(`CREATE TABLE "${cfg.name}" \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!ddl) throw new Error(`Canonical DDL missing: ${cfg.name}`);
    await pg.exec(ddl);
    const known = new Set((await pg.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [cfg.name])).rows.map(r => r.column_name));
    for (const column of cfg.columns) if (!known.has(column.name)) await pg.exec(`ALTER TABLE "${cfg.name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`);
  }
  // phase13 creates concept2cure_review_tasks, the other table getOwnershipDerivationData reads.
  for (const path of ['db/migrations/20260314_phase12_multi_user_review.sql', 'db/migrations/20260401_project_sharing_visibility.sql', 'migrations/phase13_review_threads_tasks.sql']) await pg.exec(await readFile(path, 'utf8'));
  await pg.exec(`INSERT INTO organizations(id,name,slug) VALUES(9,'Synthetic nine','o-nine'),(10,'Synthetic ten','o-ten');
    INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES(1,9,'Workspace nine','w-nine'),(2,10,'Workspace ten','w-ten');`);
  for (const id of [7, 8, 9, 10, 11]) await pg.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'Actual member',$2,'fixture-hash')", [id, `member${id}@example.test`]);
});
beforeEach(async () => {
  await pg.exec(`ALTER TABLE regulatory_audit_logs DROP CONSTRAINT IF EXISTS o01_audit_refused;
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS o01_project_refused;
    ALTER TABLE project_members DROP CONSTRAINT IF EXISTS o01_owner_refused;
    ALTER TABLE project_visibility_settings DROP CONSTRAINT IF EXISTS o01_visibility_refused;
    ALTER TABLE concept2cure_conversations DROP CONSTRAINT IF EXISTS o01_archive_refused;
    DELETE FROM regulatory_audit_logs; DELETE FROM concept2cure_messages; DELETE FROM concept2cure_conversations;
    DELETE FROM project_members; DELETE FROM project_visibility_settings; DELETE FROM projects;
    DELETE FROM organization_users; UPDATE organizations SET status='active';
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,7,'member'),(9,8,'member'),(9,9,'viewer'),(9,10,'member'),(10,11,'admin');
    INSERT INTO projects(id,organization_id,client_workspace_id,name,type,status,created_by_id,owner_id,settings,metadata)
      VALUES(3,9,1,'Private source','IND','active',7,7,'{"customInstructions":"Retain these reusable instructions","sharing":{"visibility":"private","members":[{"userId":8,"role":"edit","status":"active"}]},"programId":"source-program-uuid","ownership":{"documentInventory":[{"id":"private-source-doc"}],"reviewState":"approved"}}','{"submissionType":"IND","programId":"source-program-uuid","transfer":{"status":"pending"}}'),
        (4,9,1,'Other private source','IND','active',10,10,'{}','{}'),(5,10,2,'Foreign project','IND','active',11,11,'{}','{}');
    INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(3,9,'private'),(4,9,'private'),(5,10,'private');
    INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES(3,9,7,'owner','active'),(3,9,8,'use','active'),(3,9,9,'edit','active');
    INSERT INTO concept2cure_conversations(id,conversation_id,project_id,organization_id,title,status,created_by_id)
      VALUES(31,'retained-conversation',3,9,'Retained conversation','active',7);
    SELECT setval(pg_get_serial_sequence('projects','id'),5,true);`);
});
afterAll(async () => { await pg?.close(); });
const auditRows = async () => (await pg.query('SELECT action,entity_id FROM regulatory_audit_logs ORDER BY id')).rows;
const unavailableAudit = async () => pg.exec('ALTER TABLE regulatory_audit_logs ADD CONSTRAINT o01_audit_refused CHECK(false) NOT VALID');
const expected = (failed: boolean) => failed ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : { persisted: true, chained: false };

describe('seven project operations disclose actual post-action audit persistence', () => {
  it.each([true, false])('create, update, collaborators, export, duplicate, transfer and archive, audit unavailable=%s', async failed => {
    if (failed) await unavailableAudit();
    const a = app();
    const created = await request(a).post('/api/concept2cure/projects').send({ name: 'New private project', submissionType: 'IND', customInstructions: 'Reusable source instructions' });
    const updated = await request(a).put('/api/concept2cure/projects/3').send({ name: 'Updated source' });
    const collab = await request(a).put('/api/concept2cure/projects/3/collaborators').send({ collaborators: [{ userId: 8, permission: 'can_use' }] });
    const exported = await request(a).post('/api/concept2cure/projects/3/export').send({});
    const duplicate = await request(a).post('/api/concept2cure/projects/3/duplicate').send({ name: 'Private template copy' });
    const transfer = await request(a).post('/api/concept2cure/projects/3/transfer').send({ targetUserId: 8, reason: 'Recorded transfer intent for review' });
    const archived = await request(a).delete('/api/concept2cure/projects/3');
    for (const res of [created, updated, collab, exported, duplicate, transfer, archived]) {
      expect(res.status, JSON.stringify(res.body)).toBe(res === created ? 201 : 200);
      expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
      expect(JSON.stringify(res.body.meta)).not.toMatch(/o01_audit_refused|regulatory_audit_logs|constraint/);
    }
    expect(exported.body.data.project.name).toBe('Updated source');
    expect(transfer.body.data.transfer.status).toBe('pending');
    expect((await pg.query('SELECT name,status,owner_id FROM projects WHERE id=3')).rows).toEqual([{ name: 'Updated source', status: 'archived', owner_id: 7 }]);
    expect((await pg.query('SELECT status FROM concept2cure_conversations WHERE id=31')).rows).toEqual([{ status: 'archived' }]);
    expect((await pg.query('SELECT name FROM projects ORDER BY id')).rows).toContainEqual({ name: 'New private project' });
    expect(await auditRows()).toHaveLength(failed ? 0 : 7);
  });
  it('audit recovery restores actual persisted history without changing or repeating the prior saved action', async () => {
    await unavailableAudit();
    const lost = await request(app()).put('/api/concept2cure/projects/3').send({ name: 'Saved during audit outage' });
    expect(lost.status).toBe(200); expect(lost.body.meta.auditTrail.persisted).toBe(false);
    await pg.exec('ALTER TABLE regulatory_audit_logs DROP CONSTRAINT o01_audit_refused');
    const recovered = await request(app()).put('/api/concept2cure/projects/3').send({ description: 'New verified change after recovery' });
    expect(recovered.status).toBe(200); expect(recovered.body.meta.auditTrail).toMatchObject({ persisted: true, chained: false });
    expect((await pg.query('SELECT name,description FROM projects WHERE id=3')).rows).toEqual([{ name: 'Saved during audit outage', description: 'New verified change after recovery' }]);
    expect(await auditRows()).toHaveLength(1);
  });
  it('a failed business write returns refusal and emits no successful audit outcome', async () => {
    await pg.exec("ALTER TABLE projects ADD CONSTRAINT o01_project_refused CHECK(name<>'Rejected business save')");
    const res = await request(app()).put('/api/concept2cure/projects/3').send({ name: 'Rejected business save' });
    expect(res.status).toBe(500); expect(res.body.meta?.auditTrail).toBeUndefined();
    expect((await pg.query('SELECT name FROM projects WHERE id=3')).rows).toEqual([{ name: 'Private source' }]); expect(await auditRows()).toHaveLength(0);
  });
  it('an initial owner grant failure rolls back project creation and visibility', async () => {
    await pg.exec('ALTER TABLE project_members ADD CONSTRAINT o01_owner_refused CHECK(project_id=3) NOT VALID');
    const res = await request(app()).post('/api/concept2cure/projects').send({ name: 'Refused owner grant', submissionType: 'IND' });
    expect(res.status).toBe(500); expect(res.body.meta?.auditTrail).toBeUndefined(); expect(await auditRows()).toHaveLength(0);
    expect((await pg.query('SELECT id FROM projects')).rows).toHaveLength(3);
    expect((await pg.query('SELECT project_id FROM project_visibility_settings')).rows).toHaveLength(3);
  });
  it('a template visibility failure rolls back the copied project and owner grant', async () => {
    await pg.exec('ALTER TABLE project_visibility_settings ADD CONSTRAINT o01_visibility_refused CHECK(project_id=3) NOT VALID');
    const res = await request(app()).post('/api/concept2cure/projects/3/duplicate');
    expect(res.status).toBe(500); expect(res.body.meta?.auditTrail).toBeUndefined(); expect(await auditRows()).toHaveLength(0);
    expect((await pg.query('SELECT id FROM projects')).rows).toHaveLength(3);
    expect((await pg.query('SELECT project_id FROM project_members')).rows).toHaveLength(3);
  });
  it('a conversation archive failure rolls back the project archive too', async () => {
    await pg.exec("ALTER TABLE concept2cure_conversations ADD CONSTRAINT o01_archive_refused CHECK(status<>'archived')");
    const res = await request(app()).delete('/api/concept2cure/projects/3');
    expect(res.status).toBe(500); expect(res.body.meta?.auditTrail).toBeUndefined(); expect(await auditRows()).toHaveLength(0);
    expect((await pg.query('SELECT status,actual_end_date FROM projects WHERE id=3')).rows).toEqual([{ status: 'active', actual_end_date: null }]);
    expect((await pg.query('SELECT status FROM concept2cure_conversations WHERE id=31')).rows).toEqual([{ status: 'active' }]);
  });
});

describe('the canonical persisted project authority applies to these actions', () => {
  it.each(['author', 'tenant_regulatory_scientist'])('current active %s can create and privately copy under the canonical creation policy', async role => {
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=9 AND user_id=7', [role]);
    const a = app(7, 9, 'viewer');
    const created = await request(a).post('/api/concept2cure/projects').send({ name: 'Authorized custom-role project', submissionType: 'IND' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const copied = await request(a).post('/api/concept2cure/projects/3/duplicate');
    expect(copied.status, JSON.stringify(copied.body)).toBe(200);
    expect((await pg.query('SELECT owner_id,created_by_id FROM projects WHERE id>5 ORDER BY id')).rows).toEqual([{ owner_id: 7, created_by_id: 7 }, { owner_id: 7, created_by_id: 7 }]);
    expect(await auditRows()).toHaveLength(2);
  });
  it.each(['viewer', 'readonly', 'read_only', 'guest'])('current %s cannot create or copy despite a stale administrator claim', async role => {
    await pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=9 AND user_id=7', [role]);
    const a = app();
    expect((await request(a).post('/api/concept2cure/projects').send({ name: 'Refused read-only project', submissionType: 'IND' })).status).toBe(403);
    expect((await request(a).post('/api/concept2cure/projects/3/duplicate')).status).toBe(403);
    expect((await pg.query('SELECT id FROM projects')).rows).toHaveLength(3); expect(await auditRows()).toHaveLength(0);
  });
  it.each(['pending_deletion', 'suspended', 'purged', 'inactive'])('a %s tenant cannot create or copy through a read-only recovery grant', async status => {
    await pg.query('UPDATE organizations SET status=$1 WHERE id=9', [status]);
    const a = app();
    expect((await request(a).post('/api/concept2cure/projects').send({ name: 'Refused inactive-tenant project', submissionType: 'IND' })).status).toBe(403);
    expect((await request(a).post('/api/concept2cure/projects/3/duplicate')).status).toBe(403);
    expect((await pg.query('SELECT id FROM projects')).rows).toHaveLength(3); expect(await auditRows()).toHaveLength(0);
  });
  it.each(['export', 'duplicate', 'transfer'])('foreign and inaccessible private %s is refused before disclosure or effects', async action => {
    for (const id of [4, 5]) {
      const res = await request(app()).post(`/api/concept2cure/projects/${id}/${action}`).send({ targetUserId: 8, reason: 'Recorded transfer intent for review' });
      expect(res.status).toBe(404); expect(res.body.data).toBeUndefined();
    }
    expect((await pg.query('SELECT id FROM projects')).rows).toHaveLength(3); expect(await auditRows()).toHaveLength(0);
  });
  it('a project read grant permits export and template duplication but not source mutation', async () => {
    const a = app(8);
    expect((await request(a).post('/api/concept2cure/projects/3/export')).status).toBe(200);
    expect((await request(a).post('/api/concept2cure/projects/3/duplicate')).status).toBe(200);
    for (const res of [await request(a).put('/api/concept2cure/projects/3').send({ name: 'Unauthorized' }),
      await request(a).put('/api/concept2cure/projects/3/collaborators').send({ collaborators: [] }),
      await request(a).post('/api/concept2cure/projects/3/transfer').send({ targetUserId: 7, reason: 'Unauthorized transfer intent' }),
      await request(a).delete('/api/concept2cure/projects/3')]) expect(res.status).toBe(403);
    expect((await pg.query('SELECT name,status FROM projects WHERE id=3')).rows).toEqual([{ name: 'Private source', status: 'active' }]);
    expect(await auditRows()).toHaveLength(2);
  });
  it('a viewer with edit sharing cannot perform a governed write or create a copy', async () => {
    const a = app(9);
    expect((await request(a).post('/api/concept2cure/projects/3/export')).status).toBe(200);
    for (const res of [await request(a).put('/api/concept2cure/projects/3').send({ name: 'Unauthorized viewer save' }),
      await request(a).post('/api/concept2cure/projects/3/duplicate'),
      await request(a).post('/api/concept2cure/projects').send({ name: 'Unauthorized viewer project', submissionType: 'IND' })]) expect(res.status).toBe(403);
    expect((await pg.query('SELECT id FROM projects')).rows).toHaveLength(3); expect(await auditRows()).toHaveLength(1);
  });
  it('revoked current membership refuses every action despite retained sharing and an administrator token', async () => {
    await pg.exec('DELETE FROM organization_users WHERE organization_id=9 AND user_id=7');
    const a = app();
    for (const action of ['export', 'duplicate', 'transfer']) expect((await request(a).post(`/api/concept2cure/projects/3/${action}`).send({ targetUserId: 8, reason: 'Revoked transfer intent' })).status).toBe(403);
    expect((await request(a).put('/api/concept2cure/projects/3').send({ name: 'Revoked save' })).status).toBe(403);
    expect((await request(a).delete('/api/concept2cure/projects/3')).status).toBe(403);
    expect(await auditRows()).toHaveLength(0);
  });
  it('a copied template becomes the caller’s private project and carries no source ownership or native identity', async () => {
    const res = await request(app(8)).post('/api/concept2cure/projects/3/duplicate').send({});
    expect(res.status).toBe(200);
    const id = Number(res.body.data.id.replace('proj_', ''));
    const copy = (await pg.query<{ owner_id: number; created_by_id: number; settings: Record<string, unknown>; metadata: Record<string, unknown> }>('SELECT owner_id,created_by_id,settings,metadata FROM projects WHERE id=$1', [id])).rows[0];
    expect(copy.owner_id).toBe(8); expect(copy.created_by_id).toBe(8); expect(copy.settings.customInstructions).toBe('Retain these reusable instructions');
    expect(JSON.stringify(copy.settings)).not.toMatch(/private-source-doc|source-program-uuid|approved/);
    expect(copy.metadata).not.toHaveProperty('programId'); expect(copy.metadata).not.toHaveProperty('transfer');
    expect((await pg.query('SELECT visibility FROM project_visibility_settings WHERE project_id=$1', [id])).rows).toEqual([{ visibility: 'private' }]);
    expect((await pg.query('SELECT user_id,role FROM project_members WHERE project_id=$1', [id])).rows).toEqual([{ user_id: 8, role: 'owner' }]);
    expect((await request(app(7)).post(`/api/concept2cure/projects/${id}/export`)).status).toBe(404);
  });
});

/**
 * IAM-31 (weekly review 2026-10-19). PATCH /projects/:id/ownership-preferences
 * writes settings.customInstructions — the text getProjectInstructionsBlock
 * puts into AnA's prompt for every session on the project — with the router's
 * organization check only. Its sibling PUT /projects/:id writes the same field
 * behind projectRecordAdmission(true) and an audit row. So any member, a
 * viewer included, could rewrite the instructions of a private project they
 * were never shared on, unaudited. The PATCH now carries the PUT's authority
 * and audit, and these pin it to the same rules the PUT is held to above.
 */
describe('the ownership-preferences PATCH is held to the PUT’s authority and audit (IAM-31)', () => {
  const patch = (userId: number) =>
    request(app(userId)).patch('/api/concept2cure/projects/3/ownership-preferences')
      .send({ projectInstructions: 'Injected instructions for every AnA session' });
  const instructions = async () =>
    (await pg.query<{ c: string }>("SELECT settings->>'customInstructions' AS c FROM projects WHERE id=3")).rows[0].c;

  it('an organization member never shared on the private project is refused, and nothing changes', async () => {
    const res = await patch(10);
    expect([403, 404]).toContain(res.status);
    expect(await instructions()).toBe('Retain these reusable instructions');
    expect(await auditRows()).toHaveLength(0);
  });

  it.each([[8, 'a read ("use") share'], [9, 'a viewer with an edit share']])('user %s, %s, is refused, and nothing changes', async (userId) => {
    const res = await patch(userId as number);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(await instructions()).toBe('Retain these reusable instructions');
    expect(await auditRows()).toHaveLength(0);
  });

  it.each([true, false])('the owner may change them, and the change is audited (audit unavailable=%s)', async failed => {
    if (failed) await unavailableAudit();
    const res = await patch(7);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect(await instructions()).toBe('Injected instructions for every AnA session');
    expect(await auditRows()).toEqual(failed ? [] : [{ action: 'UPDATE', entity_id: '3' }]);
  });
});

/**
 * DP-80 (weekly review 2026-10-19). Visibility changes, member grants and
 * member removal were authorized (canManageProject) but wrote no audit row, so
 * a private project could be opened to the organization, or a member removed,
 * with nothing reviewable left behind. Each now records an UPDATE on the
 * project with the sharing state before and after, and discloses the outcome.
 */
describe('project sharing changes are audited, with what changed (DP-80)', () => {
  const rows = async () =>
    (await pg.query<{ action: string; entity_id: string; previous_value: unknown; new_value: unknown }>(
      'SELECT action, entity_id, previous_value, new_value FROM regulatory_audit_logs ORDER BY id')).rows;

  it.each([
    ['visibility opened to the organization', (a: ReturnType<typeof app>) => request(a).patch('/api/concept2cure/projects/3/sharing/visibility').send({ visibility: 'org_public' })],
    ['a member granted edit', (a: ReturnType<typeof app>) => request(a).put('/api/concept2cure/projects/3/sharing/members/10').send({ role: 'edit' })],
    ['a member removed', (a: ReturnType<typeof app>) => request(a).delete('/api/concept2cure/projects/3/sharing/members/8')],
  ])('%s writes an audited UPDATE with the state before and after', async (_label, send) => {
    const res = await send(app(7));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta?.auditTrail).toMatchObject({ persisted: true });
    const written = await rows();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ action: 'UPDATE', entity_id: '3' });
    const before = JSON.stringify(written[0].previous_value), after = JSON.stringify(written[0].new_value);
    expect(before).toMatch(/sharing/);
    expect(after, 'the row records no change in the sharing state').not.toBe(before);
  });

  it('an audit store that refuses the row is disclosed, not reported as recorded', async () => {
    await unavailableAudit();
    const res = await request(app(7)).patch('/api/concept2cure/projects/3/sharing/visibility').send({ visibility: 'org_public' });
    expect(res.status).toBe(200);
    expect(res.body.meta?.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
  });

  it('a caller who may not manage the project changes nothing and writes no row', async () => {
    // req.userRole is what production's authMiddleware re-reads from
    // organization_users on every request — never the token's claim — so user 8
    // is given the role it actually holds ('member'), not the harness's
    // default 'admin' claim, which would be an org manager.
    const res = await request(app(8, 9, 'member')).patch('/api/concept2cure/projects/3/sharing/visibility').send({ visibility: 'org_public' });
    expect(res.status).toBe(403);
    expect(await rows()).toHaveLength(0);
  });
});
