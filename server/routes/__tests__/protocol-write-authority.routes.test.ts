/**
 * A viewer may read a protocol and may not change it (21 CFR 11.10(d), (g)).
 *
 * Until 2026-09-28 only the two signing routes, finalize and a review
 * disposition, asked for a writing role. Every other write in the ten
 * ProtocolDev routers was open to any authenticated member of the
 * organisation, a viewer included: sections, the schedule of assessments,
 * risks, deviations and CAPA, the budget, amendments, milestones, consent
 * forms, templates, reviewers and comments. The mounts carry `authMiddleware`
 * only, and it checks who the caller is, not what they may do (periodic review
 * 2026-09-28, editor family, P11-C-1).
 *
 * The routes are read from each router's own stack rather than listed here,
 * so a write route added later is held to the same rule without anyone
 * remembering to add it to this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Router } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ role: 'viewer', statements: [] as string[] }));

const client = {
  query: vi.fn(async (sql: string) => {
    h.statements.push(String(sql).trim().split(/\s+/)[0].toUpperCase());
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('../../db', () => ({
  pool: {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string) => client.query(sql)),
  },
  db: {},
}));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => client }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));

const recordGovernedAction = vi.fn(async () => ({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' }));
vi.mock('../c2c/actions', () => ({
  verifyReauth: vi.fn(async () => ({ ok: true })),
  recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...(a as [])),
}));

// One write carried all the way through, so the case below shows what a
// viewer's request did before the gate: a risk filed and ledgered.
vi.mock('../../services/protocol-risks/protocol-risks-service', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  addRiskTx: vi.fn(async () => ({ id: 77, level: 'high' })),
}));

import protocolAmendments from '../protocol-amendments';
import protocolBudget from '../protocol-budget';
import protocolConsent from '../protocol-consent';
import protocolDevelopment from '../protocol-development';
import protocolDeviations from '../protocol-deviations';
import protocolMilestones from '../protocol-milestones';
import protocolReviews from '../protocol-reviews';
import protocolRisks from '../protocol-risks';
import protocolSoa from '../protocol-soa';
import protocolTemplates from '../protocol-templates';

// Mounted as server/bootstrap/register-inline-routes.ts mounts them.
const ROUTERS: ReadonlyArray<readonly [string, Router]> = [
  ['/api/protocol-amendments', protocolAmendments],
  ['/api/protocol-budget', protocolBudget],
  ['/api/protocol-consent', protocolConsent],
  ['/api/protocol-development', protocolDevelopment],
  ['/api/protocol-deviations', protocolDeviations],
  ['/api/protocol-milestones', protocolMilestones],
  ['/api/protocol-reviews', protocolReviews],
  ['/api/protocol-risks', protocolRisks],
  ['/api/protocol-soa', protocolSoa],
  ['/api/protocol-templates', protocolTemplates],
];

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { userId: 11, organizationId: 2, userRole: h.role, user: { id: 11, organizationId: 2, role: h.role } });
  next();
});
for (const [mount, router] of ROUTERS) app.use(mount, router);

type RouteCase = { label: string; method: string; url: string };
type Layer = { route?: { path: string; methods: Record<string, boolean> } };

const READ_METHODS = new Set(['get', 'head', 'options']);
const ROUTES: RouteCase[] = ROUTERS.flatMap(([mount, router]) =>
  ((router as unknown as { stack: Layer[] }).stack ?? []).flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods)
          .filter((m) => layer.route!.methods[m] && m !== '_all')
          .map((method) => {
            const url = mount + layer.route!.path.replace(/:[A-Za-z_]+/g, '1');
            return { label: `${method.toUpperCase()} ${url}`, method, url };
          })
      : [],
  ),
);
const WRITES = ROUTES.filter((r) => !READ_METHODS.has(r.method));
const READS = ROUTES.filter((r) => READ_METHODS.has(r.method));

const GATE_REFUSAL = { error: 'Insufficient permissions' };

function send(r: RouteCase, body: Record<string, unknown> = {}) {
  const agent = request(app) as unknown as Record<string, (url: string) => request.Test>;
  const req = agent[r.method](r.url);
  return READ_METHODS.has(r.method) ? req : req.send(body);
}

beforeEach(() => {
  h.role = 'viewer';
  h.statements.length = 0;
  vi.clearAllMocks();
});

describe('a viewer can read a protocol and cannot change it (P11-C-1)', () => {
  it('reads the write routes from the routers themselves', () => {
    // 44 on 2026-09-28. Zero would mean the stack was not read, not that
    // nothing writes.
    expect(WRITES.length).toBeGreaterThanOrEqual(44);
    expect(READS.length).toBeGreaterThan(0);
  });

  it('a viewer adding a risk is refused, and nothing is filed or ledgered', async () => {
    const r = await request(app)
      .post('/api/protocol-risks/documents/5/risks')
      .send({ description: 'Hepatotoxicity at the 40 mg dose', likelihood: 'possible', impact: 'major', reason: 'Raised at the safety review meeting.' });
    expect(r.status).toBe(403);
    expect(r.body).toEqual(GATE_REFUSAL);
    expect(h.statements).toEqual([]);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('the same request from a member is filed and ledgered', async () => {
    h.role = 'member';
    const r = await request(app)
      .post('/api/protocol-risks/documents/5/risks')
      .send({ description: 'Hepatotoxicity at the 40 mg dose', likelihood: 'possible', impact: 'major', reason: 'Raised at the safety review meeting.' });
    expect(r.status).toBe(201);
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
  });

  it.each(WRITES.map((r) => [r.label, r] as const))('refuses a viewer: %s', async (_label, r) => {
    const res = await send(r);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(GATE_REFUSAL);
    expect(h.statements).toEqual([]);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it.each(WRITES.map((r) => [r.label, r] as const))('lets a member past the role check: %s', async (_label, r) => {
    h.role = 'member';
    const res = await send(r);
    expect(res.body).not.toEqual(GATE_REFUSAL);
  });

  it.each(READS.map((r) => [r.label, r] as const))('leaves a read open to a viewer: %s', async (_label, r) => {
    const res = await send(r);
    expect(res.body).not.toEqual(GATE_REFUSAL);
  });

  it('refuses a caller whose session carries no role', async () => {
    h.role = '';
    const r = await request(app).patch('/api/protocol-development/sections/1').send({ content: 'x', reason: 'A reason of some length.' });
    expect(r.status).toBe(403);
    expect(h.statements).toEqual([]);
  });
});
