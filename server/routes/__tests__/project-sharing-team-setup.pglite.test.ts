/** Actual route/SQL with substituted auth and PGlite; native RLS/locking is separate. */
import { readFile } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../../shared/schema';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, db: null as PgliteDatabase | null }));
vi.mock('../../db', () => ({ get db() { return h.db; }, pool: {
  query: (sql: string, params?: unknown[]) => h.pg!.query(sql, params),
  connect: async () => ({ query: (sql: string, params?: unknown[]) => h.pg!.query(sql, params), release() {} }),
} }));
vi.mock('../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../middleware/tenantContext', () => ({ tenantContextMiddleware: (_q: unknown, _s: unknown, next: () => void) => next(),
  requireOrganizationContext: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../middleware/enterprise-performance', () => ({ cacheResponse: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
import routes from '../concept2cure';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let pg: PGlite;
let failMembers = false;
let loseCommit = false;
let archiveOnRoster = false;
let zeroWrite: 'visibility' | 'revoke' | null = null;
const discard = vi.fn();
const statements: string[] = [];
function app(userId = 5, claimedRole = 'admin', workspace = 1, pinned = true) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { userId, userRole: claimedRole, userEmail: 'actor@example.test',
      user: { id: userId, organizationId: 7, role: claimedRole },
      tenantContext: { organizationId: 7, clientWorkspaceId: workspace },
      ...(pinned ? { dbClient: { discard, async query(sql: string, params?: unknown[]) {
        statements.push(sql);
        if (failMembers && sql.includes('project-sharing:members')) throw Object.assign(new Error('private missing store'), { code: '42P01' });
        if (archiveOnRoster && sql.startsWith('SELECT u.id,u.name,u.email,ou.role FROM organization_users')) {
          archiveOnRoster = false;
          await pg.exec("UPDATE projects SET status='archived' WHERE id=101");
        }
        if ((zeroWrite === 'visibility' && sql.startsWith('INSERT INTO project_visibility_settings')) ||
            (zeroWrite === 'revoke' && sql.startsWith('UPDATE project_members'))) return { rows: [] };
        const result = await pg.query(sql, params);
        if (loseCommit && sql === 'COMMIT') throw new Error('Acknowledgement lost');
        return result;
      } } } : {}),
    }); next();
  }); a.use('/api/concept2cure', routes); return a;
}
const path = (id = 101, program = A) => `/api/concept2cure/projects/${id}/sharing?programId=${program}`;
const memberPath = (id: number, project = 101, program = A) => `/api/concept2cure/projects/${project}/sharing/members/${id}?programId=${program}`;

beforeAll(async () => {
  pg = new PGlite(); h.pg = pg; h.db = drizzle(pg);
  const base = await readFile('migrations/0000_sweet_joseph.sql', 'utf8');
  for (const table of [schema.organizations, schema.users, schema.organizationUsers, schema.clientWorkspaces, schema.projects, schema.regulatoryAuditLogs]) {
    const cfg = getTableConfig(table);
    const ddl = base.match(new RegExp(`CREATE TABLE "${cfg.name}" \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!ddl) throw new Error(`Canonical DDL missing: ${cfg.name}`);
    await pg.exec(ddl);
    const columns = new Set((await pg.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [cfg.name])).rows.map(r => r.column_name));
    for (const column of cfg.columns) if (!columns.has(column.name)) await pg.exec(`ALTER TABLE "${cfg.name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`);
  }
  await pg.exec(await readFile('db/migrations/20260401_project_sharing_visibility.sql', 'utf8'));
  await pg.exec(`CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz);
    CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments(artifact_id integer,reviewer_id integer,organization_id integer,status text);
    INSERT INTO organizations(id,name,slug,status) VALUES(7,'Seven','seven','active'),(8,'Eight','eight','active');
    INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES(1,7,'First client','first'),(2,7,'Second client','second');`);
  for (const id of [5, 6, 7, 8, 9, 11]) await pg.query("INSERT INTO users(id,name,email,password_hash,status) VALUES($1,'Same Name',$2,'fixture','active')", [id, `member${id}@example.test`]);
}, 60_000);
beforeEach(async () => {
  failMembers = false; loseCommit = false; archiveOnRoster = false; zeroWrite = null; discard.mockReset(); statements.length = 0;
  await pg.exec(`ALTER TABLE regulatory_audit_logs DROP CONSTRAINT IF EXISTS pm04_audit_refused;
    DELETE FROM regulatory_audit_logs; DELETE FROM project_members; DELETE FROM project_visibility_settings; DELETE FROM projects; DELETE FROM regulatory_programs;
    DELETE FROM organization_users; UPDATE users SET status='active'; UPDATE organizations SET status='active';
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(7,9,'viewer'),(8,11,'member');
    INSERT INTO regulatory_programs VALUES('${A}',7,NULL),('${B}',7,NULL);
    INSERT INTO projects(id,organization_id,client_workspace_id,regulatory_program_id,name,type,status,owner_id,created_by_id,settings)
      VALUES(101,7,1,'${A}','First','IND','active',5,5,'{}'),(202,7,2,'${B}','Second','IND','active',9,9,'{}');
    INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(101,7,'private'),(202,7,'private');
    INSERT INTO project_members(project_id,organization_id,user_id,role,status,invited_by_id,accepted_at)
      VALUES(101,7,6,'use','active',5,'2026-01-01'),(101,7,8,'edit','active',5,'2026-01-02');`);
});
afterAll(async () => { await pg?.close(); });

describe('current management read and membership setup', () => {
  it('binds current actor, UUID, anchor and workspace and disambiguates only real active candidates', async () => {
    const r = await request(app(5, 'viewer')).get(path());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ projectId: 'proj_101', programId: A, organizationId: 7, clientWorkspaceId: 1, actorUserId: 5, canManage: true });
    expect(r.body.data.candidates.map((m: { userId: number }) => m.userId)).toEqual([5, 6, 7, 8, 9]);
    expect(new Set(r.body.data.candidates.map((m: { label: string }) => m.label)).size).toBe(5);
    expect(r.body.data.members.find((m: { userId: number }) => m.userId === 5)).toMatchObject({ explicit: false, implicitSources: ['project_owner', 'project_creator'], canRevoke: false, canSetRole: false });
  });
  it('exposes no candidate directory or controls to an admitted reader with a stale admin claim', async () => {
    const r = await request(app(6)).get(path());
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ canManage: false, candidates: [] });
    expect(r.body.data.members.every((m: { canRevoke: boolean; canSetRole: boolean }) => !m.canRevoke && !m.canSetRole)).toBe(true);
  });
  it('refuses stale management controls when the project is archived during the roster read', async () => {
    archiveOnRoster = true;
    const r = await request(app()).get(path());
    expect(r.status, JSON.stringify(r.body)).toBe(503);
    expect(r.body.error.code).toBe('PROJECT_ACCESS_CHANGED');
    expect(r.body.data).toBeUndefined();
  });
  it('grants a current account despite a stale viewer claim and records the existing audit outcome', async () => {
    const r = await request(app(5, 'viewer')).put(memberPath(7)).send({ role: 'edit' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta.auditTrail.persisted).toBe(true);
    expect((await pg.query('SELECT user_id,role,status,invited_by_id FROM project_members WHERE project_id=101 AND user_id=7')).rows)
      .toEqual([{ user_id: 7, role: 'edit', status: 'active', invited_by_id: 5 }]);
  });
  it('revokes in place and removes subsequent private read access without erasing attribution', async () => {
    const before = (await pg.query<Record<string, unknown>>('SELECT * FROM project_members WHERE project_id=101 AND user_id=6')).rows[0];
    const r = await request(app()).delete(memberPath(6));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = (await pg.query<Record<string, unknown>>('SELECT * FROM project_members WHERE project_id=101 AND user_id=6')).rows[0];
    expect(after).toMatchObject({ ...before, status: 'revoked', updated_at: expect.anything() });
    expect([403, 404]).toContain((await request(app(6)).get(path())).status);
    expect((await request(app()).delete(memberPath(6))).status).toBe(409);
  });
  it('allows revocation of a departed account without restoring or exposing its identity', async () => {
    await pg.exec('DELETE FROM organization_users WHERE user_id=8');
    const r = await request(app()).delete(memberPath(8));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await pg.query('SELECT status FROM project_members WHERE project_id=101 AND user_id=8')).rows).toEqual([{ status: 'revoked' }]);
  });
});

describe('sharing refuses bypasses and ambiguous results', () => {
  it('denies a read-only owner on member and visibility operations despite a stale administrator claim', async () => {
    expect((await request(app(9, 'admin', 2)).put(memberPath(7, 202, B)).send({ role: 'edit' })).status).toBe(403);
    expect((await request(app(9, 'admin', 2)).patch(`/api/concept2cure/projects/202/sharing/visibility?programId=${B}`).send({ visibility: 'org_public' })).status).toBe(403);
  });
  it('denies an ordinary reader attempting to grant access with a stale administrator claim', async () => {
    expect((await request(app(6)).put(memberPath(7)).send({ role: 'use' })).status).toBe(403);
  });
  it.each([8, 11])('refuses inactive or foreign grant recipient %i', async id => {
    await pg.exec("UPDATE users SET status='inactive' WHERE id=8");
    expect((await request(app()).put(memberPath(id)).send({ role: 'edit' })).status).toBe(403);
  });
  it('refuses wrong UUID anchors and a second client workspace', async () => {
    expect((await request(app(5, 'admin', 2)).get(path(202, A))).status).toBe(409);
    expect((await request(app(5, 'admin', 2)).get(path())).status).toBe(403);
  });
  it('protects implicit ownership and refuses archived writes', async () => {
    expect((await request(app()).delete(memberPath(5))).status).toBe(409);
    expect((await request(app()).put(memberPath(5)).send({ role: 'use' })).status).toBe(409);
    await pg.exec("UPDATE projects SET status='archived' WHERE id=101");
    expect((await request(app()).put(memberPath(7)).send({ role: 'use' })).status).toBe(409);
    const r = await request(app()).get(path());
    expect(r.body.data).toMatchObject({ canManage: false, candidates: [] });
  });
  it('reports missing stores and missing request clients as unavailable without a pool fallback', async () => {
    failMembers = true;
    expect((await request(app()).get(path())).status).toBe(503);
    failMembers = false;
    expect((await request(app(5, 'admin', 1, false)).get(path())).status).toBe(503);
  });
  it.each(['visibility', 'revoke'] as const)('does not acknowledge a zero-row %s write', async kind => {
    zeroWrite = kind;
    const r = kind === 'revoke' ? await request(app()).delete(memberPath(6))
      : await request(app()).patch(`${path().split('?')[0]}/visibility?programId=${A}`).send({ visibility: 'org_public' });
    expect(r.status, JSON.stringify(r.body)).toBe(503);
    expect(statements).toContain('ROLLBACK');
    expect((await pg.query('SELECT status FROM project_members WHERE user_id=6')).rows).toEqual([{ status: 'active' }]);
    expect((await pg.query('SELECT visibility FROM project_visibility_settings WHERE project_id=101')).rows).toEqual([{ visibility: 'private' }]);
  });
  it('preserves existing truthful best-effort audit failure metadata after a committed grant', async () => {
    await pg.exec('ALTER TABLE regulatory_audit_logs ADD CONSTRAINT pm04_audit_refused CHECK(false) NOT VALID');
    const r = await request(app()).put(memberPath(7)).send({ role: 'use' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect((await pg.query('SELECT status FROM project_members WHERE user_id=7')).rows).toEqual([{ status: 'active' }]);
  });
  it('does not claim rollback after a committed grant loses its acknowledgement', async () => {
    loseCommit = true;
    const r = await request(app()).put(memberPath(7)).send({ role: 'use' });
    expect(r.status, JSON.stringify(r.body)).toBe(503);
    expect(r.body.error.code).toBe('PROJECT_SHARING_UNCONFIRMED');
    expect(r.body.error.message).not.toMatch(/nothing was changed/i);
    expect(discard).toHaveBeenCalledOnce();
    expect(statements.slice(statements.lastIndexOf('COMMIT') + 1)).not.toContain('ROLLBACK');
    expect((await pg.query('SELECT status FROM project_members WHERE user_id=7')).rows).toEqual([{ status: 'active' }]);
  });
});
