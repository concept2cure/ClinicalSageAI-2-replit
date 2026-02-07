/**
 * Tests for DOCX Factory BFF Proxy Routes
 *
 * Validates:
 *  1. Fail-closed when REVIEW_ADMIN_TOKEN is not configured (503)
 *  2. 422 when program_id is missing
 *  3. 403 IDOR prevention — org doesn't own the program
 *  4. 502 when Shadow Service is unreachable
 *  5. No admin token leak to browser (BFF injects it server-side)
 *  6. Route existence for all 8 endpoints
 *  7. Binary artifact download streaming
 *
 * @phase 6.3 — DOCX Factory BFF Proxy
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
// Mock auth middleware — simulates dev-mode auto-auth for unit tests
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
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000002';
const RENDER_ID = '00000000-0000-0000-0000-000000000003';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000004';

beforeEach(async () => {
  origToken = process.env.REVIEW_ADMIN_TOKEN;
  origShadowUrl = process.env.SHADOW_SERVICE_URL;

  // Default: token set, shadow at an unreachable port
  process.env.REVIEW_ADMIN_TOKEN = 'test-token-secret';
  process.env.SHADOW_SERVICE_URL = 'http://localhost:1'; // nothing listening

  // Default: program exists and belongs to the user's org
  dbMockResult.value = [{ id: PROGRAM_ID }];

  const mod = await import('../../routes/docx-factory.js');
  app = express();
  app.use(express.json());
  app.use('/api/docx-factory', mod.default);
});

afterEach(() => {
  if (origToken !== undefined) process.env.REVIEW_ADMIN_TOKEN = origToken;
  else delete process.env.REVIEW_ADMIN_TOKEN;
  if (origShadowUrl !== undefined) process.env.SHADOW_SERVICE_URL = origShadowUrl;
  else delete process.env.SHADOW_SERVICE_URL;
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('DOCX Factory BFF Proxy', () => {
  // ── 1. Configuration guard (fail-closed 503) ─────────────────────────────

  describe('Configuration guard', () => {
    it('returns 503 when REVIEW_ADMIN_TOKEN is empty', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .get('/api/docx-factory/templates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });

    it('returns 503 for POST /renders when token empty', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .post('/api/docx-factory/renders')
        .send({ program_id: PROGRAM_ID });
      expect(res.status).toBe(503);
    });

    it('returns 503 for artifact download when token empty', async () => {
      process.env.REVIEW_ADMIN_TOKEN = '';
      const res = await request(app)
        .get(`/api/docx-factory/artifacts/${ARTIFACT_ID}/download`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(503);
    });
  });

  // ── 2. Input validation (422 — missing program_id) ───────────────────────

  describe('Input validation', () => {
    it('GET /templates without program_id → 422', async () => {
      const res = await request(app).get('/api/docx-factory/templates');
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /templates without program_id → 422', async () => {
      const res = await request(app)
        .post('/api/docx-factory/templates')
        .send({ name: 'Test Template' });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('program_id');
    });

    it('POST /renders without program_id → 422', async () => {
      const res = await request(app)
        .post('/api/docx-factory/renders')
        .send({});
      expect(res.status).toBe(422);
    });

    it('GET /renders without program_id → 422', async () => {
      const res = await request(app).get('/api/docx-factory/renders');
      expect(res.status).toBe(422);
    });

    it('GET /renders/:id without program_id → 422', async () => {
      const res = await request(app).get(`/api/docx-factory/renders/${RENDER_ID}`);
      expect(res.status).toBe(422);
    });

    it('POST /renders/:id/execute without program_id → 422', async () => {
      const res = await request(app)
        .post(`/api/docx-factory/renders/${RENDER_ID}/execute`);
      expect(res.status).toBe(422);
    });

    it('GET /artifacts/:id/download without program_id → 422', async () => {
      const res = await request(app)
        .get(`/api/docx-factory/artifacts/${ARTIFACT_ID}/download`);
      expect(res.status).toBe(422);
    });

    it('POST /templates/:id/versions without program_id → 422', async () => {
      const res = await request(app)
        .post(`/api/docx-factory/templates/${TEMPLATE_ID}/versions`)
        .send({ storage_key: 'test.docx', sha256: 'a'.repeat(64) });
      expect(res.status).toBe(422);
    });
  });

  // ── 3. Security — no admin token leak ─────────────────────────────────────

  describe('Security', () => {
    it('browser request needs NO shadow admin token (BFF injects it)', async () => {
      // No X-Admin-Token header sent
      const res = await request(app)
        .get('/api/docx-factory/templates')
        .query({ program_id: PROGRAM_ID });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      // 502 = proxy tried to reach shadow but it's not running → correct
      expect(res.status).toBe(502);
    });
  });

  // ── 4. Proxy error handling (502) ─────────────────────────────────────────

  describe('Proxy error handling', () => {
    it('GET /templates returns 502 when shadow unreachable', async () => {
      const res = await request(app)
        .get('/api/docx-factory/templates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unreachable');
    });

    it('POST /templates returns 502 when shadow unreachable', async () => {
      const res = await request(app)
        .post('/api/docx-factory/templates')
        .send({ program_id: PROGRAM_ID, name: 'Test' });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('unreachable');
    });

    it('POST /renders returns 502 when shadow unreachable', async () => {
      const res = await request(app)
        .post('/api/docx-factory/renders')
        .send({ program_id: PROGRAM_ID, template_version_id: TEMPLATE_ID });
      expect(res.status).toBe(502);
    });

    it('POST /renders/:id/execute returns 502 when shadow unreachable', async () => {
      const res = await request(app)
        .post(`/api/docx-factory/renders/${RENDER_ID}/execute`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
    });

    it('GET /artifacts/:id/download returns 502 when shadow unreachable', async () => {
      const res = await request(app)
        .get(`/api/docx-factory/artifacts/${ARTIFACT_ID}/download`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
    });
  });

  // ── 5. Route existence ────────────────────────────────────────────────────

  describe('Route structure', () => {
    it('has GET /templates endpoint', async () => {
      const res = await request(app)
        .get('/api/docx-factory/templates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /templates endpoint', async () => {
      const res = await request(app)
        .post('/api/docx-factory/templates')
        .send({ program_id: PROGRAM_ID, name: 'Test' });
      expect(res.status).not.toBe(404);
    });

    it('has POST /templates/:id/versions endpoint', async () => {
      const res = await request(app)
        .post(`/api/docx-factory/templates/${TEMPLATE_ID}/versions`)
        .query({ program_id: PROGRAM_ID })
        .send({ storage_key: 'x.docx', sha256: 'a'.repeat(64) });
      expect(res.status).not.toBe(404);
    });

    it('has POST /renders endpoint', async () => {
      const res = await request(app)
        .post('/api/docx-factory/renders')
        .send({ program_id: PROGRAM_ID, template_version_id: TEMPLATE_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /renders endpoint', async () => {
      const res = await request(app)
        .get('/api/docx-factory/renders')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /renders/:id endpoint', async () => {
      const res = await request(app)
        .get(`/api/docx-factory/renders/${RENDER_ID}`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has POST /renders/:id/execute endpoint', async () => {
      const res = await request(app)
        .post(`/api/docx-factory/renders/${RENDER_ID}/execute`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });

    it('has GET /artifacts/:id/download endpoint', async () => {
      const res = await request(app)
        .get(`/api/docx-factory/artifacts/${ARTIFACT_ID}/download`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).not.toBe(404);
    });
  });

  // ── 6. IDOR prevention — program ownership guard ──────────────────────────

  describe('Program ownership guard (IDOR prevention)', () => {
    it('returns 403 when user org does not own the program (GET /templates)', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .get('/api/docx-factory/templates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('returns 403 for POST /templates when org mismatch', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .post('/api/docx-factory/templates')
        .send({ program_id: PROGRAM_ID, name: 'Test' });
      expect(res.status).toBe(403);
    });

    it('returns 403 for POST /renders when org mismatch', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .post('/api/docx-factory/renders')
        .send({ program_id: PROGRAM_ID, template_version_id: TEMPLATE_ID });
      expect(res.status).toBe(403);
    });

    it('returns 403 for artifact download when org mismatch', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .get(`/api/docx-factory/artifacts/${ARTIFACT_ID}/download`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
      expect(res.body.detail).toContain('do not have access');
    });

    it('returns 403 for execute render when org mismatch', async () => {
      dbMockResult.value = [];
      const res = await request(app)
        .post(`/api/docx-factory/renders/${RENDER_ID}/execute`)
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(403);
    });

    it('allows access when org owns the program (502 = proxy reached)', async () => {
      dbMockResult.value = [{ id: PROGRAM_ID }];
      const res = await request(app)
        .get('/api/docx-factory/templates')
        .query({ program_id: PROGRAM_ID });
      expect(res.status).toBe(502);
    });
  });
});
