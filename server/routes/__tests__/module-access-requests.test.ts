/**
 * Contract test for /api/module-access-requests.
 *
 * WHY THE FAKE DATABASE IS NOT A STUB. Two of the properties this feature must
 * hold cannot be seen from a `pool.query` mock that returns canned rows:
 *
 *   1. A second request for the same module by the same person must UPDATE the
 *      open one. A mock that always answers "here is your row" reports success
 *      whether the handler wrote one row or fifty.
 *   2. Approving must write the grant, and declining must not.
 *
 * So the fake below keeps rows in an array and HONOURS THE CONFLICT CLAUSE THE
 * HANDLER ACTUALLY SENT: the upsert de-duplicates only if the statement carries
 * the partial-index conflict target. Delete that clause from the route and the
 * duplicate test fails on a second row, which is the defect it exists to catch,
 * rather than passing because the mock was told to.
 *
 * Everything else is real: the router, its authorization, its status codes and
 * the audit call.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const audit = vi.hoisted(() => ({ logAction: vi.fn(async () => undefined) }));
const master = vi.hoisted(() => ({ resolve: vi.fn(async (_req: unknown) => false) }));
const db = vi.hoisted(() => ({ query: vi.fn() }));
const grantSvc = vi.hoisted(() => ({ writeModuleGrant: vi.fn() }));

vi.mock('../../db.js', () => ({ pool: { query: (...a: any[]) => db.query(...a) } }));
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/entitlements/master-admin.js', () => ({
  resolveMasterAdmin: (req: unknown) => master.resolve(req),
}));
vi.mock('../../services/auditService.js', () => ({ default: audit }));
/* The grant is written by the ONE canonical writer, not by this route. Mocking
   it is what makes "approving grants, declining does not" an assertion about
   the call the route makes rather than about SQL it should not be sending. */
vi.mock('../../services/entitlements/module-grants.js', () => grantSvc);

import accessRequestsRouter from '../module-access-requests';

/* ── The fake table ────────────────────────────────────────────────────────── */

interface FakeRow {
  id: number;
  organization_id: number;
  module_id: string;
  requested_by: number;
  requester_email: string | null;
  requester_name: string | null;
  note: string | null;
  status: string;
  decided_by: number | null;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
}

const KNOWN_MODULES: Record<string, string> = {
  'pv-cockpit': 'PV cockpit',
  risk: 'Risk management',
};
const ORG_NAMES: Record<number, string> = { 7: 'Northwind Bio', 8: 'Trellis Therapeutics' };

let rows: FakeRow[] = [];
let nextId = 1;
const NOW = '2026-03-01T09:30:00.000Z';

function joined(r: FakeRow) {
  return {
    ...r,
    module_name: KNOWN_MODULES[r.module_id] ?? null,
    organization_name: ORG_NAMES[r.organization_id] ?? null,
  };
}

function handle(text: string, params: any[] = []): { rows: any[] } {
  const sql = text.replace(/\s+/g, ' ').trim();

  if (sql.startsWith('SELECT module_id FROM available_modules')) {
    return { rows: KNOWN_MODULES[params[0]] ? [{ module_id: params[0] }] : [] };
  }

  if (sql.startsWith('INSERT INTO module_access_requests')) {
    const [organization_id, module_id, requested_by, requester_email, requester_name, note] =
      params;
    // The de-duplication rule lives in the statement, not here. If the handler
    // stops asking for it, this fake stops applying it.
    const dedupes = /ON CONFLICT \(organization_id, module_id, requested_by\) WHERE status = 'open'/.test(
      sql,
    );
    const open = dedupes
      ? rows.find(
          (r) =>
            r.organization_id === organization_id &&
            r.module_id === module_id &&
            r.requested_by === requested_by &&
            r.status === 'open',
        )
      : undefined;
    if (open) {
      open.note = note ?? open.note;
      open.updated_at = NOW;
      return { rows: [{ id: open.id, inserted: false }] };
    }
    const row: FakeRow = {
      id: nextId++,
      organization_id,
      module_id,
      requested_by,
      requester_email: requester_email ?? null,
      requester_name: requester_name ?? null,
      note: note ?? null,
      status: 'open',
      decided_by: null,
      decided_by_email: null,
      decided_at: null,
      decision_reason: null,
      created_at: NOW,
      updated_at: NOW,
    };
    rows.push(row);
    return { rows: [{ id: row.id, inserted: true }] };
  }

  if (sql.startsWith('SELECT r.id, r.organization_id')) {
    if (/WHERE r\.id = \$1$/.test(sql)) {
      const r = rows.find((x) => x.id === Number(params[0]));
      return { rows: r ? [joined(r)] : [] };
    }
    if (/WHERE r\.requested_by = \$1 AND r\.organization_id = \$2/.test(sql)) {
      return {
        rows: rows
          .filter((r) => r.requested_by === params[0] && r.organization_id === params[1])
          .map(joined),
      };
    }
    // The queue read: an optional organization predicate and an optional status.
    const [orgFilter, statusFilter] = params;
    return {
      rows: rows
        .filter((r) => (orgFilter == null ? true : r.organization_id === orgFilter))
        .filter((r) => (statusFilter == null ? true : r.status === statusFilter))
        .map(joined),
    };
  }

  if (sql.startsWith('SELECT id, organization_id, module_id, requested_by, status')) {
    const r = rows.find((x) => x.id === Number(params[0]));
    return { rows: r ? [r] : [] };
  }

  if (sql.startsWith('UPDATE module_access_requests')) {
    const [id, status, decidedBy, decidedByEmail, reason] = params;
    const guarded = /AND status = 'open'/.test(sql);
    const r = rows.find(
      (x) => x.id === Number(id) && (guarded ? x.status === 'open' : true),
    );
    if (!r) return { rows: [] };
    r.status = status;
    r.decided_by = decidedBy;
    r.decided_by_email = decidedByEmail;
    r.decided_at = NOW;
    r.decision_reason = reason;
    r.updated_at = NOW;
    return { rows: [{ id: r.id }] };
  }

  /* Nothing in this route may reach module_subscriptions directly: the grant
     goes through the canonical writer, which is mocked. A statement arriving
     here would be a second grant path, and the throw below is what says so. */

  throw new Error(`unexpected statement: ${sql.slice(0, 90)}`);
}

/* ── The app ───────────────────────────────────────────────────────────────── */

interface TestUser {
  id?: number;
  organizationId?: number;
  role?: string;
  email?: string;
  name?: string;
}

const MEMBER: TestUser = {
  id: 43,
  organizationId: 7,
  role: 'member',
  email: 'member@example.test',
  name: 'A Member',
};
const ORG_ADMIN: TestUser = {
  id: 42,
  organizationId: 7,
  role: 'admin',
  email: 'admin@example.test',
};
const OTHER_ORG_ADMIN: TestUser = {
  id: 99,
  organizationId: 8,
  role: 'admin',
  email: 'other@example.test',
};
const PLATFORM: TestUser = {
  id: 1,
  organizationId: 1,
  role: 'member',
  email: 'owner@example.test',
};

function appWith(user: TestUser | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: TestUser }).user = user;
    next();
  });
  app.use('/api/module-access-requests', accessRequestsRouter);
  return app;
}

beforeEach(() => {
  rows = [];
  nextId = 1;
  grantSvc.writeModuleGrant.mockReset();
  grantSvc.writeModuleGrant.mockResolvedValue({
    organization_id: 7,
    module_id: 'pv-cockpit',
    enabled: true,
    expires_at: null,
    updated_at: NOW,
  });
  audit.logAction.mockClear();
  master.resolve.mockReset();
  master.resolve.mockResolvedValue(false);
  db.query.mockReset();
  db.query.mockImplementation(async (text: string, params?: any[]) => handle(text, params));
});

/* ── Recording an ask ──────────────────────────────────────────────────────── */

describe('POST / — a member records a request', () => {
  it('accepts an ordinary member, with a note, for their own workspace', async () => {
    const res = await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', note: 'Needed for the March filing.' });

    expect(res.status).toBe(201);
    expect(res.body.alreadyOpen).toBe(false);
    expect(res.body.request).toMatchObject({
      organizationId: 7,
      moduleId: 'pv-cockpit',
      moduleName: 'PV cockpit',
      requestedBy: 43,
      status: 'open',
      note: 'Needed for the March filing.',
    });
    expect(rows).toHaveLength(1);
  });

  /* The organization is taken from the caller's context. There is no body field
     that could aim a request at another workspace, and a caller that invents one
     changes nothing. */
  it('ignores an organizationId supplied by the caller', async () => {
    await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', organizationId: 8 });
    expect(rows[0].organization_id).toBe(7);
  });

  /* THE DUPLICATE RULE. A second press must land on the SAME row and be
     reported as already open, not absorbed silently and reported as new. */
  it('updates the open request instead of stacking a second one', async () => {
    const app = appWith(MEMBER);
    const first = await request(app)
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', note: 'First note.' });
    const second = await request(app)
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', note: 'Second note.' });

    expect(rows).toHaveLength(1);
    expect(second.status).toBe(200);
    expect(second.body.alreadyOpen).toBe(true);
    expect(second.body.request.id).toBe(first.body.request.id);
    expect(second.body.request.note).toBe('Second note.');
  });

  it('keeps two people asking for the same module as two separate requests', async () => {
    await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit' });
    await request(appWith({ ...MEMBER, id: 44, email: 'other@example.test' }))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit' });
    expect(rows).toHaveLength(2);
  });

  it('refuses an unknown module', async () => {
    const res = await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'not-a-module' });
    expect(res.status).toBe(404);
    expect(rows).toHaveLength(0);
  });

  it('refuses a caller with no workspace', async () => {
    const res = await request(appWith({ id: 5, role: 'member' }))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit' });
    expect(res.status).toBe(401);
  });

  it('refuses an over-long note rather than storing a truncated one', async () => {
    const res = await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', note: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(rows).toHaveLength(0);
  });
});

describe('GET /mine — what the lock panel reads', () => {
  it('returns the caller own requests, and nobody else', async () => {
    await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit' });
    await request(appWith({ ...MEMBER, id: 44 }))
      .post('/api/module-access-requests')
      .send({ moduleId: 'risk' });

    const res = await request(appWith(MEMBER)).get('/api/module-access-requests/mine');
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).toMatchObject({ moduleId: 'pv-cockpit', status: 'open' });
    expect(res.body.requests[0].createdAt).toBe(NOW);
  });
});

/* ── The queue ─────────────────────────────────────────────────────────────── */

describe('GET / — the administrator queue', () => {
  beforeEach(async () => {
    await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit' });
    await request(appWith({ id: 77, organizationId: 8, role: 'member' }))
      .post('/api/module-access-requests')
      .send({ moduleId: 'risk' });
  });

  it('shows an org admin their own workspace only', async () => {
    const res = await request(appWith(ORG_ADMIN)).get('/api/module-access-requests');
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('organization');
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].organizationId).toBe(7);
    expect(res.body.openCount).toBe(1);
  });

  it('refuses an ordinary member the queue', async () => {
    const res = await request(appWith(MEMBER)).get('/api/module-access-requests');
    expect(res.status).toBe(403);
  });

  it('shows the platform owner every workspace', async () => {
    master.resolve.mockResolvedValue(true);
    const res = await request(appWith(PLATFORM)).get('/api/module-access-requests?scope=all');
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('all');
    expect(res.body.requests).toHaveLength(2);
    expect(res.body.requests.map((r: any) => r.organizationName).sort()).toEqual([
      'Northwind Bio',
      'Trellis Therapeutics',
    ]);
  });

  /* Refused outright, not quietly narrowed to their own workspace. */
  it('refuses an org admin the all-workspaces scope', async () => {
    const res = await request(appWith(ORG_ADMIN)).get('/api/module-access-requests?scope=all');
    expect(res.status).toBe(403);
  });
});

/* ── The decision ──────────────────────────────────────────────────────────── */

describe('POST /:id/decision — approving and declining', () => {
  async function openRequest() {
    const res = await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', note: 'Needed for the March filing.' });
    return res.body.request.id as number;
  }

  it('approving writes the grant through module_subscriptions and records the reason', async () => {
    const id = await openRequest();
    const res = await request(appWith(ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'approved', reason: 'Named on the filing plan.' });

    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(res.body.request).toMatchObject({
      status: 'approved',
      decisionReason: 'Named on the filing plan.',
      decidedByEmail: 'admin@example.test',
    });
    /* Through the canonical writer, enabled, and with the expiry stated as
       unbounded — a stale date from a lapsed trial would otherwise make the
       approval a silent no-op. */
    expect(grantSvc.writeModuleGrant).toHaveBeenCalledWith({
      organizationId: 7,
      moduleId: 'pv-cockpit',
      enabled: true,
      actorEmail: 'admin@example.test',
      expiresAt: null,
    });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'data_modify',
        resourceType: 'module_access_request',
        tenantId: 7,
        details: expect.objectContaining({
          accessRequestAction: 'request.approved',
          granted: true,
          reason: 'Named on the filing plan.',
        }),
      }),
    );
  });

  it('declining records the reason and grants nothing', async () => {
    const id = await openRequest();
    const res = await request(appWith(ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'declined', reason: 'Not in this budget period.' });

    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(false);
    expect(res.body.request.status).toBe('declined');
    expect(res.body.request.decisionReason).toBe('Not in this budget period.');
    expect(grantSvc.writeModuleGrant).not.toHaveBeenCalled();
  });

  /* THE AUTHORIZATION TEST. An administrator of another workspace naming this
     request's id must be refused, and — the half that actually costs money —
     must not have caused a grant before being refused. */
  it('refuses an administrator of another workspace, and grants nothing', async () => {
    const id = await openRequest();
    const res = await request(appWith(OTHER_ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'approved', reason: 'Trying it on.' });

    expect(res.status).toBe(403);
    expect(grantSvc.writeModuleGrant).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('open');
    expect(audit.logAction).not.toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ accessRequestAction: 'request.approved' }),
      }),
    );
  });

  it('refuses an ordinary member of the same workspace, and grants nothing', async () => {
    const id = await openRequest();
    const res = await request(appWith(MEMBER))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'approved', reason: 'Approving my own ask.' });
    expect(res.status).toBe(403);
    expect(grantSvc.writeModuleGrant).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('open');
  });

  it('lets the platform owner answer another workspace request', async () => {
    const id = await openRequest();
    master.resolve.mockResolvedValue(true);
    const res = await request(appWith(PLATFORM))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'approved', reason: 'Granted under the pilot agreement.' });
    expect(res.status).toBe(200);
    expect(grantSvc.writeModuleGrant).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 7, enabled: true, expiresAt: null }),
    );
  });

  it('requires a reason of at least three characters, and grants nothing without one', async () => {
    const id = await openRequest();
    for (const reason of [undefined, '', '  ', 'ab']) {
      const res = await request(appWith(ORG_ADMIN))
        .post(`/api/module-access-requests/${id}/decision`)
        .send({ decision: 'approved', reason });
      expect(res.status).toBe(400);
    }
    expect(grantSvc.writeModuleGrant).not.toHaveBeenCalled();
    expect(rows[0].status).toBe('open');
  });

  it('requires a decision the table can hold', async () => {
    const id = await openRequest();
    const res = await request(appWith(ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'maybe', reason: 'Undecided.' });
    expect(res.status).toBe(400);
  });

  it('refuses a second answer on an already-answered request', async () => {
    const id = await openRequest();
    await request(appWith(ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'declined', reason: 'Not in this budget period.' });
    const again = await request(appWith(ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'approved', reason: 'Changed my mind.' });

    expect(again.status).toBe(409);
    expect(grantSvc.writeModuleGrant).not.toHaveBeenCalled();
    expect(rows[0].decision_reason).toBe('Not in this budget period.');
  });

  /* The de-duplication index is PARTIAL, so an answered request does not block
     a fresh ask after the plan changes. */
  it('lets the same person ask again once the first ask was answered', async () => {
    const id = await openRequest();
    await request(appWith(ORG_ADMIN))
      .post(`/api/module-access-requests/${id}/decision`)
      .send({ decision: 'declined', reason: 'Not in this budget period.' });

    const again = await request(appWith(MEMBER))
      .post('/api/module-access-requests')
      .send({ moduleId: 'pv-cockpit', note: 'The plan changed.' });
    expect(again.status).toBe(201);
    expect(again.body.alreadyOpen).toBe(false);
    expect(rows).toHaveLength(2);
  });

  it('returns 404 for a request that does not exist', async () => {
    const res = await request(appWith(ORG_ADMIN))
      .post('/api/module-access-requests/4242/decision')
      .send({ decision: 'approved', reason: 'Nothing there.' });
    expect(res.status).toBe(404);
  });

  /* Fail closed: a read that throws must not render as an empty queue. */
  it('reports a failed queue read as a failure, never as an empty list', async () => {
    db.query.mockRejectedValueOnce(new Error('connection terminated'));
    const res = await request(appWith(ORG_ADMIN)).get('/api/module-access-requests');
    expect(res.status).toBe(500);
    expect(res.body.requests).toBeUndefined();
  });
});
