/**
 * CSR slice 9 (2026-10-29): the Rule-2-defective CSR builder endpoints are gone,
 * the duplicate /api/csr mount of the builder is gone, and /api/csr/jobs still
 * answers from its own router.
 *
 * Retired, each with what replaces it:
 *   POST /safety-signals       asked a model for adverse-event frequencies and
 *                              disproportionality scores (RULE 2). Replaced by the
 *                              engine AE tables of a retained run, read through
 *                              AnA's get_csr_section_evidence (loadCsrAuthoringEvidence).
 *   POST /generate-narrative   a model-written patient narrative from typed-in facts.
 *                              Replaced by the CSR build's narrative job,
 *                              POST /api/csr/jobs/:jobId/narratives.
 *   POST /analyze-benefit-risk a model-written benefit-risk verdict. No client
 *                              caller. The deterministic engines that exist are
 *                              regulatory/benefit-risk.ts (AnA assess_benefit_risk)
 *                              and benefit-risk/benefit-risk-knowledge.ts.
 *   app.use('/api/csr', …)     served every builder route a second time beside
 *                              /api/csr/jobs (a second build path, POST /api/csr/build).
 *   POST /build                (2026-10-29, D5, hand-on from the CSR end-to-end
 *                              lane) the same second build path at /api/csr-builder:
 *                              every section drafted in the request, no job, no
 *                              retained run, no client caller. Replaced by
 *                              POST /api/csr/jobs from the CSR card, which applies
 *                              the same section rule (csr-job-runner).
 *
 * The builder's mount now carries its own authenticateToken. Until then only
 * the RTM export's /api-wide mount, earlier in the same bootstrap and inside its
 * own try/catch, authenticated it: a session-less call was refused (401) only
 * because that unrelated import had succeeded.
 *
 * The real bootstrap (registerClinicalIntelRoutes) mounts the builder; every
 * other router it loads is stubbed. csr-jobs is mounted the way
 * register-document-routes mounts it.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../services/usage-metering.js', () => ({ checkQuota: vi.fn(), recordUsage: vi.fn() }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { complete: vi.fn() } }));
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers['x-test-unauthenticated']) { res.status(401).json({ error: 'Authentication required' }); return; }
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  },
}));
const { asRouter, asFactory } = vi.hoisted(() => ({
  asRouter: async () => ({ default: (await import('express')).Router() }),
  asFactory: async () => { const { Router: make } = await import('express'); return { default: () => make() }; },
}));
vi.mock('../ind.js', asRouter);
vi.mock('../intelligence.js', asRouter);
vi.mock('../protocol_routes.js', async () => ({ protocolRoutes: (await import('express')).Router() }));
vi.mock('../qc.routes.js', asRouter);
vi.mock('../moduleIntegrationRoutes.js', asRouter);
vi.mock('../regulatoryRoutes.js', asRouter);
vi.mock('../document-understanding.js', asRouter);
vi.mock('../rtm-export', asRouter);
vi.mock('../citations', asRouter);
vi.mock('../docs', asRouter);
vi.mock('../source-tracer-routes', asFactory);
vi.mock('../insights-canvas-routes', asFactory);
vi.mock('../c2c/project-vault', asFactory);
vi.mock('../mdx-rbm-board', asFactory);
vi.mock('../governed-intelligence-inconsistency-routes', asFactory);
vi.mock('../deep-research-board.routes', asFactory);
vi.mock('../precedent-engine-board', asFactory);
vi.mock('../conversation-thread-routes', asFactory);
vi.mock('../clinical-regulatory-evidence-routes', async () => ({ ...(await asFactory()), isGraphEnabled: () => false }));

import { authenticateToken } from '../../middleware/auth.js';
import csrJobs from '../csr-jobs.js';
import { registerClinicalIntelRoutes } from '../../bootstrap/register-clinical-intel-routes';

const app = express();
app.use(express.json());
beforeAll(async () => {
  app.use('/api/csr/jobs', authenticateToken, csrJobs);
  await registerClinicalIntelRoutes({ app, pool: {} as never });
  app.use((_req, res) => { res.status(404).json({ error: 'not found' }); });
});

const RETIRED = ['safety-signals', 'generate-narrative', 'analyze-benefit-risk', 'build'];
const body = { drugName: 'LMN-201', indication: 'C. difficile infection', eventDescription: 'Recorded event' };

describe('retired CSR builder endpoints', () => {
  it.each(RETIRED.flatMap(name => [`/api/csr-builder/${name}`, `/api/csr/${name}`]))('POST %s answers 404', async (path) => {
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(404);
  });

  it('no longer mounts the builder a second time at /api/csr', async () => {
    expect((await request(app).get('/api/csr')).status).toBe(404);
    expect((await request(app).get('/api/csr/structure')).status).toBe(404);
    expect((await request(app).post('/api/csr/build').send({})).status).toBe(404);
  });

  it('keeps the builder routes that remain at /api/csr-builder', async () => {
    const res = await request(app).get('/api/csr-builder/structure');
    expect(res.status).toBe(200);
    expect(res.body.totalSections).toBeGreaterThan(0);
  });

  it('mounts the builder behind its own authentication, not only the RTM export\'s /api-wide one', async () => {
    const mounts: unknown[][] = [];
    await registerClinicalIntelRoutes({ app: { use: (...args: unknown[]) => { mounts.push(args); } } as never, pool: {} as never });
    const builder = mounts.find(args => args[0] === '/api/csr-builder');
    expect(builder).toBeDefined();
    expect(builder!.slice(1, -1)).toContain(authenticateToken);
  });

  it('refuses a call without a session before any builder handler', async () => {
    const structure = await request(app).get('/api/csr-builder/structure').set('x-test-unauthenticated', '1');
    expect(structure.status).toBe(401);
    const draft = await request(app).post('/api/csr-builder/draft-section').set('x-test-unauthenticated', '1')
      .send({ sectionNumber: '9.1', studyInfo: body });
    expect(draft.status).toBe(401);
  });

  it('reaches /api/csr/jobs through its own router', async () => {
    const res = await request(app).get('/api/csr/jobs/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Valid numeric job id required' });
  });
});
