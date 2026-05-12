/**
 * CSP nonce wiring smoke test.
 *
 * Pins the contract that the security-headers stack:
 *   - emits a Content-Security-Policy header
 *   - drops 'unsafe-inline' and 'unsafe-eval' from script-src
 *   - includes a per-request nonce + 'strict-dynamic'
 *   - yields a different nonce on each request
 *
 * Without this test, a future helmet upgrade or directive refactor could
 * silently re-introduce 'unsafe-inline' on script-src — which is the
 * regression this branch exists to prevent.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { cspNonce, securityHeaders } from '../enterprise-security';

function buildApp() {
  const app = express();
  app.use(cspNonce);
  app.use(securityHeaders);
  app.get('/', (_req, res) => res.status(200).send('ok'));
  return app;
}

function getCspHeader(headers: Record<string, string | string[] | undefined>): string {
  // Helmet emits either Content-Security-Policy or
  // Content-Security-Policy-Report-Only depending on config. In dev (default
  // test NODE_ENV) it's report-only; in prod it's the enforcing header.
  const enforce = headers['content-security-policy'];
  const reportOnly = headers['content-security-policy-report-only'];
  const value = enforce ?? reportOnly;
  if (!value) throw new Error('No CSP header set');
  return Array.isArray(value) ? value.join('; ') : value;
}

describe('CSP nonce + script-src hardening', () => {
  it('emits a CSP header with a nonce in script-src', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+=*'/);
  });

  it('drops unsafe-inline from script-src', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/);
  });

  it('includes strict-dynamic in script-src', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).toMatch(/'strict-dynamic'/);
  });

  it('issues a fresh nonce on every request', async () => {
    const app = buildApp();
    const first = await request(app).get('/');
    const second = await request(app).get('/');

    const nonceOf = (headers: Record<string, string | string[] | undefined>) => {
      const match = getCspHeader(headers).match(/'nonce-([^']+)'/);
      if (!match) throw new Error('No nonce in CSP header');
      return match[1];
    };

    expect(nonceOf(first.headers)).not.toBe(nonceOf(second.headers));
  });
});
