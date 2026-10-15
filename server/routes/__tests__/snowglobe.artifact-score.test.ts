/**
 * GET /api/snowglobe/artifacts/:id/scores scores an artifact from the findings
 * that name it — not from its id.
 *
 * Before 2026-10-01 it took the first `3 + (artifactId % 4)` findings that
 * impacted ANY artifact and scored the artifact from those, so two artifacts
 * with identical findings scored differently and an artifact no finding
 * touched still carried a risk level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: 7 };
    next();
  },
}));
vi.mock('../../lib/unified-ai-client', () => ({ aiComplete: vi.fn() }));
vi.mock('../../services/regulatory-guidance-retrieval', () => ({
  retrieveGuidance: vi.fn(),
  formatGuidanceForPrompt: vi.fn(),
}));

const SECTION_TITLES: Record<number, string> = { 11: 'Device description', 12: 'Bench testing' };
let lastSectionId = 0;
vi.mock('../../db/requestDb', () => ({
  requestDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            SECTION_TITLES[lastSectionId] ? [{ title: SECTION_TITLES[lastSectionId] }] : [],
        }),
      }),
    }),
  }),
}));

const FINDINGS = [
  { engine: 'agency_screen', severity: 'critical', blastRadius: { artifactsImpacted: 1, sectionsImpacted: ['Bench testing'] } },
  { engine: 'reviewer_attack', severity: 'low', blastRadius: { artifactsImpacted: 1, sectionsImpacted: ['Bench testing'] } },
  { engine: 'audit_inspection', severity: 'high', blastRadius: { artifactsImpacted: 1, sectionsImpacted: ['Labeling'] } },
];
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({
    query: async (_org: number, _sub: string, filter: (f: unknown) => boolean) => FINDINGS.filter(filter),
    insert: vi.fn(),
  }),
}));

let app: express.Express;
beforeEach(async () => {
  const router = (await import('../snowglobe')).default;
  app = express();
  app.use((req, _res, next) => {
    const m = req.path.match(/\/(?:artifacts|dossier-nodes)\/(\d+)/);
    lastSectionId = m ? Number(m[1]) : 0;
    next();
  });
  app.use('/api/snowglobe', router);
});

describe('artifact score', () => {
  it('scores from the findings that name the artifact', async () => {
    const res = await request(app).get('/api/snowglobe/artifacts/12/scores');
    expect(res.status).toBe(200);
    expect(res.body.data.findingsImpacting).toBe(2);
    expect(res.body.data.overallScore).toBe(100 - 25 - 3);
    expect(res.body.data.engineBreakdown).toEqual({ agency_screen: 75, reviewer_attack: 97, audit_inspection: 100 });
  });

  it('a section no finding names is not at risk, whatever its id', async () => {
    const res = await request(app).get('/api/snowglobe/artifacts/11/scores');
    expect(res.body.data.findingsImpacting).toBe(0);
    expect(res.body.data.overallScore).toBe(100);
  });

  it('an id that is not a section is not scored', async () => {
    const res = await request(app).get('/api/snowglobe/artifacts/99/scores');
    expect(res.body.data.overallScore).toBeNull();
    expect(res.body.data.riskLevel).toBeNull();
    expect(res.body.data.assessmentSource).toBe('no-data');
  });
});
