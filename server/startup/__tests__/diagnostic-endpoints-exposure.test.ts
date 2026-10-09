/**
 * What the diagnostic endpoints tell whom (security audit 2026-09-24, IAM-18
 * items 2 and 3; plan P1-17).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * GET /api/metrics accepted the METRICS_TOKEN bearer or ANY platform session:
 * every tenant's every user could read the process and pool figures. GET
 * /api/ai-gateway/health, on the public allow-list, told an unauthenticated
 * caller which LLM providers are configured, their health, latency and error
 * rates, and on an exception echoed the exception's message.
 *
 * Pinned here: metrics need the scrape token or a platform administrator;
 * the gateway health answers an anonymous caller with a status word and nothing
 * else (no provider names, no exception text), and the full detail only to a
 * platform administrator at /detail. The real requireMetricsAuth, requirePlatformAdmin and
 * handlers run; authenticateToken is a double that reads a fake bearer so the
 * test controls who is asking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';

const OWNER = 'owner@concept2cure.ai';
const MEMBER = 'member@acme.test';
const SCRAPE_TOKEN = 'scrape-token-for-this-test';

// Sessions, keyed by a fake bearer value.
const SESSIONS: Record<string, { id: number; email: string }> = {
  'session-owner': { id: 1, email: OWNER },
  'session-member': { id: 2, email: MEMBER },
};

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, res: Response, next: NextFunction) => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    const session = m ? SESSIONS[m[1]] : undefined;
    if (!session) return res.status(401).json({ error: { code: 'AUTH_001', message: 'Authentication required' } });
    (req as any).user = { id: session.id, email: session.email, role: 'member', provider: 'local-jwt' };
    (req as any).userId = session.id;
    next();
  },
}));

// requirePlatformAdmin's grants fallback and the metrics handler's pool read.
vi.mock('../../db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  pool: { totalCount: 3, idleCount: 2, waitingCount: 0 },
  db: {},
}));

const gateway = vi.hoisted(() => ({
  failWith: null as Error | null,
  providers: [
    { name: 'anthropic', healthy: true, consecutiveFailures: 0, avgLatencyMs: 812, requestCount: 40, errorRate: 0 },
    { name: 'openai', healthy: false, consecutiveFailures: 4, avgLatencyMs: 0, requestCount: 3, errorRate: 1 },
  ],
}));
vi.mock('../../services/ai-gateway', () => ({
  getGateway: () => ({
    getProviderHealth: () => {
      if (gateway.failWith) throw gateway.failWith;
      return gateway.providers;
    },
    getEnabledProviders: () => ['anthropic', 'openai'],
  }),
}));

import { mountDiagnosticEndpoints } from '../inline-endpoints';

function app() {
  const a = express();
  mountDiagnosticEndpoints(a, { query: async () => ({ rows: [{ '?column?': 1 }] }) } as any);
  return a;
}

const savedAdmins = process.env.PLATFORM_ADMIN_EMAILS;
const savedToken = process.env.METRICS_TOKEN;
beforeEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = OWNER;
  process.env.METRICS_TOKEN = SCRAPE_TOKEN;
  gateway.failWith = null;
});
afterEach(() => {
  if (savedAdmins === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = savedAdmins;
  if (savedToken === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = savedToken;
});

describe('GET /api/metrics', () => {
  it("a tenant user's session is refused (403)", async () => {
    const r = await request(app()).get('/api/metrics').set('Authorization', 'Bearer session-member');
    expect(r.status, 'any signed-in user could read the process metrics').toBe(403);
    expect(r.text).not.toContain('process_memory');
  });

  it('a platform administrator reads them', async () => {
    const r = await request(app()).get('/api/metrics').set('Authorization', 'Bearer session-owner');
    expect(r.status).toBe(200);
    expect(r.text).toContain('process_memory_heap_used_bytes');
  });

  it('the scrape token reads them (the Prometheus path, unchanged)', async () => {
    const r = await request(app()).get('/api/metrics').set('Authorization', `Bearer ${SCRAPE_TOKEN}`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('process_uptime_seconds');
  });

  it('an anonymous caller is refused (401)', async () => {
    const r = await request(app()).get('/api/metrics');
    expect(r.status).toBe(401);
  });
});

describe('GET /api/ai-gateway/health', () => {
  it('answers an anonymous caller with a status word and nothing about the providers', async () => {
    const r = await request(app()).get('/api/ai-gateway/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'healthy' });
    expect(r.text, 'provider names reached an anonymous caller').not.toMatch(/anthropic|openai/);
  });

  it('gives a platform administrator the provider detail, at /detail', async () => {
    const r = await request(app()).get('/api/ai-gateway/health/detail').set('Authorization', 'Bearer session-owner');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('healthy');
    expect(r.body.providers).toHaveLength(2);
    expect(r.body.enabledProviders).toEqual(['anthropic', 'openai']);
  });

  it("the detail refuses a tenant user's session (403) and an anonymous caller (401)", async () => {
    expect((await request(app()).get('/api/ai-gateway/health/detail').set('Authorization', 'Bearer session-member')).status).toBe(403);
    expect((await request(app()).get('/api/ai-gateway/health/detail')).status).toBe(401);
  });

  it("a tenant user's session gets the same answer as an anonymous caller", async () => {
    const r = await request(app()).get('/api/ai-gateway/health').set('Authorization', 'Bearer session-member');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'healthy' });
  });

  it('never echoes an exception to an anonymous caller', async () => {
    gateway.failWith = new Error('provider openai rejected key sk-live-0000 (401)');
    const r = await request(app()).get('/api/ai-gateway/health');
    expect(r.status).toBe(500);
    expect(r.text, 'the exception text reached an anonymous caller').not.toContain('sk-live');
    expect(r.text).not.toContain('openai');
  });
});
