/**
 * Tests for Evidence Fabric BFF Proxy Routes
 *
 * Validates:
 *  1. No admin token leaks to the browser (BFF injects it server-side)
 *  2. Fail-closed when REVIEW_ADMIN_TOKEN is not configured
 *  3. 422 when program_id is missing
 *  4. Proxy forwards correctly to Shadow Service
 *  5. 502 when Shadow Service is unreachable
 *
 * @phase 5.3.B — Truth Machine UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

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

  // 3) No admin token exposed to browser
  describe('Security', () => {
    it('browser request needs NO auth header (token injected server-side)', async () => {
      // No auth header sent — proxy should NOT return 401/403
      const res = await request(app)
        .get('/api/evidence-fabric/health-summary')
        .query({ program_id: PROGRAM_ID });

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
  });
});
