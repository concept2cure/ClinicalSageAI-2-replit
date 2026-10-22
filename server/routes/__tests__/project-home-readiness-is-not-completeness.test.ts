/**
 * Document completeness is not presented as readiness (finding 4, 2026-10-15).
 *
 * What the code used to do: the readiness engine's overallScore is the
 * weighted average of the dimensions something measured. With no readiness
 * assessment on record — every production call — that is document-status
 * completeness alone (approved 1, in review 0.7, draft 0.3). The project-home
 * read-model nevertheless answered isReady true and "Ready — readiness score 75"
 * for a project with two approved, one in-review and one draft document, and
 * GET /api/intelligence/projects/:id/readiness returned it as overallScore 75.
 * Quality, consistency and compliance had not been assessed.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn(),
  readiness: vi.fn(),
  nextActions: vi.fn(),
  intel: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: {} }));
vi.mock('../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: {} }));
vi.mock('../../services/intelligence/index.js', () => ({
  computeReadinessScore: h.readiness,
  generateNextActions: h.nextActions,
  getProjectIntelligence: h.intel,
}));

import createProjectHomeRoutes from '../project-home-routes';
import intelligenceRouter from '../intelligence';

const ORG = 7;

/** 2 approved + 1 in review + 1 draft, no readiness assessment on record. */
const COMPLETENESS_ONLY = {
  overallScore: 75,
  dimensions: { completeness: 75, quality: null, consistency: null, compliance: null },
  moduleBreakdown: [],
  gaps: [],
  trend: { direction: 'unknown', delta: null, dataPoints: 0 },
  predictions: {
    approvalProbability: null,
    estimatedReviewDays: null,
    estimatedDeficiencies: null,
    basis: 'no_assessment_on_record',
  },
  scoreBasis: {
    source: 'no_assessment_on_record',
    measured: ['completeness'],
    notMeasured: ['quality', 'consistency', 'compliance'],
  },
  scoredAt: '2026-10-15T00:00:00.000Z',
};

/** A recorded assessment that measured quality and compliance as well. */
const ASSESSED = {
  ...COMPLETENESS_ONLY,
  overallScore: 82,
  dimensions: { completeness: 75, quality: 90, consistency: null, compliance: 85 },
  scoreBasis: {
    source: 'twin_assessment',
    measured: ['completeness', 'quality', 'compliance'],
    notMeasured: ['consistency'],
  },
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 3, organizationId: ORG };
    next();
  });
  a.use('/api/project-home', createProjectHomeRoutes());
  a.use('/api/intelligence', intelligenceRouter);
  return a;
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.query.mockImplementation(async (sql: string) =>
    /FROM projects p/.test(sql)
      ? { rows: [{ id: 42, name: 'Alpha', status: 'active', depth: 0, path: null }] }
      : { rows: [] },
  );
  h.nextActions.mockResolvedValue({ actions: [] });
  h.intel.mockResolvedValue(null);
});

describe('GET /api/project-home/:projectId', () => {
  it('with completeness alone: no readiness score, no "Ready", and the unassessed dimensions named', async () => {
    h.readiness.mockResolvedValue(COMPLETENESS_ONLY);
    const res = await request(app()).get('/api/project-home/42');
    expect(res.status).toBe(200);
    expect(res.body.data.intelligence.readinessStatus).not.toMatch(/^Ready/);
    expect(res.body.data.intelligence.readinessStatus).toBe(
      'Readiness not assessed — document completeness 75% (document status only); ' +
        'quality, consistency and compliance not assessed',
    );
    expect(res.body.data.readiness.isReady).toBeNull();
    expect(res.body.data.readiness.score).toBeNull();
    expect(res.body.data.readiness.dimensions.completeness).toBe(75);
    expect(res.body.data.readiness.scoreBasis.source).toBe('no_assessment_on_record');
  });

  it('a recorded assessment still yields its readiness score and verdict', async () => {
    h.readiness.mockResolvedValue(ASSESSED);
    const res = await request(app()).get('/api/project-home/42');
    expect(res.status).toBe(200);
    expect(res.body.data.readiness.score).toBe(82);
    expect(res.body.data.readiness.isReady).toBe(true);
    expect(res.body.data.intelligence.readinessStatus).toBe('Ready — readiness score 82');
  });
});

describe('GET /api/intelligence/projects/:projectId/readiness', () => {
  it('returns no overall readiness score when only completeness was measured', async () => {
    h.readiness.mockResolvedValue(COMPLETENESS_ONLY);
    const res = await request(app()).get('/api/intelligence/projects/42/readiness');
    expect(res.status).toBe(200);
    expect(res.body.overallScore).toBeNull();
    expect(res.body.dimensions.completeness).toBe(75);
    expect(res.body.scoreBasis.notMeasured).toEqual(['quality', 'consistency', 'compliance']);
  });

  it('keeps the score of a recorded assessment', async () => {
    h.readiness.mockResolvedValue(ASSESSED);
    const res = await request(app()).get('/api/intelligence/projects/42/readiness');
    expect(res.body.overallScore).toBe(82);
  });
});
