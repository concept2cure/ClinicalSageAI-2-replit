/**
 * A section is ASSESSED only when something was checked — otherwise it is
 * NOT ASSESSED, and never a pass.
 *
 * Nothing can write a gating rule or a CTQ factor (their create and update
 * routes answer 501 NOT_AVAILABLE — RULE 2, see qms-subrouters-governed.test.ts),
 * so on every real database these stores are empty. Before this change an empty
 * collection chose the verdict:
 *
 *   - POST /validate-section and POST /batch-validate answered `valid: true`
 *     ("all sections pass automatically") for a section with no rule — and, one
 *     level down, for a rule that named nothing checkable: no factor, a retired
 *     one, one with no criteria, or one that does not exist;
 *   - GET /dashboard/:qmpId divided by `totalFactors || 1`, so a plan with no
 *     factors linked read "0% complete" and a 0/0/0 risk profile.
 *
 * Now each of those is `valid: null, assessed: false` (server/services/qms/
 * quality-gating-verdict.ts, which both routes run); a batch is valid only when
 * every section was assessed and none failed — a soft gate's failure included;
 * a rule with no threshold is the column default, a hard gate; factor ids stored
 * as strings are read; validate-section answers 404 for a plan the caller's
 * organization does not have; and a dashboard with no factor linked reports its
 * shares as null. The assessed paths are pinned alongside as controls.
 *
 * Real DDL (migrations/0000_sweet_joseph.sql), real Drizzle over a PGlite
 * request client installed as `req.dbClient`, both mounts of the validation
 * router.
 */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractTableDdl, makeRequestDbClient } from '../../../tests/golden-journeys/harness';

vi.mock('../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/tenantContext', () => ({
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
  tenantContext: (_q: unknown, _s: unknown, n: () => void) => n(),
  getTenantContext: (req: any) => ({ organizationId: String(req.tenantContext.organizationId) }),
}));

import qualityValidationRouter from '../tenant-quality-validation';
import qualityRouter from '../quality-management-api';

const ORG = 7;
const OTHER = 9;
const VALIDATE_MOUNTS = ['/api/tenant-quality-validation', '/api/quality/validation'] as const;

let pg: PGlite;
let dbClient: ReturnType<typeof makeRequestDbClient>;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req as any, {
      userRole: 'admin',
      userId: 11,
      tenantId: ORG,
      tenantContext: { organizationId: ORG, userId: 11, role: 'admin' },
      dbClient,
    });
    next();
  });
  a.use('/api/tenant-quality-validation', qualityValidationRouter);
  a.use('/api/quality', qualityRouter);
  return a;
}

async function plan(org = ORG): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO quality_management_plans (organization_id, name) VALUES ($1, 'CER Quality Plan') RETURNING id`,
    [org],
  );
  return r.rows[0].id;
}
async function factor(qmp: number, status: string, risk = 'high', criteria: string | null = null): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO ctq_factors (organization_id, qmp_id, name, category, risk_level, status, validation_criteria)
     VALUES ($1, $2, 'Endpoints defined', 'clinical', $3, $4, $5) RETURNING id`,
    [ORG, qmp, risk, status, criteria],
  );
  return r.rows[0].id;
}
/** `threshold` undefined takes the column default (100); null stores NULL. */
async function rule(qmp: number, sectionKey: string, factorIds: unknown[], threshold?: number | null) {
  await pg.query(
    `INSERT INTO qmp_section_gating (organization_id, qmp_id, section_key, section_name, required_ctq_factor_ids, minimum_mandatory_completion)
     VALUES ($1, $2, $3, $3, $4, ${threshold === undefined ? 'DEFAULT' : '$5'})`,
    threshold === undefined
      ? [ORG, qmp, sectionKey, JSON.stringify(factorIds)]
      : [ORG, qmp, sectionKey, JSON.stringify(factorIds), threshold],
  );
}
const batch = (qmpId: number, sections: Array<[string, string]>) =>
  request(app())
    .post('/api/quality/batch-validate')
    .send({ qmpId, sections: sections.map(([sectionCode, content]) => ({ sectionCode, content })) });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    extractTableDdl('migrations/0000_sweet_joseph.sql', [
      'quality_management_plans',
      'ctq_factors',
      'qmp_section_gating',
    ]),
  );
  dbClient = makeRequestDbClient(pg);
});
afterAll(async () => {
  await pg.close();
});
// No RESTART IDENTITY: the dashboard caches by plan id, so every test needs a
// plan id no earlier test used.
beforeEach(async () => {
  await pg.exec('TRUNCATE qmp_section_gating, ctq_factors, quality_management_plans;');
});

describe('a section no gating rule covers is not assessed, never passed', () => {
  it.each(VALIDATE_MOUNTS)('%s/validate-section: valid null, assessed false — not valid: true', async (mount) => {
    const qmpId = await plan();
    const res = await request(app())
      .post(`${mount}/validate-section`)
      .send({ qmpId, sectionCode: 'benefit-risk', content: 'Text.' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBeNull();
    expect(res.body.assessed).toBe(false);
    expect(res.body.message).toMatch(/not assessed/i);
    expect(res.body.validations).toEqual([]);
  });

  it.each(VALIDATE_MOUNTS)('%s/validate-section: a plan this organization does not have is 404, not "not assessed"', async (mount) => {
    const others = await plan(OTHER);
    for (const qmpId of [others, 999999]) {
      const res = await request(app())
        .post(`${mount}/validate-section`)
        .send({ qmpId, sectionCode: 'benefit-risk', content: 'Text.' });
      expect(res.status).toBe(404);
      expect(res.body.valid).toBeUndefined();
    }
  });

  it('batch-validate with no rules at all: nothing assessed, and the batch does not say the sections meet requirements', async () => {
    const qmpId = await plan();
    const res = await batch(qmpId, [['benefit-risk', 'A'], ['safety', 'B']]);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBeNull();
    expect(res.body.assessed).toBe(false);
    expect(res.body.message).toMatch(/not assessed/i);
    expect(res.body.message).not.toMatch(/meet quality requirements/i);
    const NO_RULE = 'No quality gating rule is defined for this section, so it was not assessed.';
    expect(res.body.sectionResults).toEqual([
      expect.objectContaining({ sectionCode: 'benefit-risk', valid: null, assessed: false, message: NO_RULE }),
      expect.objectContaining({ sectionCode: 'safety', valid: null, assessed: false, message: NO_RULE }),
    ]);
  });

  it('batch-validate, one section assessed and passing, one not: undecided, and it says one was not assessed', async () => {
    const qmpId = await plan();
    await rule(qmpId, 'benefit-risk', [await factor(qmpId, 'active', 'high', 'primary endpoint')]);
    const res = await batch(qmpId, [['benefit-risk', 'The primary endpoint is defined.'], ['safety', 'B']]);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBeNull();
    expect(res.body.assessed).toBe(false);
    expect(res.body.message).toMatch(/^1 of 2 sections was not assessed/);
    const bySection = Object.fromEntries(res.body.sectionResults.map((s: any) => [s.sectionCode, s]));
    expect(bySection['benefit-risk']).toEqual(expect.objectContaining({ valid: true, assessed: true }));
    expect(bySection.safety).toEqual(expect.objectContaining({ valid: null, assessed: false }));
  });

  it('control: every section assessed and passing — the batch is valid and says so', async () => {
    const qmpId = await plan();
    const f = await factor(qmpId, 'active', 'high', 'primary endpoint');
    await rule(qmpId, 'benefit-risk', [f]);
    await rule(qmpId, 'safety', [f]);
    const res = await batch(qmpId, [['benefit-risk', 'primary endpoint'], ['safety', 'primary endpoint']]);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.assessed).toBe(true);
    expect(res.body.message).toBe('All sections meet quality requirements');
  });
});

/* One level down: a rule that covers the section but names nothing that can be
   checked. Before, each of these answered valid: true and "Section meets
   quality requirements" — an empty factor collection choosing the verdict. */
describe('a rule that names nothing checkable is not assessed, never passed', () => {
  const NOTHING_CHECKABLE: Array<[string, (qmp: number) => Promise<unknown[]>, RegExp]> = [
    ['names no factor', async () => [], /names no active CTQ factor with validation criteria/],
    ['names only a retired factor', async (q) => [await factor(q, 'retired', 'high', 'primary endpoint')], /names no active CTQ factor/],
    ['names a factor with no validation criteria', async (q) => [await factor(q, 'active', 'high', null)], /names no active CTQ factor/],
    ['names a factor that does not exist', async () => [424242], /names CTQ factor 424242, which does not exist/],
    ['has a list that cannot be read', async () => ['not-an-id'], /cannot be read/],
  ];

  it.each(NOTHING_CHECKABLE)('validate-section, a rule that %s', async (_label, ids, message) => {
    const qmpId = await plan();
    await rule(qmpId, 'benefit-risk', await ids(qmpId));
    const res = await request(app())
      .post('/api/quality/validation/validate-section')
      .send({ qmpId, sectionCode: 'benefit-risk', content: 'Anything at all.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ valid: null, assessed: false, validations: [] }));
    expect(res.body.message).toMatch(message);
  });

  it.each(NOTHING_CHECKABLE)('batch-validate, a rule that %s', async (_label, ids, message) => {
    const qmpId = await plan();
    await rule(qmpId, 'benefit-risk', await ids(qmpId));
    const res = await batch(qmpId, [['benefit-risk', 'Anything at all.']]);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBeNull();
    expect(res.body.message).not.toMatch(/meet quality requirements/i);
    expect(res.body.sectionResults[0]).toEqual(expect.objectContaining({ valid: null, assessed: false }));
    expect(res.body.sectionResults[0].message).toMatch(message);
  });
});

/* A rule that lists factors. Its lookups bound the id list as a row
   constructor, `= ANY(($1, …))`, which Postgres rejects, so each of these
   answered 500 whenever a rule named a factor (docs/api/quality-gating-api-
   reference.md recorded it as a known defect). */
describe('a rule that lists CTQ factors is assessed against them', () => {
  async function coveredByEndpointFactor(asStrings = false) {
    const qmpId = await plan();
    const f = await factor(qmpId, 'active', 'high', 'primary endpoint');
    await rule(qmpId, 'benefit-risk', [asStrings ? String(f) : f]);
    return { qmpId, f };
  }

  it.each(VALIDATE_MOUNTS)('%s/validate-section: a missing high-risk term fails the section — 200, not 500', async (mount) => {
    const { qmpId, f } = await coveredByEndpointFactor();
    const res = await request(app())
      .post(`${mount}/validate-section`)
      .send({ qmpId, sectionCode: 'benefit-risk', content: 'No endpoints here.' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.assessed).toBe(true);
    expect(res.body.validations).toEqual([
      expect.objectContaining({ factorId: f, passed: false, message: 'Missing required terms: primary endpoint' }),
    ]);
  });

  it('batch-validate: the same section fails its hard gate, and the batch says so', async () => {
    const { qmpId } = await coveredByEndpointFactor();
    const res = await batch(qmpId, [['benefit-risk', 'No endpoints here.']]);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.message).toBe('One or more sections contain critical quality issues');
    expect(res.body.sectionResults[0]).toEqual(expect.objectContaining({ valid: false, gatingLevel: 'hard' }));
  });

  it('batch-validate: a section that fails a soft gate fails the batch', async () => {
    const qmpId = await plan();
    await rule(qmpId, 'benefit-risk', [await factor(qmpId, 'active', 'high', 'primary endpoint')], 90);
    const res = await batch(qmpId, [['benefit-risk', 'No endpoints here.']]);

    expect(res.body.sectionResults[0]).toEqual(expect.objectContaining({ valid: false, gatingLevel: 'soft' }));
    expect(res.body.valid).toBe(false);
    expect(res.body.message).toBe('One or more sections contain critical quality issues');
  });

  it('batch-validate: a rule with no threshold recorded is the column default — a hard gate, not an informational one', async () => {
    const qmpId = await plan();
    await rule(qmpId, 'benefit-risk', [await factor(qmpId, 'active', 'high', 'primary endpoint')], null);
    const res = await batch(qmpId, [['benefit-risk', 'No endpoints here.']]);

    expect(res.body.sectionResults[0]).toEqual(expect.objectContaining({ valid: false, gatingLevel: 'hard' }));
    expect(res.body.valid).toBe(false);
  });

  it('factor ids stored as strings are read: both routes assess the factor, and the plan returns it', async () => {
    const { qmpId, f } = await coveredByEndpointFactor(true);
    const one = await request(app())
      .post('/api/quality/validation/validate-section')
      .send({ qmpId, sectionCode: 'benefit-risk', content: 'No endpoints here.' });
    const many = await batch(qmpId, [['benefit-risk', 'No endpoints here.']]);
    const detail = await request(app()).get(`/api/quality/plans/${qmpId}`);

    expect(one.body).toEqual(expect.objectContaining({ valid: false, assessed: true }));
    expect(many.body.sectionResults[0]).toEqual(expect.objectContaining({ valid: false, assessed: true }));
    expect(detail.body.sections[0].ctqFactors.map((x: { id: number }) => x.id)).toEqual([f]);
  });

  it('GET /plans/:id returns the rule with its factor', async () => {
    const { qmpId, f } = await coveredByEndpointFactor();
    const res = await request(app()).get(`/api/quality/plans/${qmpId}`);

    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(1);
    expect(res.body.sections[0].ctqFactors.map((x: { id: number }) => x.id)).toEqual([f]);
  });

  it('an empty batch is refused, not answered with a verdict about nothing', async () => {
    const qmpId = await plan();
    const res = await request(app()).post('/api/quality/batch-validate').send({ qmpId, sections: [] });

    expect(res.status).toBe(400);
    expect(res.body.valid).toBeUndefined();
  });
});

describe('the plan dashboard never computes a figure from nothing', () => {
  it('no CTQ factor linked: completeness and the risk shares are null — not 0%', async () => {
    const qmpId = await plan();
    const res = await request(app()).get(`/api/quality/dashboard/${qmpId}`);

    expect(res.status).toBe(200);
    expect(res.body.factors.totalFactors).toBe(0);
    expect(res.body.overallCompleteness).toBeNull();
    expect(res.body.riskProfile).toEqual({
      highRiskPercentage: null,
      mediumRiskPercentage: null,
      lowRiskPercentage: null,
    });
  });

  it('control: two factors linked, one active — 50% complete, half high risk; a string id counts', async () => {
    const qmpId = await plan();
    const a = await factor(qmpId, 'active', 'high');
    const b = await factor(qmpId, 'retired', 'low');
    await rule(qmpId, 'benefit-risk', [a, String(b)]);
    const res = await request(app()).get(`/api/quality/dashboard/${qmpId}`);

    expect(res.status).toBe(200);
    expect(res.body.factors.totalFactors).toBe(2);
    expect(res.body.overallCompleteness).toBe(50);
    expect(res.body.riskProfile).toEqual({
      highRiskPercentage: 50,
      mediumRiskPercentage: 0,
      lowRiskPercentage: 50,
    });
  });

  it('a rule with no threshold recorded counts as a hard gate', async () => {
    const qmpId = await plan();
    await rule(qmpId, 'benefit-risk', [], null);
    const res = await request(app()).get(`/api/quality/dashboard/${qmpId}`);

    expect(res.body.sections.sectionsByGateLevel).toEqual({ hard: 1, soft: 0, info: 0 });
  });
});
