import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as PGlite | null, recordFails: false }));
vi.mock('../../auth', () => ({ authMiddleware: (req: { userId?: number; user?: unknown }, _res: unknown, next: () => void) => {
  req.userId = 41; req.user = { id: 41, organizationId: 7, role: 'admin' }; next();
} }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ requirePlatformAdmin: (_req: unknown, _res: unknown, next: () => void) => next(), isPlatformAdmin: () => true }));
vi.mock('../../db', () => ({
  query: (sql: string, params?: unknown[]) => state.db!.query(sql, params),
  pool: {connect: async () => ({query: (sql: string, params?: unknown[]) => state.db!.query(sql,params), release: vi.fn()})},
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: async (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, entry: { tenantId: number; userId: number; reason: string; action: string }) => {
  if (state.recordFails) throw new Error('Injected audit persistence failure');
  await client.query('INSERT INTO audit_probe (organization_id, actor_id, reason, action) VALUES ($1,$2,$3,$4)', [entry.tenantId, entry.userId, entry.reason, entry.action]);
} }));

let app: express.Express;
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec('CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations VALUES (7);');
  await state.db.exec(readFileSync('db/migrations/20260611_scim_ip_allowlist.sql', 'utf8'));
  await state.db.exec('CREATE TABLE audit_probe(organization_id integer, actor_id integer, reason text, action text);');
  app = express(); app.use(express.json());
  app.use('/api/admin/scim-ip-allowlist', (await import('../../routes/admin/scim-ip-allowlist')).default);
}, 60_000);
beforeEach(async () => { state.recordFails = false; await state.db!.exec('TRUNCATE scim_ip_allowlist RESTART IDENTITY; TRUNCATE audit_probe;'); });
afterAll(async () => { await state.db?.close(); });
const rows = async () => (await state.db!.query('SELECT * FROM scim_ip_allowlist')).rows;
const add = () => request(app).post('/api/admin/scim-ip-allowlist').send({ organizationId: 7, cidr: '203.0.113.0/24', reason: 'Approved IdP network' });

describe('SCIM rule and audit atomicity on real SQL', () => {
  it('commits the rule with actor, target organization and reason', async () => {
    expect((await add()).status).toBe(201);
    expect(await rows()).toHaveLength(1);
    expect((await state.db!.query('SELECT * FROM audit_probe')).rows).toEqual([{ organization_id: 7, actor_id: 41, reason: 'Approved IdP network', action: 'scim_ip_rule_created' }]);
  });
  it('rolls back a new policy when recording fails', async () => {
    state.recordFails = true;
    expect((await add()).status).toBe(503);
    expect(await rows()).toHaveLength(0);
  });
  it('retains the enabled policy if a disable or removal cannot be recorded', async () => {
    expect((await add()).status).toBe(201); state.recordFails = true;
    expect((await request(app).patch('/api/admin/scim-ip-allowlist/1').send({ enabled: false, reason: 'Network retired' })).status).toBe(503);
    expect((await rows())[0]).toMatchObject({ enabled: true });
    expect((await request(app).delete('/api/admin/scim-ip-allowlist/1').send({ reason: 'Network retired' })).status).toBe(503);
    expect(await rows()).toHaveLength(1);
    expect((await state.db!.query('SELECT * FROM audit_probe')).rows).toHaveLength(1);
  });
});
