/**
 * Tests for Predicate Intelligence BFF Proxy Routes
 *
 * Validates:
 *  1. Fail-closed when REVIEW_ADMIN_TOKEN is not set (503)
 *  2. 422 when program_id is missing
 *  3. IDOR prevention — 403 when org doesn't own the program
 *  4. Proxy forwards correctly (502 when shadow unreachable)
 *  5. Route existence for all endpoints
 *  6. POST /suggest specific validation
 *
 * @phase 6.6.B — Predicate Suggestion Engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ═══════════════════════════════════════════════════════════════════════════════
// Hoisted mock state
// ═══════════════════════════════════════════════════════════════════════════════

const { dbMockResult } = vi.hoisted(() => ({
  dbMockResult: {
    value: [{ id: '00000000-0000-0000-0000-000000000001' }] as any[],
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Mock auth middleware — stub JWT verification for unit tests
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
// Test setup
// ═══════════════════════════════════════════════════════════════════════════════

let app: ReturnType<typeof express>;
let origToken: string | undefined;
let origShadowUrl: string | undefined;

const PROGRAM_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(async () => {
  origToken = process.env.REVIEW_ADMIN_TOKEN;
  origShadowUrl = process.env.SHADOW_SERVICE_URL;

  process.env.REVIEW_ADMIN_TOKEN = 'test-token-secret';
  process.env.SHADOW_SERVICE_URL = 'http://localhost:1'; // nothing listening

  dbMockResult.value = [{ id: PROGRAM_ID }];

  const mod = await import('../../routes/predicate-intelligence.js');
  app = express();
  app.use(express.json());
  app.use('/api/predicate-intelligence', mod.default);
});

afterEach(() => {
  if (origToken !== undefined) process.env.REVIEW_ADMIN_TOKEN = origToken;
  else delete process.env.REVIEW_ADMIN_TOKEN;
  if (origShadowUrl !== undefined) process.env.SHADOW_SERVICE_URL = origShadowUrl;
  else delete process.env.SHADOW_SERVICE_URL;
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('Predicate Intelligence BFF Proxy', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1) Configuration guard (fail-closed)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Configuration guard', () => {
    it('POST /suggest returns 503 when REVIEW_ADMIN_TOKEN is empty', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .query({ program_id: PROGRAM_ID })
        .send({ product_code: 'QEI', device_description: 'test device' });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });

    it('POST /candidates returns 503 when token is empty', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .post('/api/predicate-intelligence/candidates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2) Input validation — program_id required
  // ─────────────────────────────────────────────────────────────────────────

  describe('Input validation', () => {
    it('POST /suggest without program_id → 422', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .send({ product_code: 'QEI', device_description: 'test device' });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /candidates without program_id → 422', async () => {
      const res = await request(app).post('/api/predicate-intelligence/candidates');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /analyze without program_id → 422', async () => {
      const res = await request(app).post('/api/predicate-intelligence/analyze');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /defense-preview without program_id → 422', async () => {
      const res = await request(app).post('/api/predicate-intelligence/defense-preview');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /se-matrix without program_id → 422', async () => {
      const res = await request(app).post('/api/predicate-intelligence/se-matrix');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3) IDOR prevention
  // ─────────────────────────────────────────────────────────────────────────

  describe('Program ownership guard (IDOR prevention)', () => {
    it('POST /suggest returns 403 when org does not own program', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .query({ program_id: PROGRAM_ID })
        .send({ product_code: 'QEI', device_description: 'test device' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('POST /candidates returns 403 when org does not own program', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .post('/api/predicate-intelligence/candidates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('allows access when org owns program (502 = auth passed, proxy reached)', async () => {
      dbMockResult.value = [{ id: PROGRAM_ID }];
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .query({ program_id: PROGRAM_ID })
        .send({ product_code: 'QEI', device_description: 'test device' });
      // 502 means we passed auth + ownership and tried to reach shadow service
      expect(res.status).toBe(502);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4) Proxy error handling
  // ─────────────────────────────────────────────────────────────────────────

  describe('Proxy error handling', () => {
    it('POST /suggest returns 502 when shadow service is unreachable', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .query({ program_id: PROGRAM_ID })
        .send({ product_code: 'QEI', device_description: 'test device' });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unavailable');
    });

    it('POST /candidates returns 502 when shadow is unreachable', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/candidates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unavailable');
    });

    it('POST /analyze returns 502 when shadow is unreachable', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/analyze')
        .query({ program_id: PROGRAM_ID })
        .send({});
      expect(res.status).toBe(502);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5) Route existence
  // ─────────────────────────────────────────────────────────────────────────

  describe('Route structure', () => {
    it('has POST /suggest endpoint', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .query({ program_id: PROGRAM_ID })
        .send({ product_code: 'QEI', device_description: 'test' });
      expect(res.status).not.toBe(404);
    });

    it('has POST /candidates endpoint', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/candidates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /candidates endpoint', async () => {
      const res = await request(app)
        .get('/api/predicate-intelligence/candidates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /analyze endpoint', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/analyze')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /defense-preview endpoint', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/defense-preview')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /defense-preview endpoint', async () => {
      const res = await request(app)
        .get('/api/predicate-intelligence/defense-preview')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /se-matrix endpoint', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/se-matrix')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /se-matrix endpoint', async () => {
      const res = await request(app)
        .get('/api/predicate-intelligence/se-matrix')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /radar endpoint', async () => {
      const res = await request(app)
        .get('/api/predicate-intelligence/radar')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /generate-510k-preview endpoint', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/generate-510k-preview')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6) POST /suggest specific tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /suggest', () => {
    it('browser request needs NO shadow admin token (injected server-side)', async () => {
      const res = await request(app)
        .post('/api/predicate-intelligence/suggest')
        .query({ program_id: PROGRAM_ID })
        .send({ product_code: 'QEI', device_description: 'Spinal fusion device' });
      // Should NOT be 401/403 — token is injected server-side
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      // 502 = proxy tried to reach shadow → auth passed correctly
      expect(res.status).toBe(502);
    });

    it('accepts program_id in body instead of query', async () => {
      const res = await request(app).post('/api/predicate-intelligence/suggest').send({
        program_id: PROGRAM_ID,
        product_code: 'QEI',
        device_description: 'Spinal fusion device',
      });
      // Not 422 — program_id was extracted from body
      expect(res.status).not.toBe(422);
    });
  });
});
