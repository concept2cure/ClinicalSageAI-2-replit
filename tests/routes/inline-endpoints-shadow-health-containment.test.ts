/**
 * GET /api/shadow/health tells no caller why the shadow service is unreachable
 * (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The route is not on the public allow-list and carries no requireMetricsAuth,
 * so every signed-in user of every tenant reaches it — it is not an
 * operator-only diagnostic. Its catch answered
 * `{ error: 'Shadow service unavailable', message: error.message }`; when the
 * fetch fails that message is the transport's, e.g.
 * `connect ECONNREFUSED 10.0.4.21:8001` — the internal host and port of the
 * shadow service. The 502 keeps its status and its sentence; the transport
 * text goes to the log.
 *
 * The upstream's own non-OK answer is passed through as before (the route
 * proxies it), pinned beside it unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../server/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
  db: {},
}));
vi.mock('../../server/services/ai-gateway', () => ({
  getGateway: () => ({ getProviderHealth: () => [], getEnabledProviders: () => [] }),
}));

import { mountDiagnosticEndpoints } from '../../server/startup/inline-endpoints';

const SENTINEL = 'connect ECONNREFUSED 10.9.8.7:8001 SENTINEL-TRANSPORT-DETAIL';

function app() {
  const a = express();
  mountDiagnosticEndpoints(a, { query: async () => ({ rows: [] }) } as never);
  return a;
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/shadow/health: the 502 body is contained', () => {
  it('answers an unreachable shadow service with the static sentence, never the transport text', async () => {
    fetchMock.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).get('/api/shadow/health');
    expect(r.status).toBe(502);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-TRANSPORT-DETAIL');
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('10.9.8.7');
    expect(r.body).toEqual({ error: 'Shadow service unavailable' });
  });

  it('leaves the pass-through of the upstream non-OK answer exactly as it was', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'degraded' }), { status: 503 }));
    const r = await request(app()).get('/api/shadow/health');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'Shadow service health check failed', details: { status: 'degraded' } });
  });
});
