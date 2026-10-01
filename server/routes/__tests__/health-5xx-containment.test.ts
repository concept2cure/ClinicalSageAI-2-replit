/**
 * Health probes — a failed probe answers without the thrower's text
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * server/routes/health.ts has no importer today, but it is a Kubernetes /
 * load-balancer probe router: wherever it is mounted it is reached without a
 * session, so it is held to the tenant-facing rule, not exempted as an
 * operator diagnostic. Its two 500s answered `error: error.message`, and its
 * deep check's degraded (503) report carried the database and SagePlus probe
 * errors verbatim — a connection target or a driver message, to anyone who
 * can reach a health port.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL connect ECONNREFUSED 10.20.30.40:5432';

const { dbHealth, sageHealth, poolQuery, logError, logWarn } = vi.hoisted(() => ({
  dbHealth: vi.fn(),
  sageHealth: vi.fn(),
  poolQuery: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('../../db', () => ({
  healthCheck: dbHealth,
  pool: { totalCount: 1, waitingCount: 0, query: poolQuery },
}));
vi.mock('../../sage-plus-service', () => ({ healthCheck: sageHealth }));
vi.mock('../../middleware/circuitBreaker', () => ({
  CircuitState: { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' },
  getCircuitBreaker: () => undefined,
}));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  const scoped = () => ({ error: logError, warn: logWarn, info: vi.fn(), debug: vi.fn() });
  return { ...actual, createScopedLogger: scoped, createContextLogger: scoped };
});

import router from '../health';

function app() {
  const a = express();
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-health');
    next();
  });
  a.use(router);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbHealth.mockResolvedValue(true);
  sageHealth.mockResolvedValue({ status: 'operational', databaseConnected: true });
  poolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
});

describe('health probe failures: no thrower text in the body', () => {
  it('GET /health/ready — a throwing probe answers 500 with the envelope', async () => {
    dbHealth.mockRejectedValue(new Error(SENTINEL));
    const res = await request(app()).get('/health/ready');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
    expect(JSON.stringify(res.body)).not.toContain('10.20.30.40');
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.correlationId).toBe('req-set-a-health');
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('GET /health/deep — a failed database probe degrades to 503 without the driver text', async () => {
    dbHealth.mockRejectedValue(new Error(SENTINEL));
    const res = await request(app()).get('/health/deep');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.database.status).toBe('error');
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
    expect(JSON.stringify(res.body)).not.toContain('10.20.30.40');
    expect(JSON.stringify([...logWarn.mock.calls, ...logError.mock.calls])).toContain('SENTINEL-DB-DETAIL');
  });

  it('GET /health/deep — a failed SagePlus probe degrades to 503 without the thrower text', async () => {
    sageHealth.mockRejectedValue(new Error('SENTINEL-SAGE-DETAIL getaddrinfo ENOTFOUND sage-plus.internal'));
    const res = await request(app()).get('/health/deep');
    expect(res.status).toBe(503);
    expect(res.body.services.sagePlus.status).toBe('error');
    expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-SAGE-DETAIL|sage-plus\.internal/);
  });

  it('GET /health/deep — a failed latency probe keeps status ok and drops the thrower text', async () => {
    poolQuery.mockRejectedValue(new Error('SENTINEL-LATENCY-DETAIL timeout exceeded when trying to connect'));
    const res = await request(app()).get('/health/deep');
    expect(res.status).toBe(200);
    expect(res.body.services.database.status).toBe('ok');
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-LATENCY-DETAIL');
  });

  it('leaves the healthy answers unchanged', async () => {
    const live = await request(app()).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');
    const ready = await request(app()).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ok');
  });
});
