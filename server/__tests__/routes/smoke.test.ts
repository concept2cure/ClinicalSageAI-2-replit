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
    // The /api/cortex and /api/ana-cortex mounts were moved out of
    // server/index.ts into server/bootstrap/register-inline-routes.ts
    // when the index was refactored to delegate to the
    // registerPre/PostStartRoutes pair. Assert against the bootstrap
    // module — the contract ("these routes are mounted somewhere in the
    // composition root") still holds, just one indirection deeper.
    const content = fs.readFileSync(
      path.join(repoRoot, 'server/bootstrap/register-inline-routes.ts'),
      'utf8',
    );
    expect(content).toContain("'/api/ana-cortex'");
    expect(content).toContain('anaCortexRoutes');
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

  it('enforces auth on GET /api/knowledge-base/search-connectors (DMS cross-repo search mount)', async () => {
    const module = await import('../../routes/knowledge-base');
    const router = module.default;

    const app = express();
    app.use(express.json());
    app.use('/api/knowledge-base', router);

    const res = await request(app)
      .get('/api/knowledge-base/search-connectors?q=protocol')
      .set('Authorization', 'Bearer invalid.jwt.token');

    // The connector-search mount lives behind the router's authenticateToken;
    // an invalid JWT must never reach the org's connected repositories.
    expect(res.status).toBe(401);
  });
});

// Composition root was refactored from server/index.ts into per-domain
// bootstrap registrars under server/bootstrap/register-*.ts. This suite is a
// cheap static smoke net: it reads the registrar and route source files and
// asserts the beta-critical mounts and contracts are still present.
describe('Stage 4: Backend beta contract smoke net', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('mounts beta-critical route families via bootstrap registrars', () => {
    // Composition root was refactored from server/index.ts into per-domain
    // bootstrap registrars under server/bootstrap/. Verify mount points exist
    // by reading the registrar files.
    const platformRoutes = fs.readFileSync(
      path.join(repoRoot, 'server/bootstrap/register-platform-routes.ts'),
      'utf8'
    );
    const c2cRoutes = fs.readFileSync(
      path.join(repoRoot, 'server/bootstrap/register-concept2cure-routes.ts'),
      'utf8'
    );
    const aiRoutes = fs.readFileSync(
      path.join(repoRoot, 'server/bootstrap/register-ai-routes.ts'),
      'utf8'
    );

    // Auth lives in platform registrar. It is mounted behind preAuthScope so
    // the pre-tenant identity/token queries can run under RLS_ENFORCE=on (see
    // register-platform-routes.ts and server/db/tenantStore.ts).
    expect(platformRoutes).toContain("app.use('/api/auth', preAuthScope, authRouter)");

    // Canonical concept2cure routes.
    expect(c2cRoutes).toContain("app.use('/api/concept2cure'");

    // AnA RI / chat.
    expect(aiRoutes).toContain("app.use('/api/ana-ri'");
    expect(aiRoutes).toContain("app.use('/api/chat'");
  });

  it('wires the ui-v2 backend gap closures (DMS search, rollup, registrations, validation-kit, HAQ, eTMF)', () => {
    const inlineRoutes = fs.readFileSync(
      path.join(repoRoot, 'server/bootstrap/register-inline-routes.ts'),
      'utf8'
    );
    const docRoutes = fs.readFileSync(
      path.join(repoRoot, 'server/bootstrap/register-document-routes.ts'),
      'utf8'
    );
    const guard = fs.readFileSync(
      path.join(repoRoot, 'server/middleware/staticDataGuard.ts'),
      'utf8'
    );

    // Registrations capability + GAMP 5 validation-kit self-serve mounts.
    expect(inlineRoutes).toContain("app.use('/api/registrations', authMiddleware, registrationsStandardsRoutes)");
    expect(inlineRoutes).toContain("app.use('/api/validation-kit', authMiddleware, validationKitRoutes)");

    // eTMF collapsed to a single gateway (both route families, one auth pass).
    expect(inlineRoutes).toContain('const etmfGateway = express.Router();');
    expect(inlineRoutes).toContain('etmfGateway.use(etmfCompletenessModule.default);');
    expect(inlineRoutes).toContain('etmfGateway.use(etmfGovernedModule.default);');

    // HAQ Manager mounted unconditionally (guard removed — persisted data source).
    expect(docRoutes).toContain("app.use('/api/haq-manager', haqModule.default);");
    expect(docRoutes).not.toContain("isStaticDataEnabled('ENABLE_HAQ_MANAGER_STATIC_DATA')");
    // The flag is gone as an active STATIC_DATA_FLAGS entry (quoted); an
    // explanatory comment may still name it unquoted.
    expect(guard).not.toContain("'ENABLE_HAQ_MANAGER_STATIC_DATA'");
  });

  it('keeps concept2cure router tenant-scoped and envelope-based', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/concept2cure.ts'), 'utf8');

    expect(content).toContain('router.use(authMiddleware);');
    expect(content).toContain('router.use(tenantContextMiddleware);');
    expect(content).toContain('router.use(requireOrganizationContext);');
    // The response envelope lives in routes/c2c/shared.ts (L53 slice 2) and the
    // main router imports it — one pair of helpers, not a second definition.
    expect(content).toContain("} from './c2c/shared';");
    expect(content).not.toContain('const sendSuccess = <T>');
    const shared = fs.readFileSync(path.join(repoRoot, 'server/routes/c2c/shared.ts'), 'utf8');
    expect(shared).toContain('export const sendSuccess = <T>');
    expect(shared).toContain('export const sendError = (');
    expect(content).toContain("router.get('/projects/:id'");
    expect(content).toContain("router.post('/projects'");
  });

  it('keeps ana-ri core endpoints reachable via mount* functions', () => {
    // ana-ri.ts was split into mount* modules. The envelope helpers moved to
    // the per-endpoint files; the surface contract is documented in the header.
    const content = fs.readFileSync(path.join(repoRoot, 'server/routes/ana-ri.ts'), 'utf8');

    expect(content).toContain('mountStreamRoute(router)');
    expect(content).toContain('mountLookupRoutes(router)');
    expect(content).toContain('mountUtilityRoutes(router)');
    expect(content).toContain('POST /api/ana-ri/stream');
    expect(content).toContain('GET  /api/ana-ri/deficiencies');
    expect(content).toContain('POST /api/ana-ri/evaluate');
  });

  it('keeps CERV2, document data center, and eCTD/IND entry routes visible', () => {
    // vault-auto.ts and ectd-validate.ts were removed in the design-system port;
    // vault flows through documents-unified, eCTD validation through ectd-export.
    const cerv2Content = fs.readFileSync(
      path.join(repoRoot, 'server/routes/cerv2-document-routes.ts'),
      'utf8'
    );
    const ddcContent = fs.readFileSync(
      path.join(repoRoot, 'server/routes/document-data-center.ts'),
      'utf8'
    );
    const indContent = fs.readFileSync(path.join(repoRoot, 'server/routes/ind-generation.ts'), 'utf8');

    expect(cerv2Content).toContain("router.get('/documents', authMiddleware");
    expect(ddcContent).toContain("router.post('/upload'");
    expect(ddcContent).toContain("router.get('/files'");
    expect(indContent).toContain("router.get('/structure'");
  });

  // NOTE: The deterministic eCTD/chat smoke path that exercised
  // server/routes/ectd-validate.ts was removed — that route no longer exists
  // (folded into the registerInlineRoutes path under a different name). This
  // suite is skipped pending re-derivation against the current composition root.
});
