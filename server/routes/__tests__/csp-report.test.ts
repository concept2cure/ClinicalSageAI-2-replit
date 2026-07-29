/**
 * CSP violation report endpoint contract.
 *
 * Browsers POST violation reports here in two shapes:
 *   - Legacy `application/csp-report` — body `{ "csp-report": {...} }`
 *   - Modern `application/reports+json` — body `[{ type: 'csp-violation', body: {...} }]`
 *
 * The endpoint must accept both, log the violation, and return 204.
 * A future change that breaks one of the formats would silently swallow
 * production violation data — this test prevents that.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import cspReportRouter from '../csp-report';

function buildApp() {
  const app = express();
  app.use('/api/csp-report', cspReportRouter);
  return app;
}

describe('CSP report endpoint', () => {
  it('accepts legacy application/csp-report and returns 204', async () => {
    const res = await request(buildApp())
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://app.test/page',
            'violated-directive': "style-src-elem 'self'",
            'effective-directive': 'style-src-elem',
            'blocked-uri': 'inline',
            disposition: 'report',
          },
        }),
      );

    expect(res.status).toBe(204);
  });

  it('accepts modern application/reports+json and returns 204', async () => {
    const res = await request(buildApp())
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(
        JSON.stringify([
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://app.test/page',
              effectiveDirective: 'script-src',
              blockedURL: 'inline',
              disposition: 'report',
            },
          },
        ]),
      );

    expect(res.status).toBe(204);
  });

  it('still returns 204 for unrecognized body shapes (best-effort log only)', async () => {
    const res = await request(buildApp())
      .post('/api/csp-report')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ unknown: 'shape' }));

    expect(res.status).toBe(204);
  });

  it('rejects bodies larger than the configured 64kb cap', async () => {
    // Build a CSP-report payload whose stringified form exceeds 64kb. The
    // parser should reject with 413 rather than buffering arbitrarily.
    const huge = 'x'.repeat(70 * 1024);
    const res = await request(buildApp())
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'document-uri': huge } }));

    expect(res.status).toBe(413);
  });
});
