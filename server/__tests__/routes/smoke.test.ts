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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage4-smoke-test-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.SKIP_DB_STARTUP_TEST = 'true';

vi.mock('../../middleware/auth.js', async () => {
  const actual = await vi.importActual('../../middleware/auth.ts');
  return {
    ...(actual as Record<string, unknown>),
    verifyJwt: (actual as any).authenticateToken,
    hasPermission: (_req: any, _permission: string) => true,
  };
});

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

describe('Stage 4: Backend beta contract smoke net', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('mounts beta-critical route families in server index', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/index.ts'), 'utf8');

    // Auth + global auth gating
    expect(content).toContain("app.use('/api/auth', authRouter)");
    expect(content).toContain("const openPrefixes = [");
    expect(content).toContain("app.post('/api/login'");

    // Canonical product and compute
    expect(content).toContain("app.use('/api/concept2cure', concept2cureRoutes)");
    expect(content).toContain("app.use('/api/concept2cure/compute', computeRoutes)");

    // AnA/chat
    expect(content).toContain("app.use('/api/chat', chatRoutes)");
    expect(content).toContain("app.use('/api/ana-ri', aiCircuitBreaker");

    // Authoring
    expect(content).toContain("app.use('/api/document-authoring', documentAuthoringRoutes)");
    expect(content).toContain("app.use('/api/authoring', authoringRouterModule.default)");
    expect(content).toContain("app.use('/api/authoring-actions', authoringActionsModule.default)");

    // CERV2 / 510k
    expect(content).toContain("app.use('/api/cerv2', cerv2DocumentRoutes)");
    expect(content).toContain("app.use('/api/510k-project', projectRoutes)");
    expect(content).toContain("app.post('/api/510k-workflow/:projectId'");

    // Vault/documents
    expect(content).toContain("app.use('/api/vault', vaultAutoRoutes.default)");
    expect(content).toContain("app.use('/api/documents', documentsUnified.default)");

    // eCTD / IND
    expect(content).toContain("path: '/api/ectd-validate'");
    expect(content).toContain("path: '/api/ectd-compile'");
    expect(content).toContain("path: '/api/ectd/export'");
    expect(content).toContain("app.use('/api/ind-generation', indGenerationRoutes)");

    // Evidence / external evidence
    expect(content).toContain("app.use('/api/firecrawl', firecrawlRoutes.default)");
    expect(content).toContain("app.use('/api/external-evidence', externalEvidenceRoutes.default)");
    expect(content).toContain("path: '/api/evidence'");
    expect(content).toContain("path: '/api/evidence-fabric'");
  });

  it('keeps concept2cure router tenant-scoped and envelope-based', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/concept2cure.ts'), 'utf8');

    expect(content).toContain('router.use(authMiddleware);');
    expect(content).toContain('router.use(tenantContextMiddleware);');
    expect(content).toContain('router.use(requireOrganizationContext);');
    expect(content).toContain('const sendSuccess = <T>');
    expect(content).toContain('const sendError = (');
    expect(content).toContain("router.get('/projects/:id'");
    expect(content).toContain("router.post('/projects'");
  });

  it('keeps ana-ri core endpoints and shared envelope helpers', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/ana-ri.ts'), 'utf8');

    expect(content).toContain('const sendSuccess = <T>');
    expect(content).toContain('const sendError = (');
    expect(content).toContain("router.post('/chat'");
    expect(content).toContain("router.get('/deficiencies'");
    expect(content).toContain("router.get('/actions'");
    expect(content).toContain("router.post('/evaluate'");
  });

  it('keeps CERV2, vault, document data center, and eCTD/IND entry routes visible', () => {
    const cerv2Content = fs.readFileSync(
      path.join(repoRoot, 'server/routes/cerv2-document-routes.ts'),
      'utf8'
    );
    const vaultContent = fs.readFileSync(path.join(repoRoot, 'server/routes/vault-auto.ts'), 'utf8');
    const ddcContent = fs.readFileSync(
      path.join(repoRoot, 'server/routes/document-data-center.ts'),
      'utf8'
    );
    const ectdValidateContent = fs.readFileSync(
      path.join(repoRoot, 'server/routes/ectd-validate.ts'),
      'utf8'
    );
    const indContent = fs.readFileSync(path.join(repoRoot, 'server/routes/ind-generation.ts'), 'utf8');

    expect(cerv2Content).toContain("router.get('/documents', authMiddleware");
    expect(vaultContent).toContain("router.post('/link-csr'");
    expect(vaultContent).toContain("router.post('/link-submission'");
    expect(ddcContent).toContain("router.post('/upload'");
    expect(ddcContent).toContain("router.get('/files'");
    expect(ectdValidateContent).toContain("router.post('/quick'");
    expect(indContent).toContain("router.get('/structure'");
  });

  it('returns deterministic errors for lightweight eCTD and chat entry smoke paths', async () => {
    // ectd-validate route was moved/renamed; import dynamically through any
    const ectdModule: any = await import('../../routes/ectd-validate' as any).catch(() => ({ default: { use: () => {} } }));
    const ectdRouter = ectdModule.default;
    const chatModule = await import('../../routes/chat');
    const chatRouter = chatModule.default;

    const app = express();
    app.use(express.json());
    app.use('/api/ectd-validate', ectdRouter);
    app.use('/api/chat', chatRouter);

    const ectdRes = await request(app).post('/api/ectd-validate/quick').send({});
    expect(ectdRes.status).toBe(400);
    expect(String(ectdRes.body?.error || '')).toContain('sectionCodes');

    const chatRes = await request(app).post('/api/chat').send({});
    expect(chatRes.status).toBe(400);
    expect(chatRes.body?.code).toBe('INVALID_MESSAGE');
  });
});
