/**
 * Contract tests for the §524B cybersecurity, human-factors, and post-market
 * surveillance APIs. Auth mocked; no DB or network (pure endpoints only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

async function appFor(mod: string, base: string): Promise<express.Express> {
  const router = (await import(mod)).default;
  const app = express();
  app.use(express.json());
  app.use(base, router);
  return app;
}

describe('cybersecurity §524B API', () => {
  let app: express.Express;
  beforeEach(async () => {
    app = await appFor('../cybersecurity-524b', '/api/cybersecurity-524b');
  });
  const post = (p: string, b: object) => request(app).post(`/api/cybersecurity-524b${p}`).send(b);

  it('sbom-completeness scores a populated SBOM', async () => {
    const res = await post('/sbom-completeness', {
      components: [{ componentName: 'x', version: '1', supplier: 's', uniqueIdentifier: 'u' }],
      author: 'a',
      timestamp: 't',
      dependencyRelationshipsDocumented: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.result.completenessScore).toBeCloseTo(1, 8);
  });

  it('readiness lists gaps', async () => {
    const res = await post('/readiness', { sbom: true });
    expect(res.status).toBe(200);
    expect(res.body.result.ready).toBe(false);
    expect(res.body.result.gaps).toContain('threatModel');
  });

  it('rejects an empty SBOM with 400', async () => {
    const res = await post('/sbom-completeness', { components: [] });
    expect(res.status).toBe(400);
  });
});

describe('human factors API', () => {
  let app: express.Express;
  beforeEach(async () => {
    app = await appFor('../human-factors', '/api/human-factors');
  });
  const post = (p: string, b: object) => request(app).post(`/api/human-factors${p}`).send(b);

  it('use-related-risk identifies critical tasks', async () => {
    const res = await post('/use-related-risk', {
      scenarios: [
        { task: 'Set dose', useError: 'x', potentialHarmSeverity: 'critical', mitigated: false },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.result.criticalTaskCount).toBe(1);
    // Was `residualRiskAcceptable` — a determination the service computed from a
    // count and served in the response body. The endpoint now reports the
    // critical-task gate it actually found, and never acceptability.
    expect(res.body.result.criticalTaskGate).toBe('blocked');
    expect(res.body.result).not.toHaveProperty('residualRiskAcceptable');
  });

  it('rejects an invalid severity with 400', async () => {
    const res = await post('/use-related-risk', {
      scenarios: [{ task: 't', useError: 'x', potentialHarmSeverity: 'fatal', mitigated: true }],
    });
    expect(res.status).toBe(400);
  });
});

describe('post-market surveillance API', () => {
  let app: express.Express;
  beforeEach(async () => {
    app = await appFor('../postmarket-surveillance', '/api/postmarket-surveillance');
  });
  const post = (p: string, b: object) => request(app).post(`/api/postmarket-surveillance${p}`).send(b);

  it('maude/aggregate returns counts and serious subset', async () => {
    const res = await post('/maude/aggregate', {
      events: [
        { reportNumber: 'A', eventType: 'Death', dateReceived: '2026-05-15', productProblems: ['Leak'] },
        { reportNumber: 'B', eventType: 'Malfunction', dateReceived: '2026-05-16' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.result.total).toBe(2);
    expect(res.body.result.seriousCount).toBe(1);
  });

  it('recalls/summarize counts by classification', async () => {
    const res = await post('/recalls/summarize', {
      recalls: [
        { recallNumber: 'Z1', classification: 'Class I' },
        { recallNumber: 'Z2', classification: 'Class II' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.result.classICount).toBe(1);
  });
});
