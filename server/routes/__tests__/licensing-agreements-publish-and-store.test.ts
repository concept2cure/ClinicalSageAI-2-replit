/**
 * Who may publish an agreement, and what the agreement routes answer when the
 * agreement records do not exist (F1, 2026-11-10: ADM-01, IAM-ADM-02, W1-05).
 *
 * What the routes did until 2026-11-10 (real services and the real platform
 * guard, the pool stubbed):
 *   - POST /agreements admitted any caller whose request role was 'admin'. That
 *     role is the caller's organisation membership role, so every client's own
 *     administrator could supersede the EULA every user of every organisation
 *     must accept. It took no reason and wrote no audit row.
 *   - Every agreement route, and GET /entitlements, answered 500 when the
 *     agreement tables did not exist: the service tried to create them at run
 *     time, which the runtime role may not do ("permission denied for schema
 *     public"). The 500 said nothing about why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const query = vi.hoisted(() => vi.fn());
const sealedAudit = vi.hoisted(() => vi.fn());
const release = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
  },
  query: (...a: unknown[]) => query(...a),
}));
vi.mock('../../db.js', () => dbMock());
vi.mock('../../db', () => dbMock());
vi.mock('../../services/auditService.js', () => ({
  default: { logAction: vi.fn() },
  writeChainedAuditRow: (...a: unknown[]) => sealedAudit(...a),
}));

const STAFF_EMAIL = 'staff.synthetic@platform.test';
const ACTIVE = {
  id: 'a-old',
  agreement_key: 'eula',
  version: '2026.06',
  title: 'End-User License Agreement',
  summary: null,
  body: 'The old terms.',
  url: null,
  scope: 'user',
  required: true,
  status: 'active',
  effective_at: '2026-06-21T00:00:00.000Z',
};

type Answer = (params: unknown[]) => unknown[];

/** `tables: false` is the hosted database: no agreement tables, and no right to create them. */
function wire({ tables = true, grant }: { tables?: boolean | 'partial'; grant?: string } = {}) {
  const answers: Array<[RegExp, Answer]> = [
    [/^(BEGIN|COMMIT|ROLLBACK)$/, () => []],
    // 'partial': one of the two tables exists. That is not "set up".
    [/to_regclass/, () => [{ agreements: tables !== false, acceptances: tables === true }]],
    // A platform grant answers only a lookup that asks for its role, as the real query's ANY($2) does.
    [/FROM platform_role_grants/, (p) => (grant && (p[1] as string[]).includes(grant) ? [{ '?column?': 1 }] : [])],
    [/UPDATE license_agreements SET status = 'superseded'/, () => [ACTIVE]],
    [/INSERT INTO license_agreements/, (p) => [{ ...ACTIVE, id: 'a-new', version: p[1], title: p[2], body: p[4], status: 'active' }]],
    [/FROM license_agreements WHERE status = 'active'/, () => [ACTIVE]],
    [/FROM license_acceptances/, () => []],
    [/SELECT id, tier, industry_mode/, () => [{ id: 3, tier: 'professional', industry_mode: 'biotech', max_users: 5, max_projects: 10, max_storage: 5 }]],
    [/FROM module_subscriptions|FROM available_modules am/, () => []],
    [/SELECT max_projects FROM organizations/, () => [{ max_projects: 10 }]],
    [/SELECT max_users FROM organizations/, () => [{ max_users: 5 }]],
    [/SELECT COUNT\(\*\) as cnt/, () => [{ cnt: '1' }]],
  ];
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const s = String(sql);
    if (/CREATE TABLE/.test(s)) {
      if (tables !== true) throw Object.assign(new Error('permission denied for schema public'), { code: '42501' });
      return { rows: [] };
    }
    if (/WHERE NOT EXISTS \(SELECT 1 FROM license_agreements/.test(s)) return { rows: [] };
    const hit = answers.find(([re]) => re.test(s));
    if (!hit) throw new Error(`unexpected statement in test: ${s.slice(0, 80)}`);
    return { rows: hit[1](params) };
  });
}

async function appAs(user: Record<string, unknown>) {
  // A fresh service per app: ensureSchema remembers the first success.
  vi.resetModules();
  const { default: licensingRouter } = await import('../licensing');
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: Record<string, unknown> }).user = user;
    next();
  });
  a.use('/api/licensing', licensingRouter);
  return a;
}

/** A client's own administrator: membership role 'admin', no platform standing. */
const CLIENT_ADMIN = { id: 7, organizationId: 3, role: 'admin', email: 'admin.synthetic@client.test' };
/** Platform staff: the owner's own password sign-in on PLATFORM_ADMIN_EMAILS. */
const PLATFORM_STAFF = { id: 1, organizationId: 1, role: 'member', email: STAFF_EMAIL, provider: 'local-jwt' };

const PUBLISH = {
  agreementKey: 'eula',
  version: '2026.11',
  title: 'End-User License Agreement',
  body: 'The new terms.',
  reason: 'Annual legal review of the licence terms',
};

const writes = () =>
  query.mock.calls.filter(([sql]) => /INSERT INTO license_agreements|UPDATE license_agreements/.test(String(sql)));

beforeEach(() => {
  vi.stubEnv('PLATFORM_ADMIN_EMAILS', STAFF_EMAIL);
  query.mockReset();
  sealedAudit.mockReset().mockResolvedValue(undefined);
  release.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /agreements is an act of platform staff', () => {
  it("refuses a client's own administrator 403 with a plain sentence, and changes nothing", async () => {
    wire();
    const res = await request(await appAs(CLIENT_ADMIN)).post('/api/licensing/agreements').send(PUBLISH);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toMatch(/platform staff/i);
    expect(res.body.error).toMatch(/organisation/);
    expect(writes()).toEqual([]);
    expect(sealedAudit).not.toHaveBeenCalled();
  });

  it('refuses a federated session whose e-mail is on the allowlist (the IdP asserted it)', async () => {
    wire();
    const res = await request(await appAs({ ...PLATFORM_STAFF, provider: 'saml' })).post('/api/licensing/agreements').send(PUBLISH);
    expect(res.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  it('refuses platform support staff: a support grant is platform standing, but not the standing to change terms', async () => {
    wire({ grant: 'support' });
    const SUPPORT = { id: 9, organizationId: 1, role: 'member', email: 'support.synthetic@platform.test', provider: 'local-jwt' };
    const res = await request(await appAs(SUPPORT)).post('/api/licensing/agreements').send(PUBLISH);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toMatch(/platform staff/i);
    expect(writes()).toEqual([]);
    expect(sealedAudit).not.toHaveBeenCalled();
  });

  it('publishes for a platform administrator who holds a grant (not only the owner on the allowlist)', async () => {
    wire({ grant: 'platform_admin' });
    const GRANTED = { id: 11, organizationId: 1, role: 'member', email: 'padmin.synthetic@platform.test', provider: 'local-jwt' };
    const res = await request(await appAs(GRANTED)).post('/api/licensing/agreements').send(PUBLISH);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(sealedAudit).toHaveBeenCalledTimes(1);
  });

  it('refuses platform staff without a reason 400, and changes nothing', async () => {
    wire();
    for (const reason of [undefined, '', '  a ']) {
      const res = await request(await appAs(PLATFORM_STAFF))
        .post('/api/licensing/agreements')
        .send({ ...PUBLISH, reason });
      expect(res.status, String(reason)).toBe(400);
      expect(res.body.error).toMatch(/reason/i);
    }
    expect(writes()).toEqual([]);
    expect(sealedAudit).not.toHaveBeenCalled();
  });

  it('publishes for platform staff with a reason, and audits before and after in the same transaction', async () => {
    wire();
    const res = await request(await appAs(PLATFORM_STAFF)).post('/api/licensing/agreements').send(PUBLISH);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.agreement).toMatchObject({ id: 'a-new', version: '2026.11' });
    expect(sealedAudit).toHaveBeenCalledTimes(1);
    const [client, entry] = sealedAudit.mock.calls[0] as [unknown, Record<string, any>];
    expect(client).toEqual(expect.objectContaining({ query: expect.any(Function) }));
    expect(entry).toMatchObject({
      userId: 1,
      action: 'license_agreement_published',
      resourceType: 'license_agreements',
      resourceId: 'a-new',
      reason: PUBLISH.reason,
    });
    expect(entry.details.before).toEqual([expect.objectContaining({ id: 'a-old', version: '2026.06' })]);
    expect(entry.details.after).toEqual(expect.objectContaining({ id: 'a-new', version: '2026.11' }));
    // The audit row is written between the writes and the COMMIT.
    const order = query.mock.calls.map(([sql]) => String(sql));
    expect(order.lastIndexOf('COMMIT')).toBeGreaterThan(order.findIndex(s => /INSERT INTO license_agreements/.test(s)));
  });
});

describe('the agreement records do not exist: an honest refusal, not a 500 and not an empty list', () => {
  const routes: Array<[string, 'get' | 'post', string, Record<string, unknown>]> = [
    ['active agreements', 'get', '/api/licensing/agreements/active', CLIENT_ADMIN],
    ['outstanding agreements', 'get', '/api/licensing/agreements/outstanding', CLIENT_ADMIN],
    ['acceptance history', 'get', '/api/licensing/acceptances', CLIENT_ADMIN],
    ['accept', 'post', '/api/licensing/agreements/a-old/accept', CLIENT_ADMIN],
    ['entitlements', 'get', '/api/licensing/entitlements', CLIENT_ADMIN],
    ['publish (platform staff)', 'post', '/api/licensing/agreements', PLATFORM_STAFF],
  ];
  for (const [name, method, path, user] of routes) {
    it(`${name}: 503 AGREEMENTS_NOT_SET_UP with a sentence saying why`, async () => {
      wire({ tables: false });
      const agent = request(await appAs(user));
      const res = method === 'get' ? await agent.get(path) : await agent.post(path).send(PUBLISH);
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body.code).toBe('AGREEMENTS_NOT_SET_UP');
      expect(res.body.error).toMatch(/not set up/i);
      expect(JSON.stringify(res.body)).not.toMatch(/permission denied|schema public/);
      for (const key of ['agreements', 'outstanding', 'count', 'acceptances', 'accepted', 'agreement', 'licenseAccepted']) {
        expect(res.body).not.toHaveProperty(key);
      }
    });
  }

  it('tables that exist are read without any attempt to create them (a deploy-shaped role)', async () => {
    wire();
    const res = await request(await appAs(CLIENT_ADMIN)).get('/api/licensing/agreements/active');
    expect(res.status).toBe(200);
    expect(res.body.agreements).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => /CREATE TABLE/.test(String(sql)))).toBe(false);
  });
});
