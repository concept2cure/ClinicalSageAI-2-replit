/**
 * The Stripe webhook must survive CSRF, and nothing else may sneak past it.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The mounted CSRF middleware is an ORIGIN check, not a token check. A Stripe
 * webhook arrives server-to-server with no Origin, no Referer and no Bearer
 * token, so in production it fell through to
 * `403 { code: 'CSRF_VALIDATION_FAILED' }` before the handler ran. The signature
 * was never verified and the event was lost — and, as with the raw-body defect
 * it compounds, silently: a rejected webhook and a webhook that was never sent
 * look identical from inside the system.
 *
 * That made the raw-body fix in server/startup/middleware.ts necessary but NOT
 * sufficient. Both had to be true for a webhook to work, and each looked
 * complete on its own.
 *
 * ── The exemption is not a weakening ──────────────────────────────────────────
 * Stripe signs an HMAC over the exact payload under a shared secret. That is a
 * strictly stronger claim than "the Origin header looks familiar", so removing
 * the weaker check from a path that enforces the stronger one costs nothing. The
 * cases below pin that the exemption stays narrow, because an exempt list is the
 * kind of thing that grows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/*
 * NODE_ENV is set before the module loads, and the module is re-imported per
 * test, because `config` in enterprise-security.ts is a module-local const
 * computed from `process.env` at import time — not an injected dependency. A
 * `vi.mock('../../config')` does nothing here.
 *
 * That distinction is not pedantic. With NODE_ENV left at 'test' the middleware
 * takes its "skip for non-production" branch and calls next() for everything, so
 * the webhook case passes without the exemption existing at all — a green test
 * asserting nothing. The two control cases below are what caught it.
 */
let csrfProtection: express.RequestHandler;
const priorEnv = process.env.NODE_ENV;

beforeEach(async () => {
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://app.example.com';
  vi.resetModules();
  const mod = await import('../enterprise-security');
  csrfProtection = mod.csrfProtection as express.RequestHandler;
});
afterEach(() => {
  process.env.NODE_ENV = priorEnv;
  delete process.env.ALLOWED_ORIGINS;
  vi.restoreAllMocks();
});

function appWith() {
  const app = express();
  app.use(express.json());
  app.use(csrfProtection);
  app.post('/api/billing/webhooks/stripe', (_req, res) => res.json({ reached: true }));
  app.post('/api/billing/checkout', (_req, res) => res.json({ reached: true }));
  app.post('/api/billing/webhooksevil', (_req, res) => res.json({ reached: true }));
  return app;
}

describe('CSRF exemption for signature-verified webhooks', () => {
  it('a Stripe-shaped request reaches the handler', async () => {
    // No Origin, no Referer, no Bearer — exactly what Stripe sends.
    const res = await request(appWith())
      .post('/api/billing/webhooks/stripe')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .send({ id: 'evt_test' });

    expect(res.status, 'the webhook was 403d before its signature could be checked').toBe(200);
    expect(res.body.reached).toBe(true);
  });

  it('the rest of /api/billing is still protected', async () => {
    // The control. If this passes too, the exemption is too broad and the fix
    // has opened a hole rather than closed one.
    const res = await request(appWith()).post('/api/billing/checkout').send({ tier: 'standard' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('a path that merely STARTS WITH the exempt prefix is not exempt', async () => {
    // `startsWith` without a boundary would let this through, and an exempt list
    // extendable by appending characters is not a list. The dead csrf.ts warns
    // about exactly this; the warning is worth keeping alive.
    const res = await request(appWith()).post('/api/billing/webhooksevil').send({});

    expect(res.status, '/api/billing/webhooksevil bypassed CSRF').toBe(403);
  });

  it('GET is unaffected — the exemption did not change method handling', async () => {
    const app = appWith();
    app.get('/api/billing/checkout', (_req, res) => res.json({ reached: true }));
    const res = await request(app).get('/api/billing/checkout');
    expect(res.status).toBe(200);
  });
});
