/**
 * Gap Analysis Route - Unit Tests
 *
 * Verifies Zod validation, response format, and gap scoring logic
 * for the /api/ana/gap-analysis endpoint handler.
 *
 * @module tests/routes/ana-gap-analysis.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  expectStatus,
} from '../setup';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock DB
vi.mock('../../server/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue([{ id: 1 }]),
    })),
  },
}));

// Mock schema
vi.mock('../../shared/schema', () => ({
  gapAnalysisResults: { _: 'mock_table' },
}));

// Mock auth middleware — pass through
vi.mock('../../server/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => {
    _req.user = { id: 1, userId: 1, email: 'test@example.com', role: 'user', organizationId: '1' };
    next();
  },
}));

// Mock tenant context middleware — pass through
vi.mock('../../server/middleware/tenantContext', () => ({
  requireOrganizationContext: (_req: any, _res: any, next: any) => {
    _req.tenantContext = { organizationId: 'test-org-123' };
    _req.organizationId = 'test-org-123';
    next();
  },
}));

// Mock rate limiter — pass through
vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock config for auth
vi.mock('../../server/config/environment', () => ({
  config: { jwt: { secret: 'test-secret' } },
}));

// ── Direct handler testing via route handler extraction ──────────────────────

/**
 * Since we can't easily use supertest, we test the gap analysis logic directly
 * by importing the route module and inspecting the router stack.
 */

import express from 'express';

let router: express.Router;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../server/routes/ana-features');
  router = mod.default;
});

/**
 * Helper: call the POST /gap-analysis handler via Express app
 */
async function callGapAnalysis(body: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api/ana', router);

    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const postData = JSON.stringify(body);
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/api/ana/gap-analysis',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        });
      });

      req.write(postData);
      req.end();
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ana/gap-analysis', () => {
  // ─── Validation ──────────────────────────────────────────────────────────

  it('rejects request with missing submissionType', async () => {
    const res = await callGapAnalysis({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('rejects request with empty submissionType', async () => {
    const res = await callGapAnalysis({ submissionType: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects unsupported submission type', async () => {
    const res = await callGapAnalysis({ submissionType: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported submission type');
  });

  // ─── Successful Analysis (all 6 submission types) ────────────────────────

  it('returns valid gap analysis for IND submission', async () => {
    const res = await callGapAnalysis({ submissionType: 'IND' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.overallReadiness).toBe('number');
    expect(res.body.totalRequired).toBeGreaterThan(0);
    expect(res.body.gaps).toBeInstanceOf(Array);
    expect(res.body.recommendations).toBeInstanceOf(Array);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
  });

  it('returns valid gap analysis for NDA submission', async () => {
    const res = await callGapAnalysis({ submissionType: 'NDA' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.gaps.length).toBeGreaterThan(0);
    expect(res.body.recommendations.some((r: string) => r.includes('Pre-NDA'))).toBe(true);
  });

  it('returns valid gap analysis for BLA submission', async () => {
    const res = await callGapAnalysis({ submissionType: 'BLA' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns valid gap analysis for MAA submission', async () => {
    const res = await callGapAnalysis({ submissionType: 'MAA' });
    expect(res.status).toBe(200);
    expect(res.body.recommendations.some((r: string) => r.includes('Rapporteur'))).toBe(true);
  });

  it('returns valid gap analysis for 510K submission', async () => {
    const res = await callGapAnalysis({ submissionType: '510K' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns valid gap analysis for PMA submission', async () => {
    const res = await callGapAnalysis({ submissionType: 'PMA' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ─── Case-insensitive & normalized input ─────────────────────────────────

  it('handles case-insensitive submission types', async () => {
    const res = await callGapAnalysis({ submissionType: 'ind' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('handles hyphenated submission types (510-K)', async () => {
    const res = await callGapAnalysis({ submissionType: '510-K' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ─── Gap Scoring Logic ───────────────────────────────────────────────────

  it('marks all gaps as missing when no documents uploaded', async () => {
    const res = await callGapAnalysis({ submissionType: 'IND', uploadedDocuments: [] });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(0);
    expect(res.body.overallReadiness).toBe(0);
    expect(res.body.gaps.every((g: any) => g.status === 'missing')).toBe(true);
  });

  it('detects exact match when uploaded doc matches requirement', async () => {
    const res = await callGapAnalysis({
      submissionType: 'IND',
      uploadedDocuments: ['FDA Form 1571'],
    });
    expect(res.status).toBe(200);
    const form1571 = res.body.gaps.find((g: any) => g.requirement === 'FDA Form 1571');
    expect(form1571?.status).toBe('complete');
    expect(res.body.completed).toBeGreaterThan(0);
    expect(res.body.overallReadiness).toBeGreaterThan(0);
  });

  it('detects partial match via keyword overlap', async () => {
    const res = await callGapAnalysis({
      submissionType: 'IND',
      uploadedDocuments: ['toxicology report'],
    });
    expect(res.status).toBe(200);
    const hasPartial = res.body.gaps.some((g: any) => g.status === 'partial');
    expect(hasPartial).toBe(true);
  });

  // ─── Response Structure ──────────────────────────────────────────────────

  it('returns properly structured gap items', async () => {
    const res = await callGapAnalysis({ submissionType: 'IND' });
    expect(res.status).toBe(200);

    const gap = res.body.gaps[0];
    expect(gap).toHaveProperty('section');
    expect(gap).toHaveProperty('module');
    expect(gap).toHaveProperty('requirement');
    expect(gap).toHaveProperty('status');
    expect(gap).toHaveProperty('priority');
    expect(gap).toHaveProperty('estimatedEffortDays');
    expect(gap).toHaveProperty('description');
    expect(['complete', 'partial', 'missing']).toContain(gap.status);
    expect(['critical', 'high', 'medium', 'low']).toContain(gap.priority);
  });

  it('generates critical missing recommendations', async () => {
    const res = await callGapAnalysis({ submissionType: 'IND' });
    expect(res.status).toBe(200);
    expect(res.body.recommendations.some((r: string) => r.includes('critical documents are missing'))).toBe(true);
  });

  it('includes effort estimate in recommendations', async () => {
    const res = await callGapAnalysis({ submissionType: 'NDA' });
    expect(res.status).toBe(200);
    expect(res.body.recommendations.some((r: string) => r.includes('person-days'))).toBe(true);
  });

  it('returns success:true wrapper on all valid responses', async () => {
    for (const type of ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA']) {
      const res = await callGapAnalysis({ submissionType: type });
      expect(res.body.success).toBe(true);
    }
  });
});
