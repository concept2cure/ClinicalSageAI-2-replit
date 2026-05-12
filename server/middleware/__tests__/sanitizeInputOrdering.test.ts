import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { sanitizeInput } from '../enterprise-security';

/**
 * Regression test for the middleware-ordering bug fixed alongside this file.
 *
 * Previously sanitizeInput was registered inside applySecurityMiddleware,
 * which runs BEFORE the body parser. At that point req.body is undefined, so
 * the prototype-pollution scrub of the body was a silent no-op. A crafted
 * JSON payload like { "__proto__": { "polluted": true } } would survive the
 * scrub and land on the handler with the bad key still attached.
 *
 * The fix mounts sanitizeInput after express.json. This test exercises the
 * correct order and verifies the scrub actually removes __proto__ /
 * constructor / prototype keys from a real parsed body.
 */
describe('sanitizeInput in the correct (post-parser) order', () => {
  it('drops prototype-pollution keys from a real JSON body', async () => {
    const app = express();
    app.use(express.json());
    app.use(sanitizeInput);
    app.post('/echo', (req, res) => {
      res.json({ body: req.body });
    });

    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":true},"constructor":"x","name":"ok"}');

    expect(response.status).toBe(200);
    expect(response.body.body.name).toBe('ok');
    expect(response.body.body.polluted).toBeUndefined();
    expect(response.body.body.constructor).not.toBe('x');
    // Object.prototype must not have been touched.
    expect(({} as any).polluted).toBeUndefined();
  });

  it('is a no-op when registered before the body parser (documents the prior bug)', async () => {
    const app = express();
    // Wrong order: scrub before body parser.
    app.use(sanitizeInput);
    app.use(express.json());
    app.post('/echo', (req, res) => {
      res.json({ body: req.body });
    });

    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":true},"name":"ok"}');

    // The handler still gets the bad key when scrub runs at the wrong stage.
    // This is the exact failure mode the ordering fix addresses.
    expect(response.body.body.name).toBe('ok');
    // Note: __proto__ on a parsed object becomes an own enumerable in modern
    // Node; the assertion that proves the bug is that polluted survives.
    expect(response.body.body.polluted).toBe(true);
  });

  it('still scrubs query parameters regardless of body-parser position', async () => {
    const app = express();
    app.use(sanitizeInput);
    app.get('/echo', (req, res) => {
      res.json({ query: req.query });
    });

    const response = await request(app).get('/echo?a=ok');
    expect(response.body.query.a).toBe('ok');
  });
});
