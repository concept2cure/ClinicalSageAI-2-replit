/**
 * sanitizeInput must run AFTER the body parser.
 *
 * Ported from PR #495 and adapted. sanitizeInput used to be mounted inside
 * applySecurityMiddleware, before express.json, where req.body is still
 * undefined, so the body-side prototype-pollution scrub was a silent no-op.
 * server/startup/middleware.ts now mounts it after mountPreAuthBodyParsers
 * (step 6b) and, for /api/concept2cure, inside mountConcept2cureBodyParser
 * after that route's parser.
 *
 * The PR's "wrong order" case asserted `body.polluted === true`, which can
 * never hold: JSON.parse makes `__proto__` an OWN key (it does not set the
 * prototype), so the failure is visible as a surviving own `__proto__` key,
 * not as a hoisted `polluted` property. The assertions below observe the own
 * keys the handler actually receives.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { sanitizeInput } from '../enterprise-security';

const hostile = '{"__proto__":{"polluted":true},"constructor":"x","prototype":1,"name":"ok"}';

function echoOwnKeys(app: express.Express, path = '/echo') {
  app.post(path, (req, res) => {
    res.json({ keys: Object.keys(req.body ?? {}), name: req.body?.name });
  });
  return app;
}

describe('sanitizeInput in the correct (post-parser) order', () => {
  it('drops prototype-pollution keys from a real JSON body', async () => {
    const app = express();
    app.use(express.json());
    app.use(sanitizeInput);
    echoOwnKeys(app);

    const response = await request(app).post('/echo').set('Content-Type', 'application/json').send(hostile);

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('ok');
    expect(response.body.keys).toEqual(['name']);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('is a no-op when registered before the body parser (the bug this ordering prevents)', async () => {
    const app = express();
    app.use(sanitizeInput); // wrong order: nothing to scrub yet
    app.use(express.json());
    echoOwnKeys(app);

    const response = await request(app).post('/echo').set('Content-Type', 'application/json').send(hostile);

    expect(response.body.name).toBe('ok');
    // Every hostile key survives to the handler.
    expect(response.body.keys).toEqual(expect.arrayContaining(['__proto__', 'constructor', 'prototype']));
  });

  it('scrubs query parameters regardless of body-parser position (Express 5 getter-backed req.query)', async () => {
    const app = express();
    app.use(sanitizeInput);
    app.get('/echo', (req, res) => res.json({ query: req.query, keys: Object.keys(req.query) }));

    const response = await request(app).get('/echo?a=ok&constructor=x');
    expect(response.status).toBe(200);
    expect(response.body.query.a).toBe('ok');
    expect(response.body.keys).toEqual(['a']);
  });
});

describe('the production mount (server/startup/middleware.ts)', () => {
  it('mountConcept2cureBodyParser scrubs the parsed Concept2Cure body', async () => {
    const { mountConcept2cureBodyParser } = await import('../../startup/middleware');
    const app = express();
    mountConcept2cureBodyParser(app);
    echoOwnKeys(app, '/api/concept2cure/echo');

    const response = await request(app)
      .post('/api/concept2cure/echo')
      .set('Content-Type', 'application/json')
      .send(hostile);

    expect(response.status).toBe(200);
    expect(response.body.keys).toEqual(['name']);
  });

  it('mountPreAuthBodyParsers followed by the step-6b sanitizeInput mount scrubs /api bodies', async () => {
    const { mountPreAuthBodyParsers } = await import('../../startup/middleware');
    const app = express();
    mountPreAuthBodyParsers(app);
    app.use('/api', sanitizeInput);
    echoOwnKeys(app, '/api/echo');

    const response = await request(app).post('/api/echo').set('Content-Type', 'application/json').send(hostile);

    expect(response.status).toBe(200);
    expect(response.body.keys).toEqual(['name']);
  });
});
