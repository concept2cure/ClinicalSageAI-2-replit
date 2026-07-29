/**
 * CSP policy shape — pins the directives the SPA depends on:
 *   script-src:     nonce + strict-dynamic; no unsafe-inline / unsafe-eval
 *   style-src-elem: nonce required (drops unsafe-inline in prod)
 *   style-src-attr: unsafe-inline kept (React style={{...}} props)
 *   report-uri:     /api/csp-report
 *   nonce:          fresh per request
 *
 * A future helmet upgrade or directive refactor that silently re-introduces
 * unsafe-inline, drops the nonce, or unbinds the report endpoint will trip
 * one of these tests.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { cspNonce, permissionsPolicy, securityHeaders } from '../enterprise-security';

function buildApp() {
  const app = express();
  app.use(cspNonce);
  app.use(securityHeaders);
  app.use(permissionsPolicy);
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

function findDirective(csp: string, name: string): string {
  return csp.split(';').find(d => d.trim().startsWith(name + ' ') || d.trim() === name) ?? '';
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
    expect(findDirective(csp, 'script-src')).not.toMatch(/'unsafe-inline'/);
  });

  it('includes strict-dynamic in script-src', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'script-src')).toMatch(/'strict-dynamic'/);
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

describe('CSP style-src split', () => {
  it('emits style-src-elem and style-src-attr instead of style-src', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'style-src-elem')).not.toBe('');
    expect(findDirective(csp, 'style-src-attr')).not.toBe('');
  });

  it('keeps unsafe-inline only on style-src-attr (covers React style={{}} props)', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'style-src-attr')).toMatch(/'unsafe-inline'/);
  });

  it('requires a nonce in style-src-elem', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'style-src-elem')).toMatch(/'nonce-[A-Za-z0-9+/=]+=*'/);
  });
});

describe('CSP violation reporting', () => {
  it('includes report-uri pointing at /api/csp-report (legacy browsers)', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'report-uri')).toMatch(/\/api\/csp-report/);
  });

  it('includes report-to referencing the csp-endpoint group (modern API)', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'report-to')).toMatch(/csp-endpoint/);
  });

  it('emits a Reporting-Endpoints header binding csp-endpoint to /api/csp-report', async () => {
    const res = await request(buildApp()).get('/');
    const header = res.headers['reporting-endpoints'] as string | undefined;
    expect(header).toBeTruthy();
    expect(header).toMatch(/csp-endpoint=/);
    expect(header).toMatch(/\/api\/csp-report/);
  });
});

describe('CSP hardening directives', () => {
  it('locks base-uri to self', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'base-uri')).toMatch(/'self'/);
  });

  it('restricts form-action to self', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'form-action')).toMatch(/'self'/);
  });

  it('sets frame-ancestors to self (clickjacking defense)', async () => {
    const res = await request(buildApp()).get('/');
    const csp = getCspHeader(res.headers);
    expect(findDirective(csp, 'frame-ancestors')).toMatch(/'self'/);
  });
});

describe('Permissions-Policy', () => {
  it('emits a Permissions-Policy header', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.headers['permissions-policy']).toBeTruthy();
  });

  it('denies camera, microphone, geolocation by default', async () => {
    const res = await request(buildApp()).get('/');
    const policy = res.headers['permissions-policy'] as string;
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });

  it('allows clipboard-write on self (editor copy actions)', async () => {
    const res = await request(buildApp()).get('/');
    const policy = res.headers['permissions-policy'] as string;
    expect(policy).toContain('clipboard-write=(self)');
  });
});
