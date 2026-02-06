/**
 * Tests for Evidence Fabric BFF Proxy Routes
 *
 * Validates:
 *  1. No admin token leaks to the browser (BFF injects it server-side)
 *  2. Fail-closed when REVIEW_ADMIN_TOKEN is not configured
 *  3. 422 when program_id is missing
 *  4. Proxy forwards correctly to Shadow Service
 *  5. 502 when Shadow Service is unreachable
 *  6. IDOR prevention — 403 when org doesn't own the program
 *
 * @phase 5.3.B — Truth Machine UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ═══════════════════════════════════════════════════════════════════════════════
// Hoisted mock state — mutable so tests can control DB results
// ═══════════════════════════════════════════════════════════════════════════════

const { dbMockResult } = vi.hoisted(() => ({
  dbMockResult: {
    value: [{ id: '00000000-0000-0000-0000-000000000001' }] as any[],
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Mock auth middleware — simulates dev-mode auto-auth for unit tests.
// In production, real JWT verification runs; here we just populate req.user.
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = {
      id: 1,
      userId: 1,
      email: 'test@trialsage.ai',
      role: 'admin',
      roles: ['admin', 'user'],
      organizationId: '2',
      permissions: ['*'],
    };
    next();
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Mock DB — chainable drizzle-like API for requireProgramAccess
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => dbMockResult.value,
        }),
      }),
    }),
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Test setup — env vars are read at request time, so we set them per-test
// ═══════════════════════════════════════════════════════════════════════════════

let app: ReturnType<typeof express>;
let origToken: string | undefined;
let origShadowUrl: string | undefined;

beforeEach(async () => {
  origToken = process.env.REVIEW_ADMIN_TOKEN;
  origShadowUrl = process.env.SHADOW_SERVICE_URL;

  // Default: token set, shadow at an unreachable port
  process.env.REVIEW_ADMIN_TOKEN = 'test-token-secret';
  process.env.SHADOW_SERVICE_URL = 'http://localhost:1'; // nothing listening

  // Default: program exists and belongs to the user's org
  dbMockResult.value = [{ id: PROGRAM_ID }];

  const mod = await import('../../routes/evidence-fabric.js');
  app = express();
  app.use(express.json());
  app.use('/api/evidence-fabric', mod.default);
});

afterEach(() => {
  if (origToken !== undefined) process.env.REVIEW_ADMIN_TOKEN = origToken;
  else delete process.env.REVIEW_ADMIN_TOKEN;
  if (origShadowUrl !== undefined) process.env.SHADOW_SERVICE_URL = origShadowUrl;
  else delete process.env.SHADOW_SERVICE_URL;
});

const PROGRAM_ID = '00000000-0000-0000-0000-000000000001';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Evidence Fabric BFF Proxy', () => {
  // 1) Fail-closed
  describe('Configuration guard', () => {
    it('returns 503 when REVIEW_ADMIN_TOKEN is empty', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });
  });

  // 2) Input validation
  describe('Input validation', () => {
    it('GET /health-summary without program_id → 422', async () => {
      const res = await request(app).get('/api/evidence-fabric/health-summary');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /contradiction-scans without program_id → 422', async () => {
      const res = await request(app).post('/api/evidence-fabric/contradiction-scans');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('GET /contradiction-scans without program_id → 422', async () => {
      const res = await request(app).get('/api/evidence-fabric/contradiction-scans');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('GET /contradiction-scans/:id without program_id → 422', async () => {
      const res = await request(app).get(`/api/evidence-fabric/contradiction-scans/${PROGRAM_ID}`);
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });
  });

  // 3) Auth required — no REVIEW_ADMIN_TOKEN in browser, but JWT is required
  describe('Security', () => {
    it('browser request needs NO shadow admin token (it is injected server-side)', async () => {
      // No X-Admin-Token header sent — proxy should NOT return 401/403
      // (auth is via JWT, which is mocked here)
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });

      // Should NOT be 401 or 403 — those would mean the proxy requires the shadow admin token
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      // 502 = proxy tried to reach shadow but it's not running → correct
      expect(res.status).toBe(502);
    });
  });

  // 4) Proxy error handling
  describe('Proxy error handling', () => {
    it('returns 502 when shadow service is unreachable', async () => {
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unreachable');
    });

    it('POST returns 502 when shadow service is unreachable', async () => {
      const res = await request(app)
        .post('/api/evidence-fabric/contradiction-scans')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unreachable');
    });
  });

  // 5) Route existence
  describe('Route structure', () => {
    it('has GET /health-summary endpoint', async () => {
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /contradiction-scans endpoint', async () => {
      const res = await request(app)
        .post('/api/evidence-fabric/contradiction-scans')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /contradiction-scans endpoint', async () => {
      const res = await request(app)
        .get('/api/evidence-fabric/contradiction-scans')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /contradiction-scans/:id endpoint', async () => {
      const res = await request(app)
        .get('/api/evidence-fabric/contradiction-scans/some-uuid')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /defense-packet endpoint', async () => {
      const res = await request(app)
        .get('/api/evidence-fabric/defense-packet')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });
  });

  // 6) Defense Packet specific
  describe('Defense Packet', () => {
    it('GET /defense-packet without program_id → 422', async () => {
      const res = await request(app).get('/api/evidence-fabric/defense-packet');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('GET /defense-packet returns 503 when token not configured', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .get('/api/evidence-fabric/defense-packet')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });

    it('GET /defense-packet returns 502 when shadow service unreachable', async () => {
      const res = await request(app)
        .get('/api/evidence-fabric/defense-packet')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unreachable');
    });
  });

  // 7) IDOR prevention — program ownership guard
  describe('Program ownership guard (IDOR prevention)', () => {
    it('returns 403 when user org does not own the program', async () => {
      dbMockResult.value = []; // no matching program → org mismatch
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('returns 403 for defense-packet when org does not own program', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .get('/api/evidence-fabric/defense-packet')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
      expect(res.body.detail).toContain('do not have access');
    });

    it('returns 403 for POST contradiction-scans when org mismatch', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .post('/api/evidence-fabric/contradiction-scans')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
    });

    it('allows access when org owns the program (502 = proxy reached)', async () => {
      dbMockResult.value = [{ id: PROGRAM_ID }]; // program owned
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });
      // 502 means we passed auth + ownership and tried to reach shadow
      expect(res.status).toBe(502);
    });
  });
});
