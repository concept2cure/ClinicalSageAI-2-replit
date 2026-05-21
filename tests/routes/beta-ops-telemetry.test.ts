import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { createMockRequest, createMockResponse, expectStatus } from '../setup';

const telemetryMocks = vi.hoisted(() => ({
  getBetaFlowTelemetrySnapshot: vi.fn(),
  resetBetaFlowTelemetry: vi.fn(),
}));

vi.mock('../../server/services/telemetry/betaFlowTelemetry', () => telemetryMocks);

import betaOpsRouter from '../../server/routes/beta-ops-telemetry';

const getHandler = () => {
  const layer = (betaOpsRouter as any).stack.find(
    (l: any) => l.route?.path === '/beta-telemetry' && l.route?.methods?.get
  );
  return layer?.route?.stack?.[layer.route.stack.length - 1]?.handle as
    | ((req: any, res: any) => Promise<void>)
    | undefined;
};

describe('beta-ops telemetry route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_BETA_OPS_TELEMETRY = 'true';
    telemetryMocks.getBetaFlowTelemetrySnapshot.mockReturnValue({
      telemetry: [{ flow: 'onboarding', requests: 1 }],
    });
  });

  it('returns telemetry for authenticated users without reset', async () => {
    const req = createMockRequest({ query: {} }) as any;
    req.user = { id: 10, role: 'reviewer' };
    const res = createMockResponse();
    const handler = getHandler();
    expect(handler).toBeDefined();

    await handler!(req, res);

    expect(res.json).toHaveBeenCalled();
    expect(telemetryMocks.resetBetaFlowTelemetry).not.toHaveBeenCalled();
  });

  it('returns 404 when telemetry flag is disabled', async () => {
    process.env.ENABLE_BETA_OPS_TELEMETRY = 'false';
    const req = createMockRequest({ query: {} }) as any;
    req.user = { id: 10, role: 'reviewer' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expectStatus(res, 404);
    expect(telemetryMocks.getBetaFlowTelemetrySnapshot).not.toHaveBeenCalled();
  });

  it('fails closed for reset when role is not admin', async () => {
    const req = createMockRequest({ query: { reset: 'true' }, headers: {} }) as any;
    req.user = { id: 10, role: 'reviewer' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expectStatus(res, 403);
    expect(telemetryMocks.resetBetaFlowTelemetry).not.toHaveBeenCalled();
  });

  it('allows reset for admin with explicit confirmation header', async () => {
    const req = createMockRequest({
      query: { reset: 'true', reason: 'weekly controlled beta window reset' },
      headers: { 'x-confirm-reset': 'BETA_TELEMETRY_RESET' },
    }) as any;
    req.user = { id: 1, role: 'admin' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expect(telemetryMocks.resetBetaFlowTelemetry).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalled();
  });

  it('fails closed for include_errors when role is not admin', async () => {
    const req = createMockRequest({ query: { include_errors: 'true' } }) as any;
    req.user = { id: 22, role: 'author' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expectStatus(res, 403);
  });

  it('fails closed for include_resets when role is not admin', async () => {
    const req = createMockRequest({ query: { include_resets: 'true' } }) as any;
    req.user = { id: 22, role: 'author' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expectStatus(res, 403);
  });

  it('requires reset reason for admin reset', async () => {
    const req = createMockRequest({
      query: { reset: 'true', reason: 'short' },
      headers: { 'x-confirm-reset': 'BETA_TELEMETRY_RESET' },
    }) as any;
    req.user = { id: 1, role: 'admin' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expectStatus(res, 400);
    expect(telemetryMocks.resetBetaFlowTelemetry).not.toHaveBeenCalled();
  });

  it('resets before reading snapshot so reset response is fresh', async () => {
    const req = createMockRequest({
      query: { reset: 'true', reason: 'weekly controlled beta window reset' },
      headers: { 'x-confirm-reset': 'BETA_TELEMETRY_RESET' },
    }) as any;
    req.user = { id: 1, role: 'admin' };
    const res = createMockResponse();
    const handler = getHandler();

    await handler!(req, res);

    expect(telemetryMocks.resetBetaFlowTelemetry).toHaveBeenCalledOnce();
    expect(telemetryMocks.getBetaFlowTelemetrySnapshot).toHaveBeenCalledOnce();
    const resetOrder = telemetryMocks.resetBetaFlowTelemetry.mock.invocationCallOrder[0];
    const snapshotOrder = telemetryMocks.getBetaFlowTelemetrySnapshot.mock.invocationCallOrder[0];
    expect(resetOrder).toBeLessThan(snapshotOrder);
  });
});
