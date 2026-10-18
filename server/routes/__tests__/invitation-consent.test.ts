/**
 * W1 / D2: an invitee sees only their own inviting organizations and answers
 * invitations with one chained audit row on the mutation transaction. This
 * recorder proves SQL/actor/scope/order; PostgreSQL RLS is covered separately
 * by tests/db/invitation-acceptance.dbtest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { getTenantScope, runWithTenantScope } from '../../db/tenantStore';

type Invitation = {
  id: number;
  organization_id: number;
  user_id: number;
  email: string;
  role: string | null;
  status: string;
};
type QueryRecord = { sql: string; params: unknown[]; client: unknown; tenantId?: string; role?: string | null };
type RecordedClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
  release: () => void;
  pendingStatus?: string;
  pendingRole?: string;
};

/** The compatibility '*.js' declaration exposes only a default export. */
async function loadInvitationService() {
  return (await import('../../services/atomicQuotaService.js')) as unknown as {
    atomicAcceptInvitation: (
      invitationId: number,
      callerUserId: number,
      auditContext?: { ipAddress?: string; userAgent?: string },
    ) => Promise<{
      success: boolean;
      error?: string;
      data?: Record<string, unknown>;
      auditTrail?: { persisted: true; chained: true };
    }>;
  };
}

const h = vi.hoisted(() => ({
  callerId: 42 as number | null,
  invitations: [] as Invitation[],
  queries: [] as QueryRecord[],
  order: [] as string[],
  clients: [] as RecordedClient[],
  auditCalls: [] as Array<{ client: unknown; entry: Record<string, unknown>; tenantId?: string; role?: string | null }>,
  auditFails: false,
  nameFails: false,
  names: new Map<number, string>(),
  memberRole: null as string | null,
  memberCount: 1,
  maxUsers: 5,
  declineRace: false,
  authenticatedUsers: [] as Array<{ id: number; organizationId: number; role: string }>,
}));

const SESSION_ORG = 111;
const INVITING_ORG = 777;
const OTHER_ORG = 888;
const CALLER = 42;
const OTHER = 99;
const INVITATION = 31;
const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const answer = (rows: Array<Record<string, unknown>>, rowCount = rows.length) => ({ rows, rowCount });

function transactionResult(text: string, client?: RecordedClient) {
  if (/^BEGIN$/.test(text)) return answer([]);
  if (/^ROLLBACK$/.test(text)) {
    if (client) { delete client.pendingStatus; delete client.pendingRole; }
    return answer([]);
  }
  if (/^COMMIT$/.test(text)) {
    const invitation = h.invitations.find(row => row.id === INVITATION);
    if (invitation && client?.pendingStatus) invitation.status = client.pendingStatus;
    if (client?.pendingRole) h.memberRole = client.pendingRole;
    return answer([]);
  }
}

function invitationReadResult(text: string, params: unknown[]) {
  if (/FROM public\.invitations_for_member\(\$1\)/i.test(text)) {
    const own = h.invitations.filter(row => row.user_id === Number(params[0]));
    if (/WHERE id = \$2/i.test(text)) {
      return answer(own.filter(row => row.id === Number(params[1])).map(row => ({
        organization_id: row.organization_id, status: row.status,
      })));
    }
    return answer(own.filter(row => row.status === 'pending').map(row => ({
      id: row.id, organizationId: row.organization_id, email: row.email,
      role: row.role, status: row.status, invitedById: 7, createdAt: '2026-10-14T10:00:00Z',
    })));
  }
  if (/^SELECT name FROM organizations WHERE id\s*=\s*\$1/i.test(text)) {
    if (h.nameFails) throw new Error('organization-name-probe');
    const name = h.names.get(Number(params[0]));
    return answer(name === undefined ? [] : [{ name }]);
  }
  if (/FROM organization_invitations WHERE id = \$1 FOR UPDATE/i.test(text)) {
    return answer(h.invitations.filter(row => row.id === Number(params[0])).map(row => ({ ...row })));
  }
}

function membershipResult(text: string, params: unknown[], client?: RecordedClient) {
  if (/^SELECT max_projects, max_users FROM organizations/i.test(text)) {
    return answer([{ max_projects: 10, max_users: h.maxUsers }]);
  }
  if (/^SELECT COUNT\(\*\) as count FROM organization_users/i.test(text)) {
    return answer([{ count: String(h.memberCount) }]);
  }
  if (/^INSERT INTO organization_users/i.test(text)) {
    if (h.memberRole) return answer([]);
    if (client) client.pendingRole = String(params[2]);
    return answer([{ role: params[2] }], 1);
  }
  if (/^SELECT role FROM organization_users/i.test(text)) {
    return answer(h.memberRole ? [{ role: h.memberRole }] : []);
  }
}

function invitationMutationResult(text: string, params: unknown[], client?: RecordedClient) {
  if (/^UPDATE organization_invitations/i.test(text)) {
    const invitation = h.invitations.find(row => row.id === Number(params[0]));
    if (text.includes("status = 'declined'")) {
      if (h.declineRace || !invitation || invitation.status !== 'pending' ||
          invitation.organization_id !== Number(params[1]) || invitation.user_id !== Number(params[2])) return answer([]);
      if (client) client.pendingStatus = 'declined';
      return answer([{ role: invitation.role }], 1);
    }
    if (client) client.pendingStatus = 'accepted';
    return answer([], 1);
  }
}

async function fakeQuery(sql: string, params: unknown[] = [], client?: RecordedClient) {
  const text = norm(sql);
  const scope = getTenantScope();
  h.queries.push({ sql: text, params, client, tenantId: scope?.tenantId, role: scope?.role });
  h.order.push(text);
  const result = transactionResult(text, client) ?? invitationReadResult(text, params) ??
    membershipResult(text, params, client) ?? invitationMutationResult(text, params, client);
  if (result) return result;
  throw new Error(`Unexpected invitation SQL: ${text}`);
}

function fakeClient(): RecordedClient {
  const client: RecordedClient = {
    query: vi.fn((sql: string, params?: unknown[]) => fakeQuery(sql, params, client)),
    release: vi.fn(),
  };
  h.clients.push(client);
  return client;
}

const db = () => ({
  pool: { query: vi.fn((sql: string, params?: unknown[]) => fakeQuery(sql, params)), connect: vi.fn(async () => fakeClient()) },
  transaction: vi.fn(async (cb: (client: RecordedClient) => Promise<unknown>) => {
    const client = fakeClient();
    await client.query('BEGIN');
    try {
      const result = await cb(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }),
});

// The route imports the TS facade; the real atomic quota service imports the
// compatibility JS facade. Both receive the same transaction recorder.
vi.mock('../../db', () => db());
vi.mock('../../db.js', () => db());
vi.mock('../../middleware/auth', () => ({ invalidateOrgMembershipCache: vi.fn() }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ holdsPlatformRole: vi.fn(async () => false) }));
vi.mock('../../services/tenant/invitation-delivery', () => ({ issueInvitation: vi.fn(), reissueForUnredeemedInvitee: vi.fn() }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn() },
  writeChainedAuditRow: vi.fn(async (client: unknown, entry: Record<string, unknown>) => {
    const scope = getTenantScope();
    h.order.push(`AUDIT ${String(entry.action)}`);
    h.auditCalls.push({ client, entry, tenantId: scope?.tenantId, role: scope?.role });
    if (h.auditFails) throw new Error('audit-chain-probe refused audit_logs');
  }),
}));

let app: express.Express;

beforeEach(async () => {
  h.callerId = CALLER;
  h.invitations = [{ id: INVITATION, organization_id: INVITING_ORG, user_id: CALLER, email: 'member@example.test', role: 'reviewer', status: 'pending' }];
  h.queries = []; h.order = []; h.clients = []; h.auditCalls = [];
  h.auditFails = false; h.nameFails = false;
  h.names = new Map([[INVITING_ORG, 'Inviting laboratory'], [OTHER_ORG, 'Unrelated organization']]);
  h.memberRole = null; h.memberCount = 1; h.maxUsers = 5;
  h.declineRace = false; h.authenticatedUsers = [];
  const mod = await import('../tenant-users');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (h.callerId != null) {
      const user = { id: h.callerId, organizationId: SESSION_ORG, role: 'member' };
      (req as Request & { user: typeof user }).user = user;
      h.authenticatedUsers.push(user);
    }
    runWithTenantScope({ tenantId: String(SESSION_ORG), role: 'member', source: 'test' }, next);
  });
  app.use('/api/tenant-users', mod.default);
});

const queries = (re: RegExp) => h.queries.filter(row => re.test(row.sql));
const respond = (decision: 'accept' | 'decline', body: object = {}) => request(app)
  .post(`/api/tenant-users/invitations/${INVITATION}/${decision}`)
  .set('user-agent', 'invitation-handoff-test').send(body);
const writes = () => queries(/^(INSERT|UPDATE|DELETE) /i);
const mutationOrder = () => h.order.filter(sql => /^(BEGIN|COMMIT|ROLLBACK|INSERT INTO organization_users|UPDATE organization_invitations|AUDIT)/.test(sql))
  .map(sql => sql.split(' ')[0]);

function expectAudit(decision: 'accepted' | 'declined', opts = { membershipCreated: decision === 'accepted', previousRole: null as string | null, newRole: decision === 'accepted' ? 'reviewer' : null }) {
  expect(h.auditCalls).toHaveLength(1);
  const audit = h.auditCalls[0];
  const mutation = queries(/^UPDATE organization_invitations/i)[0];
  expect(audit.client).toBe(mutation.client);
  expect(audit.client).toBeDefined();
  expect(audit).toMatchObject({ tenantId: String(INVITING_ORG), role: 'member' });
  expect(audit.entry).toMatchObject({
    tenantId: INVITING_ORG, userId: CALLER,
    action: `organization_invitation_${decision}`,
    resourceType: 'organization_invitations', resourceId: String(INVITATION),
    userAgent: 'invitation-handoff-test',
    details: { targetUserId: CALLER, previousStatus: 'pending', newStatus: decision, invitationRole: 'reviewer', ...opts },
  });
  expect(audit.entry.ipAddress).toMatch(/^(::ffff:)?127\.0\.0\.1$|^::1$/);
}

describe('GET invitations/mine — names belong only to the caller’s invitations', () => {
  it('uses the session caller despite body/query targets, then reads only their inviting organization in verified scope', async () => {
    h.invitations.push({ id: 32, organization_id: OTHER_ORG, user_id: OTHER, email: 'other@example.test', role: 'admin', status: 'pending' });
    const res = await request(app).get('/api/tenant-users/invitations/mine')
      .query({ userId: OTHER, organizationId: OTHER_ORG }).send({ userId: OTHER, organizationId: OTHER_ORG });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: INVITATION, organizationId: INVITING_ORG, organizationName: 'Inviting laboratory' });
    expect(queries(/public\.invitations_for_member/)[0]).toMatchObject({ params: [CALLER], tenantId: String(SESSION_ORG) });
    expect(queries(/^SELECT name FROM organizations/)).toEqual([
      expect.objectContaining({ params: [INVITING_ORG], tenantId: String(INVITING_ORG), role: 'member' }),
    ]);
    expect(writes()).toHaveLength(0);
  });

  it('an empty self-only list does not look up another person’s organization', async () => {
    h.invitations[0].user_id = OTHER;
    const res = await request(app).get('/api/tenant-users/invitations/mine');
    expect(res.status).toBe(200); expect(res.body).toEqual([]);
    expect(queries(/^SELECT name FROM organizations/)).toHaveLength(0);
  });

  it('a missing organization name is null, never a fabricated name', async () => {
    h.names.clear();
    const res = await request(app).get('/api/tenant-users/invitations/mine');
    expect(res.status).toBe(200); expect(res.body[0].organizationName).toBeNull();
  });

  it('a failed name read is 500 instead of a successful empty invitation list', async () => {
    h.nameFails = true;
    const res = await request(app).get('/api/tenant-users/invitations/mine');
    expect(res.status).toBe(500); expect(res.body).not.toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain('organization-name-probe');
  });

  it('requires authentication before resolving invitations or names', async () => {
    h.callerId = null;
    const res = await request(app).get('/api/tenant-users/invitations/mine');
    expect(res.status).toBe(401); expect(h.queries).toHaveLength(0);
  });
});

describe('the invitee’s answer — scoped, atomic and recorded', () => {
  it.each(['accept', 'decline'] as const)('%s refuses another person’s invitation without disclosing or changing it', async decision => {
    h.invitations[0].user_id = OTHER;
    const res = await respond(decision, { userId: OTHER, organizationId: INVITING_ORG });
    expect(res.status).toBe(404);
    expect(queries(/public\.invitations_for_member/)[0].params).toEqual([CALLER, INVITATION]);
    expect(writes()).toHaveLength(0); expect(h.auditCalls).toHaveLength(0); expect(h.clients).toHaveLength(0);
  });

  it('accept commits membership, accepted status and one chained audit on the same client, with the authenticated actor', async () => {
    const res = await respond('accept', { userId: OTHER, actorId: OTHER, organizationId: OTHER_ORG });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ success: true, auditTrail: { persisted: true, chained: true }, data: { organizationId: INVITING_ORG, userId: CALLER, role: 'reviewer', status: 'accepted' } });
    expect(mutationOrder()).toEqual(['BEGIN', 'INSERT', 'UPDATE', 'AUDIT', 'COMMIT']);
    expectAudit('accepted');
    const membership = queries(/^INSERT INTO organization_users/)[0];
    expect(membership.params).toEqual([INVITING_ORG, CALLER, 'reviewer']);
    expect(membership.client).toBe(h.auditCalls[0].client);
    expect(writes().every(row => row.tenantId === String(INVITING_ORG) && row.role === 'member')).toBe(true);
    expect(h.memberRole).toBe('reviewer'); expect(h.invitations[0].status).toBe('accepted');
    expect(h.authenticatedUsers.every(user => user.organizationId === SESSION_ORG)).toBe(true);
    expect(queries(/^UPDATE users|^UPDATE organization_users/)).toHaveLength(0);
  });

  it('accept audit refusal rolls membership and status back and returns 500 with no success claim', async () => {
    h.auditFails = true;
    const res = await respond('accept');
    expect(res.status).toBe(500); expect(res.body.success).not.toBe(true); expect(res.body.auditTrail).toBeUndefined();
    expect(res.body.error).toBe('DATABASE_ERROR');
    expect(mutationOrder()).toEqual(['BEGIN', 'INSERT', 'UPDATE', 'AUDIT', 'ROLLBACK']);
    expect(h.memberRole).toBeNull(); expect(h.invitations[0].status).toBe('pending');
    expect(JSON.stringify(res.body)).not.toMatch(/audit-chain-probe|audit_logs/);
  });

  it('accepting an already accepted invitation is 409 without audit, role overwrite or membership insertion', async () => {
    h.invitations[0].status = 'accepted'; h.memberRole = 'viewer';
    const res = await respond('accept');
    expect(res.status).toBe(409); expect(res.body.error).toBe('NOT_PENDING');
    expect(writes()).toHaveLength(0); expect(h.auditCalls).toHaveLength(0); expect(h.memberRole).toBe('viewer');
  });

  it('accept preserves an existing lower membership role and records that no membership was created', async () => {
    h.memberRole = 'viewer';
    const res = await respond('accept');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.role).toBe('viewer');
    expectAudit('accepted', { membershipCreated: false, previousRole: 'viewer', newRole: 'viewer' });
    expect(h.memberRole).toBe('viewer'); expect(queries(/^UPDATE organization_users/)).toHaveLength(0);
  });

  it('decline commits its conditional update and one chained audit on the same client, before commit', async () => {
    const res = await respond('decline', { userId: OTHER, actorId: OTHER });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ success: true, auditTrail: { persisted: true, chained: true } });
    expect(mutationOrder()).toEqual(['BEGIN', 'UPDATE', 'AUDIT', 'COMMIT']);
    expectAudit('declined');
    const [mutation] = queries(/^UPDATE organization_invitations/);
    expect(mutation.sql).toMatch(/WHERE id = \$1 AND organization_id = \$2 AND user_id = \$3 AND status = 'pending'/);
    expect(mutation.params).toEqual([INVITATION, INVITING_ORG, CALLER]);
    expect(h.invitations[0].status).toBe('declined'); expect(h.memberRole).toBeNull();
    expect(h.authenticatedUsers.every(user => user.organizationId === SESSION_ORG)).toBe(true);
  });

  it('decline audit refusal rolls the status back and returns 500 with no success claim', async () => {
    h.auditFails = true;
    const res = await respond('decline');
    expect(res.status).toBe(500); expect(res.body.success).not.toBe(true); expect(res.body.auditTrail).toBeUndefined();
    expect(mutationOrder()).toEqual(['BEGIN', 'UPDATE', 'AUDIT', 'ROLLBACK']);
    expect(h.invitations[0].status).toBe('pending'); expect(h.memberRole).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/audit-chain-probe|audit_logs/);
  });

  it('a concurrent response makes the guarded decline 409 with no audit or success claim', async () => {
    h.declineRace = true;
    const res = await respond('decline');
    expect(res.status).toBe(409); expect(res.body.success).not.toBe(true); expect(res.body.auditTrail).toBeUndefined();
    expect(h.auditCalls).toHaveLength(0); expect(h.invitations[0].status).toBe('pending');
  });

  it.each(['accepted', 'declined'])('decline refuses an invitation already %s before any write', async status => {
    h.invitations[0].status = status;
    const res = await respond('decline');
    expect(res.status).toBe(409); expect(writes()).toHaveLength(0); expect(h.auditCalls).toHaveLength(0);
  });
});

describe('real atomic accept service — defense in depth', () => {
  it('reports a committed chained audit and binds its actor to callerUserId even if optional context names somebody else', async () => {
    const { atomicAcceptInvitation } = await loadInvitationService();
    const context = { userId: OTHER, ipAddress: '203.0.113.42', userAgent: 'direct-service-test' };
    const result = await runWithTenantScope({ tenantId: String(INVITING_ORG), role: 'member', source: 'test' }, () => atomicAcceptInvitation(INVITATION, CALLER, context));
    expect(result).toMatchObject({ success: true, auditTrail: { persisted: true, chained: true } });
    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0].entry).toMatchObject({ userId: CALLER, ipAddress: context.ipAddress, userAgent: context.userAgent, details: { targetUserId: CALLER } });
    expect(mutationOrder()).toEqual(['BEGIN', 'INSERT', 'UPDATE', 'AUDIT', 'COMMIT']);
  });

  it('rejects a non-invitee even if called directly in the inviting organization', async () => {
    const { atomicAcceptInvitation } = await loadInvitationService();
    const result = await runWithTenantScope({ tenantId: String(INVITING_ORG), role: 'member', source: 'test' }, () => atomicAcceptInvitation(INVITATION, OTHER));
    expect(result).toMatchObject({ success: false, error: 'FORBIDDEN' });
    expect(writes()).toHaveLength(0); expect(h.auditCalls).toHaveLength(0);
    expect(mutationOrder()).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('returns DATABASE_ERROR and no persisted audit claim when audit fails, even without a route caller', async () => {
    h.auditFails = true;
    const { atomicAcceptInvitation } = await loadInvitationService();
    const result = await runWithTenantScope({ tenantId: String(INVITING_ORG), role: 'member', source: 'test' }, () => atomicAcceptInvitation(INVITATION, CALLER));
    expect(result).toMatchObject({ success: false, error: 'DATABASE_ERROR' });
    expect(result).not.toHaveProperty('auditTrail');
    expect(h.invitations[0].status).toBe('pending'); expect(h.memberRole).toBeNull();
    expect(mutationOrder()).toEqual(['BEGIN', 'INSERT', 'UPDATE', 'AUDIT', 'ROLLBACK']);
  });

  it('continues to enforce the existing member quota before writes or audit', async () => {
    h.memberCount = h.maxUsers;
    const res = await respond('accept');
    expect(res.status).toBe(403); expect(res.body.error).toBe('QUOTA_EXCEEDED');
    expect(writes()).toHaveLength(0); expect(h.auditCalls).toHaveLength(0);
  });
});
