/** Real platform-standing guard and route, with transactional policy state and audit failure injection. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  grant: true, auditFails: false, orgExists: true,
  row: null as null | { id: number; organization_id: number; cidr: string; label: string | null; enabled: boolean },
  log: [] as string[], entries: [] as Array<Record<string, any>>, clients: [] as unknown[],
}));
const original = { id: 11, organization_id: 7, cidr: '203.0.113.0/24', label: 'IdP egress', enabled: true };
vi.mock('../../auth', () => ({ authMiddleware: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
  req.user = { id: 41, role: 'super_admin', roles: ['super_admin'], organizationId: 1 }; req.userId = 41; next();
} }));
vi.mock('../../db', () => ({
  query: async (sql: string) => /FROM platform_role_grants/.test(sql) ? { rows: h.grant ? [{ id: 1 }] : [] } : { rows: [] },
  transaction: async (callback: (client: unknown) => Promise<unknown>) => {
    const previous = h.row ? { ...h.row } : null;
    const client = { query: async (sql: string, params: unknown[] = []) => {
      h.log.push(sql);
      if (/SELECT id FROM organizations/.test(sql)) return { rows: h.orgExists ? [{ id: Number(params[0]) }] : [] };
      if (/SELECT .*FROM scim_ip_allowlist/.test(sql)) return { rows: h.row?.id === params[0] ? [{ ...h.row }] : [] };
      if (/INSERT INTO scim_ip_allowlist/.test(sql)) h.row = { id: 12, organization_id: Number(params[0]), cidr: String(params[1]), label: params[2] as string | null, enabled: true };
      if (/UPDATE scim_ip_allowlist/.test(sql) && h.row) h.row = { ...h.row, enabled: Boolean(params[0]) };
      if (/DELETE FROM scim_ip_allowlist/.test(sql)) { const deleted = h.row; h.row = null; return { rows: deleted ? [{ id: deleted.id }] : [] }; }
      return { rows: h.row ? [{ ...h.row }] : [] };
    } };
    h.log.push('BEGIN');
    try { const answer = await callback(client); h.log.push('COMMIT'); return answer; }
    catch (error) { h.row = previous; h.log.push('ROLLBACK'); throw error; }
  },
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: async (client: unknown, entry: Record<string, any>) => {
  h.log.push('AUDIT'); h.entries.push(entry); h.clients.push(client);
  if (h.auditFails) throw new Error('Audit unavailable');
} }));
let app: express.Express;
beforeEach(async () => {
  h.grant = true; h.auditFails = false; h.orgExists = true; h.row = { ...original }; h.log = []; h.entries = []; h.clients = [];
  const router = (await import('../../routes/admin/scim-ip-allowlist')).default;
  app = express(); app.use(express.json()); app.use('/api/admin/scim-ip-allowlist', router);
});
const reason = 'Reviewed IdP network access';

describe('atomic governed SCIM IP policy mutations', () => {
  it('records the actual target organization, policy before/after and reason before committing a PATCH', async () => {
    const response = await request(app).patch('/api/admin/scim-ip-allowlist/11').send({ enabled: false, organizationId: 999, reason });
    expect(response.status).toBe(200);
    expect(response.body.auditTrail).toEqual({ persisted: true, chained: true });
    expect(h.row?.enabled).toBe(false);
    expect(h.entries[0]).toMatchObject({ tenantId: 7, userId: 41, resourceId: '11', reason,
      details: { organizationId: 7, previousPolicy: { enabled: true }, currentPolicy: { enabled: false } } });
    expect(h.log.slice(-2)).toEqual(['AUDIT', 'COMMIT']);
    expect(h.log.find((sql) => /UPDATE scim_ip_allowlist/.test(sql))).toMatch(/organization_id = \$3/);
  });

  it('records creation and deletion with the same atomic audit contract', async () => {
    h.row = null;
    const created = await request(app).post('/api/admin/scim-ip-allowlist').send({ organizationId: 7, cidr: '198.51.100.0/24', reason });
    expect(created.status).toBe(201); expect(created.body.auditTrail.persisted).toBe(true);
    expect(h.entries[0]).toMatchObject({ action: 'scim_ip_rule_created', reason, details: { previousPolicy: null } });
    const deleted = await request(app).delete('/api/admin/scim-ip-allowlist/12').send({ reason });
    expect(deleted.status).toBe(204); expect(h.row).toBeNull();
    expect(h.entries[1]).toMatchObject({ action: 'scim_ip_rule_deleted', reason, details: { currentPolicy: null } });
  });

  it.each(['create', 'update', 'delete'])('rolls back the %s when the chained audit write fails', async (action) => {
    h.auditFails = true;
    const response = action === 'create'
      ? await request(app).post('/api/admin/scim-ip-allowlist').send({ organizationId: 7, cidr: '198.51.100.0/24', reason })
      : action === 'update'
        ? await request(app).patch('/api/admin/scim-ip-allowlist/11').send({ enabled: false, reason })
        : await request(app).delete('/api/admin/scim-ip-allowlist/11').send({ reason });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/nothing was changed/i);
    expect(h.row).toEqual(original);
    expect(h.log.slice(-2)).toEqual(['AUDIT', 'ROLLBACK']);
    expect(h.log).not.toContain('COMMIT');
  });

  it('denies a tenant super_admin membership that has no active platform grant', async () => {
    h.grant = false;
    const response = await request(app).patch('/api/admin/scim-ip-allowlist/11').send({ enabled: false, reason });
    expect(response.status).toBe(403); expect(h.log).toEqual([]); expect(h.row).toEqual(original);
  });

  it.each(['x', '', 42, 'x'.repeat(501)])('rejects supplied invalid reason %j before any mutation', async (invalid) => {
    const response = await request(app).patch('/api/admin/scim-ip-allowlist/11').send({ enabled: false, reason: invalid });
    expect(response.status).toBe(400); expect(h.log).toEqual([]);
  });

  it('refuses creating a rule for a missing organization, without a policy or audit write', async () => {
    h.orgExists = false;
    const response = await request(app).post('/api/admin/scim-ip-allowlist').send({ organizationId: 999, cidr: '198.51.100.0/24', reason });
    expect(response.status).toBe(404); expect(h.entries).toEqual([]); expect(h.row).toEqual(original);
  });
});
