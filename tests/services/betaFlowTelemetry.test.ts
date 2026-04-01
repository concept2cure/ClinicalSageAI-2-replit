import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyBetaFlow,
  getBetaFlowTelemetrySnapshot,
  recordBetaFlowEvent,
  resetBetaFlowTelemetry,
} from '../../server/services/telemetry/betaFlowTelemetry';

describe('betaFlowTelemetry', () => {
  beforeEach(() => {
    resetBetaFlowTelemetry();
  });

  it('classifies beta-critical paths', () => {
    expect(classifyBetaFlow('GET', '/api/concept2cure/onboarding/status')).toBe('onboarding');
    expect(classifyBetaFlow('POST', '/api/projects')).toBe('project_creation');
    expect(classifyBetaFlow('POST', '/api/documents/123/status')).toBe('authoring');
    expect(classifyBetaFlow('POST', '/api/programs/1/export')).toBe('exports');
  });

  it('aggregates requests, errors, and error rate', () => {
    recordBetaFlowEvent('authoring', 200, 50, { method: 'POST', path: '/api/documents/1' });
    recordBetaFlowEvent('authoring', 503, 150, { method: 'POST', path: '/api/documents/1/export' });

    const summary = getBetaFlowTelemetrySnapshot();
    const detailed = getBetaFlowTelemetrySnapshot({ includeErrorEvents: true });
    const authoring = summary.telemetry.find(x => x.flow === 'authoring');
    const routeErrors = summary.telemetry.find(x => x.flow === 'route_errors');

    expect(authoring).toMatchObject({
      requests: 2,
      errors: 1,
      errorRate: 0.5,
      avgDurationMs: 100,
    });

    expect(routeErrors).toMatchObject({
      requests: 1,
      errors: 1,
      errorRate: 1,
      avgDurationMs: 150,
    });

    expect(detailed.recentErrorEvents).toHaveLength(1);
    expect(detailed.recentErrorEvents?.[0]).toMatchObject({
      method: 'POST',
      path: '/api/documents/1/export',
      statusCode: 503,
      flow: 'authoring',
    });
  });

  it('records reset events when reset has audit reason', () => {
    recordBetaFlowEvent('exports', 500, 40, { method: 'POST', path: '/api/export' });
    resetBetaFlowTelemetry({ actorId: '7', actorRole: 'admin', reason: 'routine beta monitor reset' });

    const detailed = getBetaFlowTelemetrySnapshot({ includeResetEvents: true });
    const resetEvents = detailed.recentResetEvents || [];
    expect(resetEvents).toHaveLength(1);
    expect(resetEvents[0]).toMatchObject({
      actorId: '7',
      actorRole: 'admin',
      reason: 'routine beta monitor reset',
    });
  });
});
