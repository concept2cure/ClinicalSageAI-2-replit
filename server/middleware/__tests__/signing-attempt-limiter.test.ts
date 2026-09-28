/**
 * A signature's password cannot be guessed without limit (21 CFR 11.300(d)).
 * The protocol signing routes and the e-signature pre-checks share this limit:
 * ten attempts per signer per five minutes, keyed by the signer, not the IP.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signingAttemptLimiter } from '../signing-attempt-limiter';

function appFor(userId: number) {
  const app = express();
  app.use((req, _res, next) => { Object.assign(req, { userId }); next(); });
  app.post('/sign', signingAttemptLimiter(`test-sign-${userId}`, { error: { code: 'TOO_MANY_ATTEMPTS' } }), (_req, res) => res.status(401).json({ error: 'wrong password' }));
  return app;
}

describe('signingAttemptLimiter', () => {
  it('allows ten attempts, then refuses the eleventh with 429', async () => {
    const app = appFor(501);
    for (let i = 0; i < 10; i++) expect((await request(app).post('/sign')).status).toBe(401);
    const eleventh = await request(app).post('/sign');
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('counts per signer: another signer is not refused', async () => {
    const shared = express();
    let who = 601;
    shared.use((req, _res, next) => { Object.assign(req, { userId: who }); next(); });
    shared.post('/sign', signingAttemptLimiter('test-shared', { error: { code: 'TOO_MANY_ATTEMPTS' } }), (_req, res) => res.status(401).end());
    for (let i = 0; i < 11; i++) await request(shared).post('/sign');
    who = 602;
    expect((await request(shared).post('/sign')).status).toBe(401);
  });

  it('one scope is one budget, even when two routers each build the limiter', async () => {
    // protocol-development.ts and protocol-reviews.ts each call
    // signingAttemptLimiter('protocol-sign', …); guesses at one route count
    // against the other.
    const build = () => signingAttemptLimiter('test-one-budget', { error: { code: 'TOO_MANY_ATTEMPTS' } });
    const app = express();
    app.use((req, _res, next) => { Object.assign(req, { userId: 701 }); next(); });
    app.post('/finalize', build(), (_req, res) => res.status(401).end());
    app.post('/disposition', build(), (_req, res) => res.status(401).end());
    for (let i = 0; i < 10; i++) expect((await request(app).post(i % 2 ? '/finalize' : '/disposition')).status).toBe(401);
    expect((await request(app).post('/finalize')).status).toBe(429);
    expect((await request(app).post('/disposition')).status).toBe(429);
  });
});
