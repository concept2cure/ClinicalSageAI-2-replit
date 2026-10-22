/**
 * A connector whose search failed is shown as failed on the research board.
 *
 * toDrRun mapped every persisted connector_logs entry to `state: 'done'` with
 * `hits: resultCount`. The orchestrator writes `{ status: 'error',
 * resultCount: 0, error }` for a source whose search threw, so a failed PubMed
 * read rendered as "done — 0 hits": a "none found" for a source nobody read.
 * A failed log is now `state: 'error'`, `hits: null`, and carries the error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn() }));

vi.mock('../../services/connectors/connector-registry.js', () => ({
  getConnectorCatalog: vi.fn(async () => []),
}));
vi.mock('../../services/deep-research-orchestrator.js', () => ({ listJobs }));
vi.mock('../../services/usage-metering.js', () => ({ getUsageSummary: vi.fn(async () => []) }));
vi.mock('../../services/license-manager.js', () => ({ getLicenseInfo: vi.fn(async () => null) }));

import createDeepResearchBoardRoutes from '../deep-research-board.routes';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: { organizationId: number } }).user = { organizationId: 1 };
    next();
  });
  a.use('/api/deep-research/board', createDeepResearchBoardRoutes());
  return a;
}

beforeEach(() => {
  listJobs.mockReset();
  listJobs.mockResolvedValue([
    {
      id: 11,
      uuid: 'run-11',
      organizationId: 1,
      projectId: null,
      userId: 1,
      status: 'complete',
      query: { indication: 'second-line NSCLC' },
      progress: 100,
      results: null,
      synthesis: null,
      creditsUsed: 1,
      // Exactly what executeResearchJob persists for one failed and one answered source.
      connectorLogs: {
        pubmed: { status: 'error', resultCount: 0, error: 'PubMed returned HTTP 503' },
        fda_drugs: { status: 'success', resultCount: 4 },
      },
      createdAt: new Date('2026-10-15T09:00:00Z'),
      completedAt: new Date('2026-10-15T09:01:00Z'),
    },
  ]);
});

describe('GET /api/deep-research/board — a failed connector is an error, not an empty result', () => {
  it('maps a failed connector log to state "error", no hit count, and its error', async () => {
    const res = await request(app()).get('/api/deep-research/board');
    expect(res.status).toBe(200);
    const jobs = res.body.data.runs[0].jobs as Array<Record<string, unknown>>;
    const pubmed = jobs.find((j) => j.name === 'PubMed / MEDLINE');
    expect(pubmed).toEqual({
      name: 'PubMed / MEDLINE',
      state: 'error',
      hits: null,
      error: 'PubMed returned HTTP 503',
    });
  });

  it('control: an answered connector is done with its persisted count', async () => {
    const res = await request(app()).get('/api/deep-research/board');
    const jobs = res.body.data.runs[0].jobs as Array<Record<string, unknown>>;
    expect(jobs.find((j) => j.name === 'FDA Drugs@FDA')).toEqual({
      name: 'FDA Drugs@FDA',
      state: 'done',
      hits: 4,
      error: null,
    });
  });
});
