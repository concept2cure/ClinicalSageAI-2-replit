import { beforeEach, describe, expect, it } from 'vitest';
import { createAnaMicrokernel } from '../kernel';
import {
  clearKernelDecisionLog,
  getKernelDecisionSummary,
  getRecentKernelDecisions,
  recordKernelDecision,
} from '../decision-log';

describe('kernel decision log', () => {
  beforeEach(() => {
    clearKernelDecisionLog();
  });

  it('records and returns latest entries', () => {
    const kernel = createAnaMicrokernel();
    const decision = kernel.evaluate({ method: 'POST', path: '/api/ana', actorId: 'u1' });

    recordKernelDecision({
      timestamp: new Date().toISOString(),
      method: 'POST',
      path: '/api/ana',
      statusCode: 200,
      requestId: 'r1',
      actorId: 'u1',
      tenantId: 't1',
      kernel: decision,
    });

    const recent = getRecentKernelDecisions(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.requestId).toBe('r1');
  });

  it('builds decision summaries', () => {
    const kernel = createAnaMicrokernel();

    const allowDecision = kernel.evaluate({ method: 'POST', path: '/api/ana', actorId: 'u1' });
    const denyDecision = kernel.evaluate({ method: 'DELETE', path: '/api/audit/events', actorId: 'u1' });

    recordKernelDecision({
      timestamp: new Date().toISOString(),
      method: 'POST',
      path: '/api/ana',
      statusCode: 200,
      requestId: 'allow',
      kernel: allowDecision,
    });

    recordKernelDecision({
      timestamp: new Date().toISOString(),
      method: 'DELETE',
      path: '/api/audit/events',
      statusCode: 403,
      requestId: 'deny',
      kernel: denyDecision,
    });

    const summary = getKernelDecisionSummary();
    expect(summary.total).toBe(2);
    expect(summary.byFinalDecision.allow).toBe(1);
    expect(summary.byFinalDecision.deny).toBe(1);
  });
});
