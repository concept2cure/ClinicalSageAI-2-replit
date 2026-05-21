import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

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

