import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as PGlite | null, recordFails: false, commitReplyLost: false, revokeStanding: false, entries: [] as Record<string, any>[], release: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (req: { userId?: number; user?: unknown }, _res: unknown, next: () => void) => {
  req.userId = 41; req.user = { id: 41, organizationId: 1, role: 'admin' }; next();
} }));
vi.mock('../../db', () => ({
  query: (sql: string, params?: unknown[]) => state.db!.query(sql, params),
  pool: { connect: async () => {
    if (state.revokeStanding) await state.db!.exec('UPDATE platform_role_grants SET revoked_at = now()');
    return { release: state.release, query: async (sql: string, params?: unknown[]) => {
      const result = await state.db!.query(sql, params);
      if (sql === 'COMMIT' && state.commitReplyLost) throw new Error('Injected lost COMMIT response');
      return result;
    } };
  } },
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: async (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, entry: Record<string, any>) => {
  state.entries.push(entry);
  await client.query('INSERT INTO audit_probe (organization_id, actor_id, reason, action) VALUES ($1,$2,$3,$4)', [entry.tenantId, entry.userId, entry.reason, state.recordFails ? null : entry.action]);
} }));
let app: express.Express;
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec('CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations VALUES (1),(7);');
  await state.db.exec(readFileSync('db/migrations/20260609_scim_tenants.sql', 'utf8'));
  await state.db.exec(`CREATE TABLE platform_role_grants(id integer PRIMARY KEY, user_id integer, role text, revoked_at timestamp);
    CREATE TABLE audit_probe(organization_id integer, actor_id integer, reason text, action text NOT NULL);`);
  app = express(); app.use(express.json());
  app.use('/api/admin/scim-tenants', (await import('../../routes/admin/scim-tenants')).default);
}, 60_000);
beforeEach(async () => {
  state.recordFails = false; state.commitReplyLost = false; state.revokeStanding = false; state.entries = []; state.release.mockReset();
  await state.db!.exec(`TRUNCATE scim_tenants RESTART IDENTITY; TRUNCATE audit_probe; TRUNCATE platform_role_grants;
    INSERT INTO platform_role_grants VALUES (1,41,'platform_admin',NULL);`);
});
afterAll(async () => { await state.db?.close(); });
const reason = 'Approved identity provider setup';
const add = () => request(app).post('/api/admin/scim-tenants').send({ organizationId: 7, label: 'Approved IdP', reason });
const rows = async () => (await state.db!.query('SELECT * FROM scim_tenants')).rows as Array<Record<string, unknown>>;
const mutation = (kind: string) => kind === 'rotate' ? request(app).post('/api/admin/scim-tenants/1/rotate').send({ reason })
  : kind === 'update' ? request(app).patch('/api/admin/scim-tenants/1').send({ enabled: false, reason })
    : request(app).delete('/api/admin/scim-tenants/1').send({ reason });

describe('SCIM token changes and audit on real SQL', () => {
  it('records target organization, actor and reason, with no token material in audit or directory responses', async () => {
    const created = await add();
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const stored = (await rows())[0];
    expect(stored.token_hash).toBe(createHash('sha256').update(created.body.token).digest('hex'));
    expect(state.entries[0]).toMatchObject({ tenantId: 7, userId: 41, reason, action: 'scim_token_created' });
    expect(JSON.stringify(state.entries)).not.toContain(created.body.token);
    expect(JSON.stringify(state.entries)).not.toContain(String(stored.token_hash));
    const directory = await request(app).get('/api/admin/scim-tenants');
    expect(directory.body.tenants[0]).not.toHaveProperty('token');
    expect(directory.body.tenants[0]).not.toHaveProperty('token_hash');
  });
  it('rolls back credential creation when a real audit insert fails', async () => {
    state.recordFails = true;
    const response = await add();
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SCIM_TOKEN_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('token');
    expect(await rows()).toHaveLength(0);
  });
  it.each(['rotate', 'update', 'delete'])('preserves the original credential when %s cannot be recorded', async kind => {
    expect((await add()).status).toBe(201);
    const original = await rows(); state.recordFails = true;
    const response = await mutation(kind);
    expect(response.status).toBe(503);
    expect(response.body).not.toHaveProperty('token');
    expect(await rows()).toEqual(original);
    expect((await state.db!.query('SELECT * FROM audit_probe')).rows).toHaveLength(1);
  });
  it('commits rotation, disable and revocation with their audit entries and confirmed deletion headers', async () => {
    const issued = await add();
    const rotated = await mutation('rotate');
    expect(rotated.status).toBe(200);
    expect(rotated.body.token).not.toBe(issued.body.token);
    expect((await mutation('update')).body.enabled).toBe(false);
    const revoked = await mutation('delete');
    expect(revoked.status).toBe(204);
    expect(revoked.headers['x-audit-row-chained']).toBe('true');
    expect(await rows()).toHaveLength(0);
    expect(state.entries.map(entry => entry.action)).toEqual(['scim_token_created','scim_token_rotated','scim_token_updated','scim_token_revoked']);
  });
  it('refuses a grant revoked after the route guard, before writing a credential', async () => {
    state.revokeStanding = true;
    expect((await add()).status).toBe(503);
    expect(await rows()).toHaveLength(0);
    expect(state.entries).toHaveLength(0);
  });
  it('reports lost commit confirmation without claiming rollback or revealing the credential', async () => {
    state.commitReplyLost = true;
    const response = await add();
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SCIM_TOKEN_COMMIT_UNCONFIRMED');
    expect(response.body.error).not.toMatch(/nothing was changed/i);
    expect(response.body).not.toHaveProperty('token');
    expect(await rows()).toHaveLength(1);
    expect(state.release).toHaveBeenCalledWith(expect.any(Error));
  });
});
