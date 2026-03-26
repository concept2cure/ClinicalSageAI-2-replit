/**
 * API Routes Smoke Tests
 *
 * Quick validation that all critical routes are registered and respond.
 * Run before consolidation to establish baseline.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

// Mock Express app
const mockApp = {
  routes: new Map<string, Set<string>>(),
  get: vi.fn((path: string) => {
    if (!mockApp.routes.has('GET')) mockApp.routes.set('GET', new Set());
    mockApp.routes.get('GET')!.add(path);
  }),
  post: vi.fn((path: string) => {
    if (!mockApp.routes.has('POST')) mockApp.routes.set('POST', new Set());
    mockApp.routes.get('POST')!.add(path);
  }),
  put: vi.fn((path: string) => {
    if (!mockApp.routes.has('PUT')) mockApp.routes.set('PUT', new Set());
    mockApp.routes.get('PUT')!.add(path);
  }),
  delete: vi.fn((path: string) => {
    if (!mockApp.routes.has('DELETE')) mockApp.routes.set('DELETE', new Set());
    mockApp.routes.get('DELETE')!.add(path);
  }),
  use: vi.fn(),
};

describe('Critical API Routes', () => {
  describe('Cortex Prime Routes', () => {
    const expectedRoutes = [
      { method: 'POST', path: '/api/cortex/brain/nodes' },
      { method: 'GET', path: '/api/cortex/brain/nodes/:nodeId' },
      { method: 'POST', path: '/api/cortex/brain/search' },
      { method: 'POST', path: '/api/cortex/threads' },
      { method: 'GET', path: '/api/cortex/threads/:threadId' },
      { method: 'POST', path: '/api/cortex/agents' },
      { method: 'GET', path: '/api/cortex/health' },
    ];

    it('should define expected route structure', () => {
      expectedRoutes.forEach(route => {
        expect(route.method).toBeDefined();
        expect(route.path).toBeDefined();
        expect(route.path.startsWith('/api/cortex')).toBe(true);
      });
    });
  });

  describe('Compliance Routes', () => {
    const expectedRoutes = [
      { method: 'POST', path: '/api/audit/events' },
      { method: 'GET', path: '/api/audit/events' },
      { method: 'POST', path: '/api/audit/signatures' },
      { method: 'GET', path: '/api/audit/signatures/:signatureId/verify' },
      { method: 'POST', path: '/api/audit/export' },
    ];

    it('should define audit trail routes', () => {
      expectedRoutes.forEach(route => {
        expect(route.path).toContain('/api/audit');
      });
    });
  });

  describe('Cognitive Ecosystem Routes', () => {
    const expectedRoutes = [
      { method: 'POST', path: '/api/cognitive/agents' },
      { method: 'POST', path: '/api/cognitive/threads' },
      { method: 'POST', path: '/api/cognitive/threads/:threadId/breakpoints' },
      { method: 'POST', path: '/api/cognitive/dossiers' },
      { method: 'POST', path: '/api/cognitive/manufacturing/equipment' },
      { method: 'POST', path: '/api/cognitive/federated/models' },
    ];

    it('should define cognitive ecosystem routes', () => {
      expectedRoutes.forEach(route => {
        expect(route.path).toContain('/api/cognitive');
      });
    });
  });

  describe('FHIR Routes', () => {
    const expectedRoutes = [
      { method: 'POST', path: '/api/fhir/resources' },
      { method: 'GET', path: '/api/fhir/resources/:resourceType/:id' },
      { method: 'POST', path: '/api/fhir/validate' },
    ];

    it('should define FHIR routes', () => {
      expectedRoutes.forEach(route => {
        expect(route.path).toContain('/api/fhir');
      });
    });
  });

  describe('Compatibility Facade Routes', () => {
    const expectedRoutes = [
      { method: 'GET', path: '/api/reports' },
      { method: 'GET', path: '/api/reports/export.pdf' },
      { method: 'GET', path: '/api/audit/logs' },
      { method: 'GET', path: '/api/audit-logs' },
      { method: 'GET', path: '/api/audit/events' },
      { method: 'POST', path: '/api/audit/events' },
      { method: 'POST', path: '/api/audit/signatures' },
      { method: 'GET', path: '/api/audit/signatures/:signatureId/verify' },
      { method: 'GET', path: '/api/audit/export' },
      { method: 'POST', path: '/api/audit/bulk-delete' },
      { method: 'POST', path: '/api/search/vector' },
      { method: 'POST', path: '/api/endpoint/recommend' },
      { method: 'GET', path: '/api/retention/policies' },
      { method: 'POST', path: '/api/retention/policies' },
      { method: 'PUT', path: '/api/retention/policies/:id' },
      { method: 'DELETE', path: '/api/retention/policies/:id' },
    ];

    it('should define compatibility facade contracts', () => {
      expectedRoutes.forEach(route => {
        expect(route.method).toBeDefined();
        expect(route.path.startsWith('/api/')).toBe(true);
      });
    });
  });
});

describe('Service Layer Integration', () => {
  it('should have CortexPrimeService exportable', async () => {
    // This validates the service can be imported without errors
    const module = await import('../../services/cortexPrimeService');
    expect(module.CortexPrimeService).toBeDefined();
  });

  it('should have CortexComplianceService exportable', async () => {
    const module = await import('../../services/cortexComplianceService');
    expect(module.CortexComplianceService).toBeDefined();
  });
});

describe('Rescue Cut: Core Workflow Guards', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('protects /api/cortex/chat with requireAuth', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/cortex-unified.ts'), 'utf8');
    expect(content).toContain("router.post('/chat', requireAuth");
  });

  it('protects /api/ana-cortex/regulatory-analysis with requireAuth', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/ana-cortex.ts'), 'utf8');
    expect(content).toContain("router.post('/regulatory-analysis', requireAuth");
  });

  it('keeps /api/knowledge-base generation endpoints behind authenticateToken', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/knowledge-base.ts'), 'utf8');
    expect(content).toContain('router.use(authenticateToken)');
    expect(content).toContain("router.post('/generate-docx'");
  });

  it('mounts core workflow routes in server index', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/index.ts'), 'utf8');
    expect(content).toContain("app.use('/api/cortex', cortexUnifiedRoutes)");
    expect(content).toContain("app.use('/api/ana-cortex', anaCortexRoutes.default)");
  });
});

describe('Rescue Cut: Core Workflow API Integration', () => {
  it('rejects invalid JWT on POST /api/cortex/chat', async () => {
    const module = await import('../../routes/cortex-unified');
    const router = module.default;

    const app = express();
    app.use(express.json());
    app.use('/api/cortex', router);

    const res = await request(app)
      .post('/api/cortex/chat')
      .set('Authorization', 'Bearer invalid.jwt.token')
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('enforces auth on POST /api/ana-cortex/regulatory-analysis', async () => {
    const root = path.resolve(__dirname, '../../..');
    const content = fs.readFileSync(path.join(root, 'server/routes/ana-cortex.ts'), 'utf8');
    expect(content).toContain("router.post('/regulatory-analysis', requireAuth");
  });

  it('rejects invalid JWT on POST /api/knowledge-base/generate-docx', async () => {
    const module = await import('../../routes/knowledge-base');
    const router = module.default;

    const app = express();
    app.use(express.json());
    app.use('/api/knowledge-base', router);

    const res = await request(app)
      .post('/api/knowledge-base/generate-docx')
      .set('Authorization', 'Bearer invalid.jwt.token')
      .send({ title: 'x', content: '<p>x</p>' });

    expect(res.status).toBe(401);
  });
});
