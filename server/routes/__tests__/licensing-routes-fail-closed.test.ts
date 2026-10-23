/**
 * /api/licensing answers a failed read as a failure, refuses to record consent
 * to an agreement that has no text, and never invents a tier.
 *
 * What the routes answered until 2026-10-15 (real services, pool stubbed):
 *   - GET /agreements/outstanding: 200 { outstanding: [], count: 0 } when the
 *     agreement store could not be read (eula-service swallowed it into []).
 *     /agreements/active and /acceptances answered [] the same way.
 *   - GET /entitlements: 200 with licenseAccepted: true on that same failure.
 *   - POST /agreements/:id/accept: 201 for an agreement with neither body nor
 *     url, which is what both seeded agreements are.
 *   - GET /features: tier 'free' when the license could not be read, and when
 *     the organization had no row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const query = vi.hoisted(() => vi.fn());
const logAction = vi.hoisted(() => vi.fn());
const sealedAudit = vi.hoisted(() => vi.fn());
const release = vi.hoisted(() => vi.fn());

vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a), connect:async () => ({ query:(...a:unknown[]) => query(...a), release }) } }));
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a), connect:async () => ({ query:(...a:unknown[]) => query(...a), release }) } }));
vi.mock('../../services/auditService.js', () => ({
  default: { logAction: (...a: unknown[]) => logAction(...a) },
  writeChainedAuditRow:(...a:unknown[]) => sealedAudit(...a),
}));

import licensingRouter from '../licensing';

const ORG = { id: 3, tier: 'professional', industry_mode: 'biotech', max_users: 5, max_projects: 10, max_storage: 5 };
const AGREEMENT = {
  id: 'a-eula',
  agreement_key: 'eula',
  version: '2026.06',
  title: 'End-User License Agreement',
  summary: null,
  body: null,
  url: null,
  scope: 'user',
  required: true,
  status: 'active',
  effective_at: '2026-06-21T00:00:00.000Z',
};

interface Wiring {
  failing?: RegExp;
  org?: Record<string, unknown> | null;
  agreement?: Record<string, unknown>;
}

type Answer = (params: unknown[]) => unknown[];

function wire(w: Wiring = {}) {
  const answers: Array<[RegExp, Answer]> = [
    // eula-service
    [/^(BEGIN|COMMIT|ROLLBACK)$/, () => []],
    [/CREATE TABLE|WHERE NOT EXISTS \(SELECT 1 FROM license_agreements/, () => []],
    [/FROM license_agreements WHERE (status = 'active'|id = \$1)/, () => [w.agreement ?? AGREEMENT]],
    [/INSERT INTO license_acceptances/, (p) => [
      {
        id: 'acc-1',
        agreement_id: p[0],
        agreement_key: p[1],
        agreement_version: p[2],
        user_id: p[3],
        organization_id: p[4],
        accepted_at: p[5],
        method: p[9],
      },
    ]],
    [/FROM license_acceptances/, () => []],
    // license-manager
    [/SELECT id, tier, industry_mode/, () => (w.org === null ? [] : [w.org ?? ORG])],
    [/FROM module_subscriptions|FROM available_modules am/, () => []],
    [/SELECT max_projects FROM organizations/, () => [{ max_projects: 10 }]],
    [/SELECT max_users FROM organizations/, () => [{ max_users: 5 }]],
    [/SELECT COUNT\(\*\) as cnt/, () => [{ cnt: '1' }]],
  ];
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const s = String(sql);
    if (w.failing?.test(s)) throw new Error('connection terminated unexpectedly');
    const hit = answers.find(([re]) => re.test(s));
    if (!hit) throw new Error(`unexpected statement in test: ${s.slice(0, 80)}`);
    return { rows: hit[1](params) };
  });
}

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: { id: number; organizationId: number } }).user = { id: 7, organizationId: 3 };
    next();
  });
  a.use('/api/licensing', licensingRouter);
  return a;
}

const inserts = () => query.mock.calls.filter(([sql]) => /INSERT INTO license_acceptances/.test(String(sql)));

beforeEach(() => {
  query.mockReset();
  logAction.mockReset();
  logAction.mockResolvedValue({ persisted: true });
  sealedAudit.mockReset().mockResolvedValue({ id:73, persisted:true, chained:true });
  release.mockReset();
});

describe('agreement reads: a failed read is a 500, never an empty list', () => {
  it('GET /agreements/outstanding', async () => {
    wire({ failing: /FROM license_acceptances/ });
    const res = await request(app()).get('/api/licensing/agreements/outstanding');
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('outstanding');
    expect(res.body).not.toHaveProperty('count');
  });

  it('GET /agreements/active', async () => {
    wire({ failing: /FROM license_agreements WHERE status = 'active'/ });
    const res = await request(app()).get('/api/licensing/agreements/active');
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('agreements');
  });

  it('GET /acceptances', async () => {
    wire({ failing: /FROM license_acceptances/ });
    const res = await request(app()).get('/api/licensing/acceptances');
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('acceptances');
  });

  it('GET /entitlements does not report the license accepted when acceptances could not be read', async () => {
    wire({ failing: /FROM license_acceptances/ });
    const res = await request(app()).get('/api/licensing/entitlements');
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('licenseAccepted');
  });

  it('a readable store still answers 200 with the outstanding agreement', async () => {
    wire();
    const res = await request(app()).get('/api/licensing/agreements/outstanding');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe('POST /agreements/:id/accept: no consent to an agreement with no text', () => {
  it('422 AGREEMENT_TEXT_MISSING, and nothing recorded or audited', async () => {
    wire({ agreement: { ...AGREEMENT, body: null, url: null } });
    const res = await request(app()).post('/api/licensing/agreements/a-eula/accept');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AGREEMENT_TEXT_MISSING');
    expect(inserts()).toHaveLength(0);
    expect(logAction).not.toHaveBeenCalled();
    expect(sealedAudit).not.toHaveBeenCalled();
  });

  it('201 for an agreement whose text is held', async () => {
    wire({ agreement: { ...AGREEMENT, body: 'The terms.' } });
    const res = await request(app()).post('/api/licensing/agreements/a-eula/accept');
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(true);
    expect(inserts()).toHaveLength(1);
    expect(sealedAudit).toHaveBeenCalledWith(expect.objectContaining({ query:expect.any(Function) }), expect.objectContaining({
      organizationId:3, userId:7, action:'license_accepted',
      details:expect.objectContaining({ contentHash:expect.stringMatching(/^[a-f0-9]{64}$/) }),
    }));
  });
});

describe('unconfirmed legal acceptance commits', () => {
  it('returns recovery guidance, evicts the connection and never claims rollback or accepted:true', async () => {
    wire({ agreement:{ ...AGREEMENT, body:'The terms.' }, failing:/^COMMIT$/ });
    const r = await request(app()).post('/api/licensing/agreements/a-eula/accept');
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('LICENSE_ACCEPTANCE_COMMIT_UNCONFIRMED');
    expect(r.body).not.toHaveProperty('accepted');
    expect(r.body.recoveryUrl).toBe('/api/licensing/acceptances');
    expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(false);
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('GET /features never invents a tier', () => {
  it('500 when the license cannot be read', async () => {
    wire({ failing: /SELECT id, tier, industry_mode/ });
    const res = await request(app()).get('/api/licensing/features');
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('tier');
  });

  it('404 when the organization has no row', async () => {
    wire({ org: null });
    const res = await request(app()).get('/api/licensing/features');
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('tier');
  });

  it("the organization's own tier when it is read", async () => {
    wire();
    const res = await request(app()).get('/api/licensing/features');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('professional');
  });
});

// 2026-10-22: publishAgreement refuses an agreement with no body or url
// (AgreementPublishTextMissingError, 400), and the route answered it 500.
describe('POST /agreements: an agreement with no text is the request\'s fault', () => {
  it('answers 400 AGREEMENT_TEXT_MISSING and publishes nothing', async () => {
    wire();
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: { id: number; organizationId: number; role: string } }).user = { id: 7, organizationId: 3, role: 'admin' };
      next();
    });
    a.use('/api/licensing', licensingRouter);
    const res = await request(a)
      .post('/api/licensing/agreements')
      .send({ agreementKey: 'eula', version: '2026.10', title: 'End-User License Agreement' });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('AGREEMENT_TEXT_MISSING');
    const writes = query.mock.calls.filter(([sql]) => /INSERT INTO license_agreements|UPDATE license_agreements/.test(String(sql)));
    expect(writes).toEqual([]);
  });
});
