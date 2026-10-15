/**
 * POST /api/orchestration/execute hands the workflow the request's client address.
 *
 * Until 2026-10-15 the route passed nothing and executeWorkflow dispatched every
 * action with `ipAddress: '127.0.0.1'`, so each action's Part 11 audit row named
 * the loopback interface as its origin (VSR finding #9). The address now comes
 * from the one reader of it, server/utils/client-ip.ts: req.ip as resolved by
 * the trusted-proxy hop count, or 'unknown' when the request carried none
 * (regulatory_audit_logs.ip_address is NOT NULL, so null would drop the row).
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ executeWorkflow: vi.fn() }));

vi.mock('../../services/orchestration', () => ({
  executeWorkflow: h.executeWorkflow,
  cancelWorkflow: vi.fn(() => true),
  getWorkflowExecution: vi.fn(() => null),
  getProjectWorkflows: vi.fn(() => []),
  getRegisteredTemplates: vi.fn(() => []),
  assembleCrossObjectPayload: vi.fn(),
  computeReadinessAssessment: vi.fn(),
  generateRecommendations: vi.fn(),
  generateContinuitySnapshot: vi.fn(),
  getLatestSnapshot: vi.fn(() => null),
}));

import orchestrationRouter from '../orchestration';

function app(clientAddress: string | undefined) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 1, email: 'runner@example.test', role: 'admin' };
    // req.ip is a prototype getter; an own property stands in for the address
    // Express would have resolved from the socket and the trusted hops.
    Object.defineProperty(req, 'ip', { value: clientAddress, configurable: true });
    next();
  });
  a.use('/api/orchestration', orchestrationRouter);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.executeWorkflow.mockResolvedValue({ executionId: 'e-1', status: 'completed', steps: [] });
});

describe('POST /execute', () => {
  it('passes the request client address to the workflow for its audit rows', async () => {
    const r = await request(app('203.0.113.9'))
      .post('/api/orchestration/execute')
      .send({ templateId: 'project_blocker_scan', projectId: 7 });
    expect(r.status).toBe(200);
    expect(h.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'project_blocker_scan', projectId: 7, organizationId: 1 }),
      { ipAddress: '203.0.113.9' },
    );
  });

  it('records an absent address as unknown, never as a loopback literal', async () => {
    await request(app(undefined))
      .post('/api/orchestration/execute')
      .send({ templateId: 'project_blocker_scan', projectId: 7 });
    expect(h.executeWorkflow).toHaveBeenCalledWith(expect.anything(), { ipAddress: 'unknown' });
  });
});
