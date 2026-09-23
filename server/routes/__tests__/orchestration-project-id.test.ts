/**
 * Which project an orchestration route assesses (VSR-001 F-23).
 *
 * The engine behind /api/orchestration reads the integer-keyed project spine
 * (`projects.id`). A program's id is a uuid.
 *   - POST /execute checked only that a projectId was present, so a program's
 *     uuid started a readiness review of a project nothing could be read from,
 *     and the review completed with "No critical issues found".
 *   - The other routes parsed the id with parseInt, which reads a uuid that
 *     begins with a digit as that digit. The readiness of project 1 was
 *     returned for a request that named program 1d3c….
 * Every route now takes the id only when it is wholly a positive integer, and
 * refuses anything else before the engine is called.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  executeWorkflow: vi.fn(async (r: { projectId: unknown; organizationId: number }) => ({
    executionId: 'run-1',
    status: 'completed',
    projectId: r.projectId,
    organizationId: r.organizationId,
  })),
  assembleCrossObjectPayload: vi.fn(async (scope: { projectId: number }) => ({ scope })),
}));

vi.mock('../../services/orchestration', () => ({
  executeWorkflow: h.executeWorkflow,
  cancelWorkflow: vi.fn(() => true),
  getWorkflowExecution: vi.fn(() => null),
  getProjectWorkflows: vi.fn(() => []),
  getRegisteredTemplates: vi.fn(() => []),
  assembleCrossObjectPayload: h.assembleCrossObjectPayload,
  computeReadinessAssessment: vi.fn((payload: { scope: { projectId: number } }) => ({
    projectId: payload.scope.projectId,
    overallScore: 40,
  })),
  generateRecommendations: vi.fn(() => ({ recommendations: [] })),
  generateContinuitySnapshot: vi.fn(async (_org: number, projectId: number) => ({ projectId })),
  getLatestSnapshot: vi.fn(() => null),
}));

import orchestrationRouter from '../orchestration';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 1, email: 'runner@example.test', role: 'admin' };
    next();
  });
  a.use('/api/orchestration', orchestrationRouter);
  return a;
}

/** A program id of the kind intake returns, beginning with a digit. */
const PROGRAM_UUID = '1d3cc4a5-5ffa-4ff1-ae79-6e3a4222b6dc';

beforeEach(() => {
  h.executeWorkflow.mockClear();
  h.assembleCrossObjectPayload.mockClear();
});

describe('POST /execute', () => {
  it('refuses a program uuid before any run exists', async () => {
    const r = await request(app())
      .post('/api/orchestration/execute')
      .send({ templateId: 'submission_readiness_review', projectId: PROGRAM_UUID });

    expect(h.executeWorkflow).not.toHaveBeenCalled();
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/positive integer/);
  });

  it('runs the review for a project id', async () => {
    const r = await request(app())
      .post('/api/orchestration/execute')
      .send({ templateId: 'submission_readiness_review', projectId: 7 });

    expect(r.status).toBe(200);
    expect(h.executeWorkflow).toHaveBeenCalledWith(expect.objectContaining({ projectId: 7, organizationId: 1 }));
  });
});

describe('the routes that assess a project', () => {
  it.each([
    ['GET', `/api/orchestration/projects/${PROGRAM_UUID}/readiness`, undefined],
    ['GET', `/api/orchestration/readiness/freshness/${PROGRAM_UUID}`, undefined],
    ['POST', '/api/orchestration/readiness', { projectId: PROGRAM_UUID }],
    ['POST', '/api/orchestration/recommendations', { projectId: PROGRAM_UUID }],
    ['POST', '/api/orchestration/continuity', { projectId: PROGRAM_UUID }],
  ])('%s %s never assesses project 1 for program 1d3c…', async (method, path, body) => {
    const call = method === 'GET' ? request(app()).get(path) : request(app()).post(path).send(body);
    const r = await call;

    expect(h.assembleCrossObjectPayload).not.toHaveBeenCalled();
    expect(r.status).toBe(400);
  });

  it('assesses the project a numeric id names', async () => {
    const r = await request(app()).get('/api/orchestration/projects/7/readiness');

    expect(r.status).toBe(200);
    expect(h.assembleCrossObjectPayload).toHaveBeenCalledWith(expect.objectContaining({ projectId: 7 }));
  });
});
