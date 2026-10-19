import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const DOC_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_DOC_ID = '10000000-0000-4000-8000-000000000002';
const SECTION_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_SECTION_ID = '20000000-0000-4000-8000-000000000002';
const OWNER_PERMISSION_ID = '30000000-0000-4000-8000-000000000001';
const TARGET_PERMISSION_ID = '30000000-0000-4000-8000-000000000002';

type Permission = {
  id: string; doc_id: string; section_id: string | null; tenant_id: number;
  principal_id: string; email: string | null; role: string; granted_by: string;
  grant_reason: string | null; valid_from: string; valid_until: string | null;
  revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null;
};
type Statement = { source: 'pool' | 'client'; sql: string; params: unknown[] };

const h = vi.hoisted(() => ({
  user: { id: 11, organizationId: 7, email: 'owner@example.test', roles: ['MEMBER'] } as Record<string, unknown> | null,
  documents: [] as Array<{ doc_id: string; tenant_id: number; status: string; created_by: string }>,
  sections: [] as Array<{ section_id: string; doc_id: string; tenant_id: number; status: string; created_by: string }>,
  members: [] as Array<{ organization_id: number; principal_id: string; email: string }>,
  permissions: [] as Permission[],
  statements: [] as Statement[],
  events: [] as string[],
  audited: [] as Record<string, unknown>[],
  auditFails: false,
}));

const active = (p: Permission) => !p.revoked_at
  && Date.parse(p.valid_from) <= Date.now()
  && (!p.valid_until || Date.parse(p.valid_until) > Date.now());

const countOwners = (params: unknown[], documentOwnersOnly: boolean) => h.permissions.filter(p =>
  p.tenant_id === params[0] && p.doc_id === params[1] && p.role === 'OWNER' && active(p)
  && (!documentOwnersOnly || p.section_id === null)).length;

/**
 * Exercise the production permission helpers, including their owner and
 * section-scope checks. This SQL double models scoped rows and transaction
 * rollback; canonical DDL is covered by authoring-object-permissions.integration.
 * Unknown statements fail so a new persistence path cannot silently pass.
 */
async function query(source: Statement['source'], sql: string, params: unknown[] = []) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  h.statements.push({ source, sql: normalized, params });
  const rows = (values: unknown[]) => ({ rows: values, rowCount: values.length });
  if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) {
    h.events.push(normalized.toUpperCase());
    return rows([]);
  }
  if (/FROM authoring_sections s\b/i.test(normalized)) {
    h.events.push('section.scope');
    return rows(h.sections.filter(s => s.section_id === params[0] && s.tenant_id === params[1]));
  }
  if (/FROM authoring_documents\b/i.test(normalized)) {
    h.events.push(/FOR UPDATE/i.test(normalized) ? 'document.lock' : 'document.scope');
    return rows(h.documents.filter(d => d.doc_id === params[0] && d.tenant_id === params[1]));
  }
  if (/FROM users u\b/i.test(normalized) && /JOIN organization_users ou\b/i.test(normalized)) {
    h.events.push('member.scope');
    return rows(h.members.filter(m => m.organization_id === params[0] && m.principal_id === params[1]));
  }
  if (/FROM doc_permissions p\b/i.test(normalized)) {
    h.events.push('manager.check');
    return rows(h.permissions.filter(p => p.tenant_id === params[0] && p.doc_id === params[1]
      && active(p) && p.section_id === null
      && (p.principal_id === params[2] || (params[3] != null && p.email?.toLowerCase() === String(params[3]).toLowerCase()))));
  }
  return permissionQuery(normalized, params);
}

function permissionQuery(normalized: string, params: unknown[]) {
  const rows = (values: unknown[]) => ({ rows: values, rowCount: values.length });
  if (/SELECT COUNT\(\*\)/i.test(normalized) && /FROM doc_permissions\b/i.test(normalized)) {
    h.events.push('owner.count');
    return rows([{ count: countOwners(params, /section_id IS NULL/i.test(normalized)) }]);
  }
  if (/SELECT .+ FROM doc_permissions\b/i.test(normalized)) {
    if (/WHERE id = \$1/i.test(normalized)) {
      h.events.push('revoke.candidate');
      return rows(h.permissions.filter(p => p.id === params[0] && p.tenant_id === params[1]
        && p.doc_id === params[2] && !p.revoked_at));
    }
    if (/principal_id = \$3/i.test(normalized)) {
      h.events.push('grant.existing');
      return rows(h.permissions.filter(p => p.tenant_id === params[0] && p.doc_id === params[1]
        && p.principal_id === params[2] && p.role === params[3] && p.section_id === params[4] && !p.revoked_at));
    }
    h.events.push('permissions.list');
    return rows(h.permissions.filter(p => p.tenant_id === params[0] && p.doc_id === params[1]));
  }
  if (/INSERT INTO doc_permissions\b/i.test(normalized)) {
    h.events.push('grant.insert');
    const permission: Permission = {
      id: TARGET_PERMISSION_ID, doc_id: String(params[0]), section_id: params[1] as string | null,
      tenant_id: Number(params[2]), principal_id: String(params[3]), email: params[4] as string | null,
      role: String(params[5]), granted_by: String(params[6]), grant_reason: params[7] as string | null,
      valid_from: new Date(Date.now() - 1000).toISOString(), valid_until: params[8] as string | null,
      revoked_at: null, revoked_by: null, revoke_reason: null,
    };
    h.permissions.push(permission);
    return rows([permission]);
  }
  if (/UPDATE doc_permissions\b/i.test(normalized)) {
    h.events.push('revoke.update');
    const permission = h.permissions.find(p => p.id === params[0] && p.tenant_id === params[1]
      && p.doc_id === params[2] && !p.revoked_at);
    if (!permission) return rows([]);
    permission.revoked_at = new Date().toISOString();
    permission.revoked_by = String(params[3]);
    permission.revoke_reason = String(params[4]);
    return rows([permission]);
  }
  throw new Error(`Unmodeled permission-management SQL: ${normalized}`);
}

const client = { query: vi.fn((sql: string, params?: unknown[]) => query('client', sql, params)) };
const pool = { query: vi.fn((sql: string, params?: unknown[]) => query('pool', sql, params)) };
const transaction = vi.fn(async (callback: (tx: typeof client) => Promise<unknown>) => {
  const permissionsBefore = h.permissions.map(row => ({ ...row }));
  const auditBefore = h.audited.map(row => ({ ...row }));
  await client.query('BEGIN');
  try {
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    h.permissions = permissionsBefore;
    h.audited = auditBefore;
    await client.query('ROLLBACK');
    throw error;
  }
});
vi.mock('../../db', () => ({ getPool: () => pool, transaction }));

const writeChainedAuditRow = vi.fn(async (tx: unknown, entry: Record<string, unknown>) => {
  expect(tx).toBe(client);
  h.events.push(String(entry.action));
  if (h.auditFails) throw new Error('audit persistence unavailable');
  h.audited.push(entry);
});
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow }));
vi.mock('../../utils/logger', () => ({ createScopedLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) }));

let app: express.Express;
beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: h.user });
    next();
  });
  app.use('/api', (await import('../authoring-permissions')).default);
});

function permission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: OWNER_PERMISSION_ID, doc_id: DOC_ID, section_id: null, tenant_id: 7,
    principal_id: '11', email: 'owner@example.test', role: 'OWNER', granted_by: '11',
    grant_reason: 'Document creator', valid_from: '2026-01-01T00:00:00.000Z', valid_until: null,
    revoked_at: null, revoked_by: null, revoke_reason: null, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 11, organizationId: 7, email: 'owner@example.test', roles: ['MEMBER'] };
  h.documents = [
    { doc_id: DOC_ID, tenant_id: 7, status: 'draft', created_by: '11' },
    { doc_id: OTHER_DOC_ID, tenant_id: 8, status: 'draft', created_by: '88' },
  ];
  h.sections = [
    { section_id: SECTION_ID, doc_id: DOC_ID, tenant_id: 7, status: 'draft', created_by: '11' },
    { section_id: OTHER_SECTION_ID, doc_id: OTHER_DOC_ID, tenant_id: 8, status: 'draft', created_by: '88' },
  ];
  h.members = [
    { organization_id: 7, principal_id: '22', email: 'reviewer@example.test' },
    { organization_id: 8, principal_id: '88', email: 'foreign@example.test' },
  ];
  h.permissions = [permission()];
  h.statements = []; h.events = []; h.audited = []; h.auditFails = false;
});

const path = `/api/authoring/docs/${DOC_ID}/permissions`;
const grantBody = () => ({ principalId: '22', role: 'REVIEWER', reason: 'Assign the clinical document reviewer.' });
const grant = (body: Record<string, unknown> = grantBody(), url = path) => request(app).post(url).send(body);
const revoke = (id = TARGET_PERMISSION_ID, body: Record<string, unknown> = { reason: 'The reviewer has left this project.' }) => request(app).delete(`${path}/${id}`).send(body);
const noMutation = () => {
  expect(h.events).not.toContain('grant.insert');
  expect(h.events).not.toContain('revoke.update');
  expect(writeChainedAuditRow).not.toHaveBeenCalled();
  expect(h.events).not.toContain('COMMIT');
};

describe('authoring permission management authority and scope', () => {
  it('requires an authenticated principal and organization for reads and writes', async () => {
    for (const user of [null, { organizationId: 7 }, { id: 11 }]) {
      h.user = user;
      expect((await request(app).get(path)).status).toBe(401);
      expect((await grant()).status).toBe(401);
      expect((await revoke()).status).toBe(401);
    }
    expect(h.statements).toHaveLength(0);
    noMutation();
  });

  it.each(['AUTHOR', 'REVIEWER', 'APPROVER', 'VIEWER'])('refuses %s grants and revokes without document-owner authority', async role => {
    h.permissions = [permission({ role })];
    h.user = { ...h.user, roles: ['QA', 'RA'] };
    expect((await request(app).get(path)).status).toBe(403);
    expect((await grant()).status).toBe(403);
    expect((await revoke()).status).toBe(403);
    noMutation();
  });

  it('allows owners and administrators to read tenant-scoped permission history', async () => {
    const owner = await request(app).get(path);
    expect(owner.status).toBe(200);
    expect(owner.body.permissions).toEqual([expect.objectContaining({ id: OWNER_PERMISSION_ID, tenant_id: 7 })]);
    h.user = { ...h.user, roles: ['ADMIN'] };
    h.permissions = [];
    expect((await request(app).get(path)).status).toBe(200);
    expect(writeChainedAuditRow).not.toHaveBeenCalled();
  });

  it('refuses a foreign tenant document even to an administrator', async () => {
    h.user = { ...h.user, roles: ['ADMIN'] };
    const foreignPath = `/api/authoring/docs/${OTHER_DOC_ID}/permissions`;
    expect((await request(app).get(foreignPath)).status).toBe(404);
    expect((await grant(grantBody(), foreignPath)).status).toBe(404);
    noMutation();
  });

  it('ignores spoofed tenant, granting actor, and email from the body', async () => {
    const res = await grant({ ...grantBody(), organizationId: 8, tenantId: 8, grantedBy: '88', email: 'victim@example.test' });
    expect(res.status).toBe(201);
    expect(res.body.permission).toMatchObject({ tenant_id: 7, principal_id: '22', granted_by: '11', email: 'reviewer@example.test' });
    expect(h.audited).toEqual([expect.objectContaining({ userId: '11', tenantId: 7,
      details: expect.objectContaining({ principalId: '22', email: 'reviewer@example.test' }) })]);
    const memberRead = h.statements.find(s => /JOIN organization_users ou\b/i.test(s.sql));
    expect(memberRead?.source).toBe('client');
    expect(memberRead?.params).toEqual([7, '22']);
    expect(memberRead?.sql).toMatch(/ou\.organization_id = \$1\b/i);
    expect(memberRead?.sql).toMatch(/u\.id::text = \$2\b/i);
    expect(memberRead?.sql).toMatch(/FOR SHARE OF ou\b/i);
  });

  it('refuses a principal who exists only in a different organization', async () => {
    const res = await grant({ ...grantBody(), principalId: '88', organizationId: 8 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUTHORING_PERMISSION_MEMBER_REQUIRED');
    noMutation();
    expect(h.permissions).toHaveLength(1);
    expect(h.events).toContain('ROLLBACK');
  });

  it.each([
    ['another tenant', OTHER_SECTION_ID],
    ['a missing section', '20000000-0000-4000-8000-000000000099'],
  ])('refuses a section in %s without mutation or audit', async (_label, sectionId) => {
    const res = await grant({ ...grantBody(), sectionId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SECTION_SCOPE_MISMATCH');
    noMutation();
    expect(h.events).toContain('ROLLBACK');
  });

  it('refuses a section belonging to another document in the same tenant', async () => {
    h.sections.push({ section_id: OTHER_SECTION_ID, doc_id: OTHER_DOC_ID, tenant_id: 7, status: 'draft', created_by: '11' });
    const res = await grant({ ...grantBody(), sectionId: OTHER_SECTION_ID });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SECTION_SCOPE_MISMATCH');
    noMutation();
  });
});

describe('authoring permission input validation', () => {
  it.each([
    {}, { principalId: '', role: 'REVIEWER', reason: 'Review assignment' },
    { principalId: '22', role: 'QA', reason: 'Review assignment' },
    { principalId: '22', role: 'REVIEWER' },
    { principalId: '22', role: 'REVIEWER', reason: '   ' },
    { principalId: '22', role: 'REVIEWER', reason: 'a'.repeat(501) },
  ])('rejects a malformed grant %j', async body => {
    expect((await grant(body)).status).toBe(400);
    noMutation();
  });

  it.each(['not-a-date', '2026-01-01T00:00:00.000Z', '2999-01-01'])('rejects malformed, expired, or non-ISO expiry %s', async validUntil => {
    const res = await grant({ ...grantBody(), validUntil });
    expect(res.status).toBe(400);
    noMutation();
  });

  it.each([{}, { reason: ' ' }, { reason: 'a'.repeat(501) }])('requires a reason for revocation %j', async body => {
    expect((await revoke(OWNER_PERMISSION_ID, body)).status).toBe(400);
    noMutation();
  });

  it('persists a normalized role, trimmed reason, valid expiry, and requested section', async () => {
    const validUntil = new Date(Date.now() + 86_400_000).toISOString();
    const res = await grant({ principalId: ' 22 ', role: ' reviewer ', reason: ' Section review assignment. ', validUntil, sectionId: SECTION_ID });
    expect(res.status).toBe(201);
    expect(res.body.permission).toMatchObject({ principal_id: '22', role: 'REVIEWER', grant_reason: 'Section review assignment.', valid_until: validUntil, section_id: SECTION_ID });
  });
});

describe('authoring permission changes and audit commit together', () => {
  it('locks the document and verifies authority on the mutation client before granting and auditing', async () => {
    const res = await grant();
    expect(res.status).toBe(201);
    expect(res.body.auditTrail).toMatchObject({ persisted: true, chained: true });
    expect(h.events.indexOf('BEGIN')).toBeLessThan(h.events.indexOf('document.lock'));
    expect(h.events.indexOf('document.lock')).toBeLessThan(h.events.indexOf('manager.check'));
    expect(h.events.indexOf('manager.check')).toBeLessThan(h.events.indexOf('grant.insert'));
    expect(h.events.indexOf('grant.insert')).toBeLessThan(h.events.indexOf('authoring.permission.grant'));
    expect(h.events.indexOf('authoring.permission.grant')).toBeLessThan(h.events.indexOf('COMMIT'));
    expect(h.statements.every(s => s.source === 'client')).toBe(true);
    expect(h.events).not.toContain('ROLLBACK');
  });

  it('rolls back a grant when the chained audit cannot persist', async () => {
    h.auditFails = true;
    const res = await grant();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AUTHORING_AUTHORIZATION_UNAVAILABLE');
    expect(h.permissions).toEqual([permission()]);
    expect(h.audited).toEqual([]);
    expect(h.events.indexOf('grant.insert')).toBeLessThan(h.events.indexOf('authoring.permission.grant'));
    expect(h.events.indexOf('authoring.permission.grant')).toBeLessThan(h.events.indexOf('ROLLBACK'));
    expect(h.events).not.toContain('COMMIT');
  });

  it('revokes and audits on the same client before commit with server attribution', async () => {
    h.permissions.push(permission({ id: TARGET_PERMISSION_ID, principal_id: '22', role: 'REVIEWER', email: 'reviewer@example.test' }));
    const res = await revoke(TARGET_PERMISSION_ID, { reason: '  Reviewer reassigned.  ', revokedBy: '88', tenantId: 8 });
    expect(res.status).toBe(200);
    expect(res.body.permission).toMatchObject({ revoked_by: '11', revoke_reason: 'Reviewer reassigned.' });
    expect(res.body.permission.revoked_at).toBeTruthy();
    expect(h.events.indexOf('document.lock')).toBeLessThan(h.events.indexOf('manager.check'));
    expect(h.events.indexOf('manager.check')).toBeLessThan(h.events.indexOf('revoke.update'));
    expect(h.events.indexOf('revoke.update')).toBeLessThan(h.events.indexOf('authoring.permission.revoke'));
    expect(h.events.indexOf('authoring.permission.revoke')).toBeLessThan(h.events.indexOf('COMMIT'));
    expect(h.statements.every(s => s.source === 'client')).toBe(true);
    expect(h.audited).toEqual([expect.objectContaining({ userId: '11', tenantId: 7, reason: 'Reviewer reassigned.' })]);
  });

  it('rolls back a revocation when its audit cannot persist', async () => {
    const target = permission({ id: TARGET_PERMISSION_ID, principal_id: '22', role: 'REVIEWER' });
    h.permissions.push(target);
    h.auditFails = true;
    const res = await revoke();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AUTHORING_AUTHORIZATION_UNAVAILABLE');
    expect(h.permissions.find(p => p.id === TARGET_PERMISSION_ID)).toEqual(permission({ id: TARGET_PERMISSION_ID, principal_id: '22', role: 'REVIEWER' }));
    expect(h.audited).toEqual([]);
    expect(h.events.indexOf('revoke.update')).toBeLessThan(h.events.indexOf('authoring.permission.revoke'));
    expect(h.events.indexOf('authoring.permission.revoke')).toBeLessThan(h.events.indexOf('ROLLBACK'));
    expect(h.events).not.toContain('COMMIT');
  });

  it('refuses removal of the last active document owner without an audit or write', async () => {
    const res = await revoke(OWNER_PERMISSION_ID);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTHORING_LAST_OWNER_REQUIRED');
    noMutation();
    expect(h.permissions[0].revoked_at).toBeNull();
    expect(h.events).toContain('ROLLBACK');
  });

  it('does not let another section owner satisfy the last document-owner requirement', async () => {
    h.permissions.push(permission({ id: TARGET_PERMISSION_ID, principal_id: '22', section_id: SECTION_ID }));
    const res = await revoke(OWNER_PERMISSION_ID);
    expect(res.status).toBe(409);
    noMutation();
  });

  it('allows revoking a section owner while retaining the sole document owner', async () => {
    h.permissions.push(permission({ id: TARGET_PERMISSION_ID, principal_id: '22', section_id: SECTION_ID }));
    const res = await revoke();
    expect(res.status).toBe(200);
    expect(res.body.permission).toMatchObject({ id: TARGET_PERMISSION_ID, role: 'OWNER', section_id: SECTION_ID });
    expect(res.body.permission.revoked_at).toBeTruthy();
    expect(h.permissions.find(p => p.id === OWNER_PERMISSION_ID)?.revoked_at).toBeNull();
    expect(writeChainedAuditRow).toHaveBeenCalledTimes(1);
    expect(h.events).toContain('COMMIT');
  });

  it('does not count an expired owner as a replacement for the active document owner', async () => {
    h.permissions.push(permission({ id: TARGET_PERMISSION_ID, principal_id: '22', valid_until: '2026-01-01T00:00:00.000Z' }));
    const res = await revoke(OWNER_PERMISSION_ID);
    expect(res.status).toBe(409);
    noMutation();
    expect(h.permissions[0].revoked_at).toBeNull();
  });

  it('returns not found for a foreign or nonexistent permission without audit', async () => {
    h.permissions.push(permission({ id: TARGET_PERMISSION_ID, tenant_id: 8, doc_id: OTHER_DOC_ID, principal_id: '88' }));
    const res = await revoke();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AUTHORING_PERMISSION_NOT_FOUND');
    noMutation();
    expect(h.events).toContain('ROLLBACK');
  });
});
