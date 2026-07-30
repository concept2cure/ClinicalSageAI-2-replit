import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyDebugRequestLogging,
  applyImmutabilityPolicy,
  getDebugBodyMetadata,
  getDebugHeaderMetadata,
  getDebugQueryMetadata,
  isConcept2cureApiRoute,
  isDestructiveAuditMutation,
  isImmutableAuditRoute,
} from '../middleware';

/**
 * Regression guards for the audit-chain self-verification wiring.
 *
 * These are static-text assertions on bootstrap source rather than
 * runtime tests, because a true runtime test would require booting the
 * server with a live Postgres pool. The grep-style guards exist to
 * catch the class of bug where someone accidentally rips out the
 * monitor wiring during a refactor — a silent regression that wouldn't
 * be detected until production audit-chain integrity stopped being
 * checked.
 *
 * If you intentionally move the wiring, update these assertions to
 * point at the new home rather than disabling them.
 */

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('audit-chain self-verification wiring', () => {
  const services = read('server/startup/services.ts');
  const shutdown = read('server/startup/shutdown.ts');
  const auditTrail = read('server/startup/audit-trail.ts');

  it('starts the chain monitor in initializeParallelServices', () => {
    expect(services).toContain('chainIntegrityMonitor');
    expect(services).toMatch(/startChainMonitor\s*\(/);
  });

  it('gates the chain monitor by the same AUDIT_TRAIL_ENABLED flag as the audit middleware', () => {
    // Both the monitor and the request-tap middleware must be on or both
    // off. Running one without the other is meaningless: a monitor with
    // no events to verify, or events that never get verified.
    expect(services).toContain("process.env.AUDIT_TRAIL_ENABLED === 'true'");
    expect(auditTrail).toContain("process.env.AUDIT_TRAIL_ENABLED === 'true'");
  });

  it('stops the chain monitor before closing the DB pool on shutdown', () => {
    expect(shutdown).toContain('stopChainMonitor');
    // Order: stopChainMonitor must appear before pool.end() in the file.
    const stopIdx = shutdown.indexOf('stopChainMonitor');
    const poolEndIdx = shutdown.indexOf('ctx.pool) await ctx.pool.end()');
    expect(stopIdx).toBeGreaterThan(0);
    expect(poolEndIdx).toBeGreaterThan(0);
    expect(stopIdx).toBeLessThan(poolEndIdx);
  });

  it('uses a 5-minute monitor interval (matches §11.10(e) continuous-monitoring guidance)', () => {
    // Either literal milliseconds or the 5*60*1000 form is acceptable.
    expect(services).toMatch(/(5\s*\*\s*60\s*\*\s*1000|300000|300_000)/);
  });
});

describe('startup middleware composition order', () => {
  const index = read('server/index.ts');
  const middleware = read('server/startup/middleware.ts');

  it('mounts telemetry, health, core, debug, and audit middleware in order', () => {
    const markers = [
      'applyTelemetryMiddleware(app)',
      'mountFastPathHealthEndpoints(app, pool)',
      'applyCoreMiddleware(app, debugLog)',
      'applyDebugRequestLogging(app, debugLog)',
      'applyAuditTrailMiddleware(app, pool, debugLog)',
    ];
    const positions = markers.map(marker => index.indexOf(marker));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('never reads request body values in debug logging', () => {
    const debugStart = middleware.indexOf('export function applyDebugRequestLogging');
    const debugEnd = middleware.indexOf('const IMMUTABLE_ROUTE_PATTERNS');
    const debugSection = middleware.slice(debugStart, debugEnd);
    expect(debugSection).toContain('body: undefined');
    expect(debugSection).not.toContain('req.body');
    expect(debugSection).toContain('getDebugHeaderMetadata(req)');
    expect(debugSection).toContain('getDebugQueryMetadata(req)');
  });
});

// Runtime contracts for the startup middleware governed by this audit suite.
describe('startup middleware guard helpers', () => {
  it('detects Concept2Cure API routes from originalUrl/path/url', () => {
    expect(isConcept2cureApiRoute({ originalUrl: '/api/concept2cure/projects', path: '', url: '' })).toBe(true);
    expect(isConcept2cureApiRoute({ originalUrl: '', path: '/api/concept2cure/artifacts', url: '' })).toBe(true);
    expect(isConcept2cureApiRoute({ originalUrl: '', path: '', url: '/api/concept2cure/upload' })).toBe(true);
    expect(isConcept2cureApiRoute({ originalUrl: '/api/health', path: '', url: '' })).toBe(false);
    expect(isConcept2cureApiRoute({ originalUrl: '/api/concept2curex', path: '', url: '' })).toBe(
      false
    );
  });

  it('records body metadata only for methods that can carry payloads', () => {
    expect(getDebugBodyMetadata({ method: 'GET', headers: {} })).toBeUndefined();
    expect(
      getDebugBodyMetadata({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '42' },
      })
    ).toEqual({
      contentType: 'application/json',
      contentLength: '42',
      transferEncoding: undefined,
    });
  });

  it('blocks only destructive audit mutations and precise bulk-delete paths', () => {
    expect(isDestructiveAuditMutation({ method: 'DELETE', path: '/api/audit/events/1' })).toBe(true);
    expect(isDestructiveAuditMutation({ method: 'PUT', path: '/api/audit/events/1' })).toBe(true);
    expect(isDestructiveAuditMutation({ method: 'PATCH', path: '/api/audit/events/1' })).toBe(true);
    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/bulk-delete' })).toBe(true);
    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/v2/bulk-delete/run' })).toBe(true);

    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/not-bulk-delete-ish' })).toBe(false);
    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/events' })).toBe(false);
  });

  it('matches immutable audit routes on path boundaries only', () => {
    expect(isImmutableAuditRoute('/api/audit/events')).toBe(true);
    expect(isImmutableAuditRoute('/api/audit/events/123')).toBe(true);
    expect(isImmutableAuditRoute('/api/audit/bulk-delete/run')).toBe(true);
    expect(isImmutableAuditRoute('/api/audit/events-archive')).toBe(false);
    expect(isImmutableAuditRoute('/api/audit/bulk-delete-preview')).toBe(false);
  });

  it('allowlists header metadata and excludes credentials', () => {
    expect(
      getDebugHeaderMetadata({
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'content-type': 'application/json',
          'x-request-id': 'request-1',
        },
      })
    ).toEqual({ 'content-type': 'application/json', 'x-request-id': 'request-1' });
  });

  it('logs query shape without query values', () => {
    expect(getDebugQueryMetadata({ query: { token: 'secret', search: 'patient name' } })).toEqual({
      parameterCount: 2,
      keys: ['search', 'token'],
    });
  });
});


describe('applyDebugRequestLogging integration', () => {
  it('omits request body values for /api/concept2cure routes', async () => {
    const app = express();
    const debugLog = vi.fn();

    app.use(express.json());
    applyDebugRequestLogging(app, debugLog);
    app.post('/api/concept2cure/artifacts', (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .post('/api/concept2cure/artifacts')
      .send({ large: 'payload' })
      .expect(200);

    const [, payload] = debugLog.mock.calls[debugLog.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(payload.body).toBeUndefined();
    expect(payload.bodyRedacted).toBe(true);
    expect(payload.concept2curePayload).toBe(true);
    expect(payload.bodyMetadata).toMatchObject({ contentType: 'application/json' });
  });

  it('never logs non-concept2cure POST bodies and skips GET body metadata', async () => {
    const app = express();
    const debugLog = vi.fn();

    app.use(express.json());
    applyDebugRequestLogging(app, debugLog);
    app.post('/api/health-proxy', (req, res) => res.status(200).json({ echo: req.body }));
    app.get('/api/health-proxy', (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .post('/api/health-proxy')
      .set('Authorization', 'Bearer beta-secret')
      .send({ keep: 'body', password: 'demo123' })
      .expect(200);

    const [, postPayload] = debugLog.mock.calls[debugLog.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(postPayload.body).toBeUndefined();
    expect(postPayload.bodyRedacted).toBe(true);
    expect(postPayload.bodyMetadata).toMatchObject({ contentType: 'application/json' });
    expect(postPayload.headers).not.toHaveProperty('authorization');

    await request(app).get('/api/health-proxy').expect(200);
    const [, getPayload] = debugLog.mock.calls[debugLog.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(getPayload.body).toBeUndefined();
    expect(getPayload.bodyMetadata).toBeUndefined();
  });
});


function createImmutabilityTestApp() {
  const app = express();
  applyImmutabilityPolicy(app);
  app.use((_req, res) => res.status(204).end());
  return app;
}

describe('applyImmutabilityPolicy integration', () => {
  it.each(['put', 'patch', 'delete'] as const)(
    'blocks %s mutations to append-only audit events',
    async method => {
      const response = await request(createImmutabilityTestApp())[method]('/api/audit/events/123');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'IMMUTABILITY_VIOLATION',
        path: '/api/audit/events/123',
        method: method.toUpperCase(),
      });
    }
  );

  it('allows appending a new audit event', async () => {
    await request(createImmutabilityTestApp()).post('/api/audit/events').expect(204);
  });

  it('does not block similarly named non-audit routes', async () => {
    await request(createImmutabilityTestApp()).delete('/api/audit/events-archive/123').expect(204);
  });

  it('blocks explicit bulk deletion', async () => {
    const response = await request(createImmutabilityTestApp()).post('/api/audit/bulk-delete');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('IMMUTABILITY_VIOLATION');
  });
});
