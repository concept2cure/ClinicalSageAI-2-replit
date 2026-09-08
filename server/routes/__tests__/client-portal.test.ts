/**
 * External Client Portal access-model & sharing-filter contract
 * (server/routes/client-portal.ts).
 *
 * The portal is the read-only view a CRO's *client* sees. The endpoint must
 * enforce, server-side from the verified JWT:
 *
 *   1. EXTERNAL CLIENT — a user with a `client_access` row is auto-scoped to
 *      that one workspace. The ?clientWorkspaceId query param is IGNORED, so a
 *      client can never pivot to a different client's portal.
 *   2. PREVIEW — org staff may pass ?clientWorkspaceId to preview a workspace
 *      THEIR OWN org owns (WHERE organization_id = caller's org).
 *   3. Everyone else → a non-leaky 403 (no data, no counts).
 *   4. Deliverables are constrained at the DB layer to client-visible document
 *      statuses only — an internal draft is never returned.
 *   5. A missing table degrades one facet closed; the view still returns 200.
 *
 * The DB is fully mocked (pool.query dispatched by SQL substring) and auth is a
 * header stub — these tests pin the access/scoping logic, not JWT verification
 * (covered in environment.test.ts) or live SQL.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

// Auth stub — synthesizes req.user from `TestToken userId:orgId:role:email`.
// No token → 401 (locks that the route requires auth). Same shape the real
// authMiddleware resolves onto the request.
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const h = req.headers.authorization as string | undefined;
    if (!h?.startsWith('TestToken ')) return res.status(401).json({ error: 'No token' });
    const [id, org, role, email] = h.slice('TestToken '.length).split(':');
    req.user = {
      id: id ? Number(id) : undefined,
      organizationId: org ? Number(org) : undefined,
      role: role || 'user',
      email: email || undefined,
    };
    next();
  },
}));

// pool.query dispatched by SQL substring so each store answers independently.
const queryMock = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

/**
 * Every date in the fixtures below is absolute, so "now" has to be absolute
 * too or the suite grades the calendar instead of the code. Only Date is
 * faked — supertest and express need real timers to resolve a request.
 */
const NOW = new Date('2026-07-20T00:00:00.000Z');

let app: express.Express;
let nextFromProject: typeof import('../client-portal').nextFromProject;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const mod = await import('../client-portal');
  const router = mod.default;
  nextFromProject = mod.nextFromProject;
  app = express();
  app.use(express.json());
  app.use('/api/client-portal', router);
});

afterAll(() => {
  vi.useRealTimers();
});

type Rows = { rows: unknown[] };
interface Handlers {
  clientAccess: () => Rows;
  previewOwned: () => Rows;
  programs: () => Rows;
  deliverables: () => Rows;
  updates: () => Rows;
}

/**
 * Order matters: `updates` (activity_feed) and `deliverables` (documents) both
 * mention `projects` in a JOIN/subquery, so match their primary table first,
 * and only then fall through to the bare `FROM projects` programs query.
 */
function dispatch(h: Handlers) {
  queryMock.mockImplementation((sql: string) => {
    if (/FROM client_access/.test(sql)) return Promise.resolve(h.clientAccess());
    if (/FROM client_workspaces/.test(sql)) return Promise.resolve(h.previewOwned());
    if (/FROM activity_feed/.test(sql)) return Promise.resolve(h.updates());
    if (/FROM documents/.test(sql)) return Promise.resolve(h.deliverables());
    if (/FROM projects/.test(sql)) return Promise.resolve(h.programs());
    return Promise.resolve({ rows: [] });
  });
}

/**
 * Target dates are derived from `Date.now()` at query time, never written as a
 * calendar date: `nextFromProject` compares the target against the clock, so a
 * fixed date is a time bomb — the original '2026-09-01' fixture passed the day
 * it was written and failed the day the calendar reached it.
 */
const DAY_MS = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString();
const MER_204_TARGET_DAYS = 30;

/** The one workspace the external-client fixture is scoped to. */
const CLIENT_WS = {
  clientAccess: () => ({
    rows: [{ client_workspace_id: 10, client_name: 'Meridian Therapeutics', cro_name: 'Bright Biosciences' }],
  }),
  previewOwned: () => ({ rows: [] }),
  programs: () => ({
    rows: [
      { id: 501, name: 'MER-204 — IND enabling', code: 'MER-204', type: 'IND', status: 'active', progress: 72, target_end_date: daysFromNow(MER_204_TARGET_DAYS) },
      { id: 502, name: 'MER-118 — 510(k)', code: 'MER-118', type: '510(k)', status: 'active', progress: 48, target_end_date: null },
    ],
  }),
  deliverables: () => ({
    rows: [
      { title: 'Predicate comparison report', project_name: 'MER-118', status: 'approved', updated_at: '2026-07-18T00:00:00Z', validation_status: 'validated' },
      { title: 'IND draft — Module 2.5 Clinical Overview', project_name: 'MER-204', status: 'shared', updated_at: '2026-07-19T00:00:00Z', validation_status: null },
    ],
  }),
  updates: () => ({
    rows: [{ user_name: 'Bright Biosciences', description: 'shared the IND Module 2.5 draft', action: 'share', created_at: '2026-07-19T00:00:00Z' }],
  }),
} satisfies Handlers;

/** Find the pool.query call whose SQL matches `re`; returns [sql, params]. */
function callMatching(re: RegExp): [string, unknown[]] | undefined {
  return queryMock.mock.calls.find((c) => re.test(String(c[0]))) as [string, unknown[]] | undefined;
}

// Block body on purpose: `() => queryMock.mockReset()` returns the mock, and
// vitest treats a function returned from a hook as that hook's teardown and
// calls it after every test — a phantom pool.query() with no SQL.
beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /api/client-portal/overview — access model', () => {
  it('external client is auto-scoped to their own workspace (mode: client)', async () => {
    dispatch(CLIENT_WS);
    const res = await request(app).get('/api/client-portal/overview').set('Authorization', 'TestToken 1::user:elena@meridian.io');
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('client');
    expect(res.body.data.client).toBe('Meridian Therapeutics');
    expect(res.body.data.cro).toBe('Bright Biosciences');
    expect(res.body.data.user).toBe('elena@meridian.io');
    expect(res.body.data.programs).toHaveLength(2);
    expect(res.body.meta.clientWorkspaceId).toBe(10);
    // Programs were fetched for the client_access workspace, not a guessed id.
    expect(callMatching(/FROM projects\b/)?.[1]).toEqual([10]);
  });

  it('IGNORES ?clientWorkspaceId for an external client (no cross-client pivot)', async () => {
    dispatch(CLIENT_WS);
    const res = await request(app)
      .get('/api/client-portal/overview?clientWorkspaceId=999')
      .set('Authorization', 'TestToken 1::user');
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('client');
    expect(res.body.meta.clientWorkspaceId).toBe(10); // still THEIR workspace
    // The programs query must have used 10 — never the attacker-supplied 999.
    const programsParams = callMatching(/FROM projects\b/)?.[1];
    expect(programsParams).toEqual([10]);
    expect(programsParams).not.toContain(999);
    // The preview lookup must not even run for a client.
    expect(callMatching(/FROM client_workspaces/)).toBeUndefined();
  });

  it('org staff may PREVIEW a workspace their own org owns (mode: preview)', async () => {
    dispatch({
      ...CLIENT_WS,
      clientAccess: () => ({ rows: [] }), // staff have no client_access row
      previewOwned: () => ({ rows: [{ id: 7, client_name: 'Client X', cro_name: 'Bright Biosciences' }] }),
    });
    const res = await request(app)
      .get('/api/client-portal/overview?clientWorkspaceId=7')
      .set('Authorization', 'TestToken 5:2:admin:jm@c2c.io');
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('preview');
    expect(res.body.data.client).toBe('Client X');
    expect(res.body.meta.clientWorkspaceId).toBe(7);
    // Preview lookup is org-scoped: WHERE id=$1 AND organization_id=$2.
    expect(callMatching(/FROM client_workspaces/)?.[1]).toEqual([7, 2]);
  });

  it('non-staff with no client_access → non-leaky 403 (no data, no counts)', async () => {
    dispatch({ ...CLIENT_WS, clientAccess: () => ({ rows: [] }) });
    const res = await request(app)
      .get('/api/client-portal/overview?clientWorkspaceId=7')
      .set('Authorization', 'TestToken 9:2:user');
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
    expect(res.body.meta).toBeUndefined();
    expect(res.body.programs).toBeUndefined();
    // A plain member never triggers the preview lookup.
    expect(callMatching(/FROM client_workspaces/)).toBeUndefined();
  });

  it('staff previewing a workspace another org owns → 403 (org-scoped, non-leaky)', async () => {
    dispatch({
      ...CLIENT_WS,
      clientAccess: () => ({ rows: [] }),
      previewOwned: () => ({ rows: [] }), // WHERE organization_id=caller's org matched nothing
    });
    const res = await request(app)
      .get('/api/client-portal/overview?clientWorkspaceId=7')
      .set('Authorization', 'TestToken 5:2:admin');
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });

  it('unauthenticated request → 401', async () => {
    dispatch(CLIENT_WS);
    const res = await request(app).get('/api/client-portal/overview');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/client-portal/overview — sharing filter & shaping', () => {
  it('constrains deliverables to client-visible statuses at the DB layer (drafts excluded)', async () => {
    dispatch(CLIENT_WS);
    const res = await request(app).get('/api/client-portal/overview').set('Authorization', 'TestToken 1::user');
    expect(res.status).toBe(200);

    const [sql, params] = callMatching(/FROM documents/)!;
    // The status allow-list is applied in SQL, so an internal draft never
    // reaches the response regardless of what the caller asks for.
    expect(sql).toMatch(/LOWER\(COALESCE\(d\.status, ''\)\) = ANY\(\$2\)/);
    const allow = params[1] as string[];
    expect(allow).toEqual(expect.arrayContaining(['shared', 'approved', 'final', 'released', 'published', 'signed']));
    expect(allow).not.toContain('draft');
    expect(params[0]).toBe(10); // scoped to the client's workspace
  });

  it('shapes deliverables — lowercased status, program name, e-sig from validation', async () => {
    dispatch(CLIENT_WS);
    const res = await request(app).get('/api/client-portal/overview').set('Authorization', 'TestToken 1::user');
    const dels = res.body.data.deliverables;
    expect(dels).toHaveLength(2);
    expect(dels[0]).toMatchObject({ name: 'Predicate comparison report', prog: 'MER-118', status: 'approved', sig: true });
    expect(dels[1]).toMatchObject({ name: 'IND draft — Module 2.5 Clinical Overview', prog: 'MER-204', status: 'shared', sig: false });
    expect(dels[0].when).toBe('2026-07-18T00:00:00.000Z'); // normalized ISO
  });

  it('shapes programs — code as id, honest null blocker, no fabricated fields', async () => {
    dispatch(CLIENT_WS);
    const res = await request(app).get('/api/client-portal/overview').set('Authorization', 'TestToken 1::user');
    const progs = res.body.data.programs;
    expect(progs[0]).toMatchObject({ id: 'MER-204', title: 'MER-204 — IND enabling', pathway: 'IND', readiness: 72, status: 'active' });
    expect(progs[0].blocker).toBeNull(); // no blocker column → documented null
    // Future target → forward-looking copy, derived from target_end_date. The
    // fixture's target is relative to the frozen clock, so the assertion is
    // exact without being a date that expires.
    expect(progs[0].next).toBe(`Next milestone · ${MER_204_TARGET_DAYS} days`);
    // A row whose target_end_date is null must not invent one.
    expect(progs[1].next).toBe('In active');
    // Shaping adds exactly these keys — a new one has to be asserted, not
    // silently shipped to a client-facing surface.
    expect(Object.keys(progs[0]).sort()).toEqual(
      ['blocker', 'id', 'next', 'pathway', 'readiness', 'status', 'title'],
    );
    // `code` is the id; the numeric PK is not exposed to the client.
    expect(JSON.stringify(progs)).not.toContain('501');
  });

  it('renders a passed target in the past tense — never as a future milestone', async () => {
    const PASSED_DAYS = 3;
    dispatch({
      ...CLIENT_WS,
      programs: () => ({
        rows: [
          { id: 501, name: 'MER-204 — IND enabling', code: 'MER-204', type: 'IND', status: 'active', progress: 72, target_end_date: daysFromNow(-PASSED_DAYS) },
        ],
      }),
    });
    const res = await request(app).get('/api/client-portal/overview').set('Authorization', 'TestToken 1::user');
    expect(res.status).toBe(200);
    const progs = res.body.data.programs;
    expect(progs).toHaveLength(1);
    expect(progs[0].next).toBe(`Target passed ${PASSED_DAYS}d ago`);
    expect(progs[0].next).not.toMatch(/milestone/);
  });

  it('degrades one facet closed on a missing table — view still 200', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM client_access/.test(sql)) return Promise.resolve(CLIENT_WS.clientAccess());
      if (/FROM activity_feed/.test(sql)) return Promise.resolve(CLIENT_WS.updates());
      if (/FROM documents/.test(sql)) return Promise.resolve(CLIENT_WS.deliverables());
      if (/FROM projects/.test(sql)) {
        const e: any = new Error('relation "projects" does not exist');
        e.code = '42P01';
        return Promise.reject(e);
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await request(app).get('/api/client-portal/overview').set('Authorization', 'TestToken 1::user');
    expect(res.status).toBe(200);
    expect(res.body.data.programs).toEqual([]); // facet degraded
    expect(res.body.data.client).toBe('Meridian Therapeutics'); // rest intact
    expect(res.body.data.deliverables).toHaveLength(2);
  });
});

/**
 * The shaping test above exercises one branch through HTTP. These pin the rest
 * directly, against an explicit `now` — the case that broke (a target already
 * in the past) is now a test rather than a Tuesday.
 */
describe('nextFromProject — every branch, against an explicit clock', () => {
  const now = NOW.getTime();

  it('a completed project is Complete regardless of its target date', () => {
    expect(nextFromProject('completed', '2026-09-01T00:00:00Z', now)).toBe('Complete');
    expect(nextFromProject('completed', null, now)).toBe('Complete');
    // Even a target long past does not override completion.
    expect(nextFromProject('completed', '2020-01-01T00:00:00Z', now)).toBe('Complete');
  });

  it('no target date falls back to the status, and invents nothing without one', () => {
    expect(nextFromProject('active', null, now)).toBe('In active');
    expect(nextFromProject(null, null, now)).toBe('');
    expect(nextFromProject('', null, now)).toBe('');
  });

  it('an unparseable target yields empty, never NaN or Invalid Date', () => {
    const out = nextFromProject('active', 'not a date', now);
    expect(out).toBe('');
    expect(out).not.toMatch(/NaN|Invalid/);
  });

  it('a target in the past reports how far past — the case that broke this suite', () => {
    expect(nextFromProject('active', '2026-07-19T00:00:00Z', now)).toBe('Target passed 1d ago');
    expect(nextFromProject('active', '2026-06-20T00:00:00Z', now)).toBe('Target passed 30d ago');
  });

  it('a target today is Target today, not 0 days', () => {
    expect(nextFromProject('active', '2026-07-20T00:00:00Z', now)).toBe('Target today');
    // Same calendar day, later hour — still rounds to today, not a day out.
    expect(nextFromProject('active', '2026-07-20T06:00:00Z', now)).toBe('Target today');
  });

  it('a future target counts days forward', () => {
    expect(nextFromProject('active', '2026-07-21T00:00:00Z', now)).toBe('Next milestone · 1 days');
    expect(nextFromProject('active', '2026-09-01T00:00:00Z', now)).toBe('Next milestone · 43 days');
  });

  it('is a pure function of its arguments — the wall clock cannot change it', () => {
    const target = '2026-09-01T00:00:00Z';
    const atNow = nextFromProject('active', target, now);
    // A year later the same call must produce a different, still-correct answer,
    // proving the result is derived from `now` and not from Date.now().
    const aYearOn = nextFromProject('active', target, now + 365 * 86_400_000);
    expect(atNow).toBe('Next milestone · 43 days');
    expect(aYearOn).toBe('Target passed 322d ago');
  });
});
