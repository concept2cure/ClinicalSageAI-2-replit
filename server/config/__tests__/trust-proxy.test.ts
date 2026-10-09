/**
 * Which proxies may report the client's address (Express `trust proxy`).
 *
 * Production runs behind an AWS application load balancer. Express reads
 * req.ip from the socket unless told how many proxies to trust, and the
 * server never told it, so every request appeared to come from the load
 * balancer. The per-address sign-in limit (10 per 15 minutes) was then one
 * bucket for every user of the deployment, and every audit row recorded the
 * load balancer's address (VSR-001 §13.3, finding #36;
 * docs/evidence/W3/2026-09-23/observations/login-limit-forwarded-for.txt).
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from '../trust-proxy';

/** An app configured the way server/index.ts configures production, with the sign-in limit's shape. */
function behindTheLoadBalancer(hops: number) {
  const app = express();
  app.set('trust proxy', hops);
  app.post(
    '/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false } }),
    (req, res) => res.status(401).json({ ip: req.ip }),
  );
  return app;
}

/** A sign-in attempt as the load balancer forwards it: it appends the address it received the connection from. */
function attempt(app: express.Express, client: string, claimed?: string) {
  return request(app)
    .post('/login')
    .set('X-Forwarded-For', claimed ? `${claimed}, ${client}` : client);
}

describe('the hop count', () => {
  it('trusts the load balancer, and only it, in production', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toEqual({ hops: 1, source: 'production default' });
  });

  it('trusts no proxy outside production, where nothing sits in front of the server', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'development' }).hops).toBe(0);
    expect(resolveTrustProxy({}).hops).toBe(0);
  });

  it('takes an explicit hop count from the deployment', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' })).toEqual({ hops: 2, source: 'configured' });
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' }).hops).toBe(0);
  });

  it.each(['true', 'yes', '-1', '1.5', '6', 'loopback'])('refuses to boot on "%s", which is not a hop count', (value) => {
    expect(() => resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY_HOPS: value })).toThrow(/TRUST_PROXY_HOPS/);
  });
});

describe('behind the load balancer', () => {
  it('gives every client its own sign-in allowance', async () => {
    const app = behindTheLoadBalancer(resolveTrustProxy({ NODE_ENV: 'production' }).hops);
    const statuses: number[] = [];
    for (let i = 1; i <= 12; i += 1) statuses.push((await attempt(app, `203.0.113.${i}`)).status);
    expect(statuses).not.toContain(429);
  });

  it('records the address the load balancer saw, never one the client wrote', async () => {
    const app = behindTheLoadBalancer(resolveTrustProxy({ NODE_ENV: 'production' }).hops);
    const r = await attempt(app, '203.0.113.9', '198.51.100.66');
    expect(r.body.ip).toBe('203.0.113.9');
  });

  it('cannot be escaped by claiming a new address on every attempt', async () => {
    const app = behindTheLoadBalancer(resolveTrustProxy({ NODE_ENV: 'production' }).hops);
    const statuses: number[] = [];
    for (let i = 1; i <= 12; i += 1) statuses.push((await attempt(app, '203.0.113.50', `198.51.100.${i}`)).status);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('was one allowance for everyone when no proxy was trusted (the defect)', async () => {
    const app = behindTheLoadBalancer(0);
    const statuses: number[] = [];
    for (let i = 1; i <= 12; i += 1) statuses.push((await attempt(app, `203.0.113.${i}`)).status);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe('the production server', () => {
  it('applies the hop count before any middleware reads the client address', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../index.ts'), 'utf8');
    const created = src.indexOf('const app = express();');
    const applied = src.search(/app\.set\('trust proxy',\s*resolveTrustProxy\(\)\.hops\)/);
    const firstMiddleware = src.indexOf('applyTelemetryMiddleware(app)');
    expect(created).toBeGreaterThan(-1);
    expect(applied).toBeGreaterThan(created);
    expect(applied).toBeLessThan(firstMiddleware);
  });
});
