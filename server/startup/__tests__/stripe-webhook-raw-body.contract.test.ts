/**
 * The Stripe webhook must receive the raw bytes Stripe sent.
 *
 * ── Why this can only be a middleware-ordering test ───────────────────────────
 * `stripe.webhooks.constructEvent(payload, signature, secret)` recomputes an
 * HMAC over the EXACT body and compares it to the header. Re-serialising a
 * parsed object does not reproduce those bytes — key order, whitespace and
 * number formatting all move — so the verification fails whatever the secret is.
 * Stripe's own error is explicit: "Webhook payload must be provided as a string
 * or a Buffer".
 *
 * `server/routes/billing.ts` already asks for the raw body, declaring its route
 * as `raw({ type: 'application/json' })`. Reading that file alone, the code
 * looks correct. It was not, and the reason is nowhere near it: the billing
 * router is mounted by `register-inline-routes.ts`, which runs AFTER
 * `applyStartupMiddleware`, so `express.json()` had already consumed the stream
 * and set `req._body`. body-parser short-circuits on `_body`, so the route's own
 * `raw()` did nothing at all.
 *
 * That is why the assertion here is about the SHAPE OF `req.body` at the route,
 * and not about anything in billing.ts. The defect lives in the order two files
 * are mounted, which no unit test of either file can see.
 *
 * ── Why it does not go through Stripe ─────────────────────────────────────────
 * No Stripe SDK, no key, no network. Whether `constructEvent` succeeds is
 * Stripe's business; whether it is handed a Buffer is ours, and that is the
 * whole of what broke.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * The ordering under test, transcribed from server/startup/middleware.ts.
 *
 * Deliberately a transcription and not an import: `applyStartupMiddleware` also
 * installs Redis rate limiting, CSRF, security headers and a route fence, which
 * would need stubbing and would make a failure here ambiguous. The lines that
 * matter are three, and the source-text guard below is what keeps this
 * transcription honest.
 */
function appWithRealOrdering() {
  const app = express();
  app.use('/api/billing/webhooks', express.raw({ type: 'application/json' }));
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', express.urlencoded({ extended: true, limit: '2mb' }));

  // Stands in for the billing router, mounted later, declaring raw() as it does.
  const billing = express.Router();
  billing.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    res.json({
      isBuffer: Buffer.isBuffer(req.body),
      raw: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null,
    });
  });
  billing.post('/checkout', (req, res) => {
    res.json({ isBuffer: Buffer.isBuffer(req.body), tier: (req.body as { tier?: string })?.tier });
  });
  app.use('/api/billing', billing);
  return app;
}

const PAYLOAD = '{"id":"evt_test","type":"checkout.session.completed","zz":1,"aa":2}';

describe('Stripe webhook body handling', () => {
  it('the webhook route receives a Buffer, not a parsed object', async () => {
    const res = await request(appWithRealOrdering())
      .post('/api/billing/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(PAYLOAD);

    expect(res.status).toBe(200);
    expect(
      res.body.isBuffer,
      'the webhook got a parsed object — constructEvent would throw "Webhook payload must be provided as a string or a Buffer"',
    ).toBe(true);
  });

  it('the bytes arrive byte-identical, which is the actual requirement', async () => {
    // Key order is deliberately non-alphabetical: a re-serialised object would
    // very likely come back in a different order and break the HMAC. Asserting
    // "is a Buffer" alone would not catch a re-encode.
    const res = await request(appWithRealOrdering())
      .post('/api/billing/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(PAYLOAD);

    expect(res.body.raw).toBe(PAYLOAD);
  });

  it('the REST of /api/billing still gets parsed JSON', async () => {
    // The narrow scope is the point. A fix that gave the whole billing router
    // raw bodies would break every other route in it.
    const res = await request(appWithRealOrdering())
      .post('/api/billing/checkout')
      .set('content-type', 'application/json')
      .send({ tier: 'professional' });

    expect(res.body.isBuffer).toBe(false);
    expect(res.body.tier).toBe('professional');
  });

  it('WITHOUT the early raw mount the webhook gets an object — the bug, reproduced', async () => {
    /*
     * The control. Without this case the three above would pass on any app that
     * happens to be ordered correctly, and would not show that the ordering is
     * what does the work.
     */
    const broken = express();
    broken.use('/api', express.json({ limit: '2mb' }));
    const billing = express.Router();
    billing.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
      res.json({ isBuffer: Buffer.isBuffer(req.body) });
    });
    broken.use('/api/billing', billing);

    const res = await request(broken)
      .post('/api/billing/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(PAYLOAD);

    expect(
      res.body.isBuffer,
      'the route-level raw() alone was enough — then the startup mount is unnecessary and this whole file is wrong',
    ).toBe(false);
  });
});

describe('the real middleware keeps the mount', () => {
  it('server/startup/middleware.ts mounts the raw parser before express.json', async () => {
    // Keeps the transcription above honest. If someone reorders the real file,
    // the tests above would keep passing against a fiction.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'server/startup/middleware.ts'),
      'utf8',
    );
    const rawAt = src.indexOf("app.use('/api/billing/webhooks'");
    const jsonAt = src.indexOf("app.use('/api', express.json(");

    expect(rawAt, 'the raw mount for /api/billing/webhooks is gone').toBeGreaterThan(-1);
    expect(jsonAt, 'the /api JSON parser mount could not be found').toBeGreaterThan(-1);
    expect(
      rawAt < jsonAt,
      'express.json() now runs before the webhook raw parser — Stripe signature verification is broken again',
    ).toBe(true);
  });
});
