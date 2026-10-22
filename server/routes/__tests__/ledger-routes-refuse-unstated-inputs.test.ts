/**
 * The assumption and decision routes refuse what nobody stated — with a 400
 * naming it — instead of recording a value or an actor in its place.
 *
 * /api/operating-system wrote a request with no authenticated user as
 * performedBy 'system' (assumption supersession, every decision transition),
 * handed createdById undefined to services that then recorded created_by /
 * decided_by 'system', and cleared reviewed_by when an anonymous request changed
 * an assumption's status. The registry filled a missing category, source and
 * rationale with 'regulatory_pathway', 'expert_opinion' and 'No rationale
 * provided'. On /api/governed-intelligence an out-of-vocabulary value reached
 * the INSERT and came back as a 500. The real services run here over a mocked
 * pool; only the database is replaced.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query }, db: {} }));
vi.mock('../../db', () => ({ pool: { query: H.query }, db: {} }));
vi.mock('../../services/contradiction-engine-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/contradiction-engine-service')>()),
  contradictionEngineService: { detectAssumptionDrift: async () => [] },
}));
vi.mock('../../services/reactive-dependency-service', () => ({
  reactiveDependencyService: { propagateChange: async () => undefined },
}));
vi.mock('../../middleware/orgMembership', () => ({
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
  governedActorId: (req: { user?: { id?: number } }) => req.user?.id ?? null,
}));

import operatingSystemRouter from '../operating-system';
import governedIntelligenceRouter from '../assumption-decision-contradiction';

const ID = '0b7e1d2a-1111-4222-8333-944455556666';
const ROW = { id: ID, organization_id: 3, project_id: 12, status: 'active', action_state: 'proposed' };

/** A session with a tenant, and a user unless `userId` is null. */
function app(userId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).organizationId = 3;
    (req as any).user = userId == null ? { organizationId: 3 } : { id: userId, organizationId: 3 };
    next();
  });
  a.use('/api/operating-system', operatingSystemRouter);
  a.use('/api/governed-intelligence', governedIntelligenceRouter);
  return a;
}

const writes = () =>
  H.query.mock.calls.map(([sql]) => String(sql)).filter((sql) => /INSERT INTO|UPDATE /.test(sql));

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async (sql: string) =>
    /INSERT INTO|UPDATE |SELECT \* FROM/.test(sql) ? { rows: [ROW], rowCount: 1 } : { rows: [], rowCount: 0 },
  );
});

const ASSUMPTION = {
  projectId: 12,
  name: 'ASM-ENR-001',
  description: 'Planned enrollment',
  category: 'enrollment',
  value: '450',
  rationale: 'Protocol v2, section 9.2',
  sourceType: 'protocol',
  domainTrack: 'biostatistics',
};
const DECISION = {
  projectId: 12,
  recommendationType: 'statistical_method',
  recommendationSummary: 'Analyse the primary endpoint with MMRM',
  domainTrack: 'biostatistics',
};

describe('/api/operating-system without an authenticated user', () => {
  it.each([
    ['post', '/assumptions', ASSUMPTION],
    ['patch', `/assumptions/${ID}`, { status: 'active' }],
    ['post', `/assumptions/${ID}/supersede`, { replacement: ASSUMPTION, reason: 'Revised enrollment' }],
    ['post', '/decisions', DECISION],
    ['patch', `/decisions/${ID}`, { actionState: 'approved' }],
    ['post', `/decisions/${ID}/supersede`, { replacement: DECISION, reason: 'Replaced' }],
    ['post', `/decisions/${ID}/execute`, { executedArtifactId: 9 }],
    ['post', `/decisions/${ID}/escalate`, { reason: 'Needs the DMC' }],
  ] as const)('%s %s is refused, and nothing is written as "system"', async (method, path, body) => {
    const res = await request(app(null))[method](`/api/operating-system${path}`).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(writes()).toEqual([]);
  });
});

describe('/api/operating-system with a user', () => {
  it.each(['category', 'sourceType', 'rationale'] as const)(
    'refuses an assumption with no %s rather than inventing one',
    async (field) => {
      const res = await request(app(41)).post('/api/operating-system/assumptions').send({ ...ASSUMPTION, [field]: undefined });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(field);
      expect(writes()).toEqual([]);
    },
  );

  it('refuses a rejection with no reason rather than recording "No reason provided"', async () => {
    const res = await request(app(41)).post(`/api/operating-system/decisions/${ID}/reject`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/);
    expect(writes()).toEqual([]);
  });

  it('refuses a decision confidence outside the ledger vocabulary', async () => {
    const res = await request(app(41)).post('/api/operating-system/decisions').send({ ...DECISION, confidence: 'provisional' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confidence/);
    expect(writes()).toEqual([]);
  });

  it('records what was stated, and no confidence nobody stated', async () => {
    const res = await request(app(41)).post('/api/operating-system/assumptions').send(ASSUMPTION);
    expect(res.status).toBe(201);
    const insert = H.query.mock.calls.find(([sql]) => /INSERT INTO assumption_records/.test(String(sql)));
    const params = insert?.[1] as unknown[];
    expect(params[5]).toBe('enrollment');
    expect(params[11]).toBeNull();
    expect(params[16]).toBe('41');
  });
});

describe('/api/governed-intelligence', () => {
  it('answers an assumption the registry cannot record with a 400 naming the field, not a 500', async () => {
    const res = await request(app(41))
      .post('/api/governed-intelligence/assumptions')
      .send({
        projectId: 12,
        assumptionCode: 'ASM-ENR-001',
        title: 'Planned enrollment',
        domainTrack: 'biostatistics',
        category: 'analysis_population',
        assumedValue: '450',
        rationale: 'Protocol v2, section 9.2',
        sourceType: 'protocol',
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: 'category' });
    expect(writes()).toEqual([]);
  });

  it('answers a decision confidence the ledger cannot record with a 400', async () => {
    const res = await request(app(41))
      .post('/api/governed-intelligence/decisions')
      .send({
        projectId: 12,
        decisionCode: 'DEC-1',
        title: 'Analysis method',
        domainTrack: 'biostatistics',
        recommendationType: 'statistical_method',
        recommendationSummary: 'MMRM',
        confidenceLevel: 'strong',
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: 'confidenceLevel' });
    expect(writes()).toEqual([]);
  });
});
