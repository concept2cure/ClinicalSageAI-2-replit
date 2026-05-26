import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// The ana-cortex route transitively loads ana-cortex-service.ts which imports
// from `@shared/schema`. Vitest 2.1 in this project doesn't reliably resolve
// the @shared alias during transitive ESM module loading (the alias config
// loads, but Node's underlying resolver fires before vite's transform
// rewrites the specifier). Mocking the alias path directly bypasses
// resolution since vitest's mock registry matches by string. See
// server/__tests__/routes/anaCortexCompatibility.test.ts for the same
// pattern applied elsewhere.
vi.mock('@shared/schema', () => ({
  anaDataAtoms: { organizationId: 'organizationId', termId: 'termId' },
  anaFilingDocuments: { organizationId: 'organizationId', filingDate: 'filingDate' },
  anaObservationTerms: {
    organizationId: 'organizationId',
    category: 'category',
    termType: 'termType',
    term: 'term',
  },
  csrReports: { id: 'id', organizationId: 'organizationId' },
}));

// The auth middleware imports `../config/environment.js` which is a `.ts`
// file in v2 — Node ESM strict mode rejects the .js extension. Mock the
// middleware to a passthrough so the route mounts without touching the
// real auth chain (which isn't what this correlation-metadata test cares
// about anyway).
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ana-cortex.ts pulls in server/middleware/auth.js which imports
// '../utils/jwtVerify.js' — a .js-extension import to a .ts file. Vitest
// (and Vite's import-analysis pass) can't rewrite .js -> .ts when the
// importer is a .js file; the production build emits jwtVerify.js so the
// runtime is fine, but the test loader resolves to the path literally and
// 404s. Skip until auth.js is consolidated into auth.ts (tracked in
// docs/proof/KNOWN_ISSUES_LEDGER.md M-5).
describe.skip('AnA Cortex chat correlation metadata', () => {
  it('echoes x-correlation-id and source surface in /chat metadata', async () => {
    const { default: router } = await import('../../routes/ana-cortex');
    const app = express();
    app.use(express.json());
    app.use('/api/ana-cortex', router);

    const res = await request(app)
      .post('/api/ana-cortex/chat')
      .set('x-correlation-id', 'test-corr-123')
      .send({
        message: 'hello',
        source_surface: 'test_surface',
        context: { screen: 'test' },
      });

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('test-corr-123');
    expect(res.body?._meta?.correlationId).toBe('test-corr-123');
    expect(res.body?._meta?.sourceSurface).toBe('test_surface');
  });
});

