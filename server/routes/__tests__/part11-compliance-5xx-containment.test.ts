/**
 * Part 11 manifest and seal-integrity — a 500 carries the envelope, never the
 * thrower's text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * GET /signatures/:signatureId/manifest answered a non-schema query failure with
 * `error: error.message` (the 42P01/42703 503 branch above it is unchanged), and
 * GET /audit-trail/seal-integrity answered a verifier failure the same way.
 *
 * The seal check is platform-admin-only. It is still not exempted: what it
 * answers on success is the verification result, and nothing in that contract
 * needs the exception text — an operator reads it from the log by the request
 * id, which is what `serverError()` gives them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL canceling statement due to statement timeout on "electronic_signatures"';

const { verifyAuditIntegrity, logError } = vi.hoisted(() => ({
  verifyAuditIntegrity: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../services/audit/audit-integrity-service', () => ({ verifyAuditIntegrity }));
// Platform standing for the seal check is an active platform_role_grants row
// (holdsPlatformRole, server/middleware/requirePlatformAdmin.ts), never a role on
// the request, which behind server/auth.ts is the tenant membership role. Added
// 2026-10-05 (D6, docs/evidence/D6/2026-10-05-cross-tenant-staff/): user 21 holds
// a platform_admin grant; nobody else holds one.
const { PLATFORM_GRANT_HOLDER } = vi.hoisted(() => ({ PLATFORM_GRANT_HOLDER: 21 }));
vi.mock('../../db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db')>()),
  query: vi.fn(async (sql: string, params: unknown[] = []) => ({
    rows: /FROM platform_role_grants/.test(sql) && params[0] === PLATFORM_GRANT_HOLDER
      && Array.isArray(params[1]) && (params[1] as string[]).includes('platform_admin') ? [{ '?column?': 1 }] : [],
  })),
}));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import part11Router from '../part11-compliance';

function app(query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>, user: any) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-part11');
    (req as any).dbClient = { query };
    (req as any).pool = { query };
    (req as any).user = user;
    next();
  });
  a.use('/', part11Router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(res.body)).not.toMatch(/electronic_signatures|statement timeout/);
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-part11');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Part 11 500s: envelope out, detail to the log', () => {
  it('GET /signatures/:signatureId/manifest — a non-schema query failure', async () => {
    const query = vi.fn(async () => {
      throw Object.assign(new Error(SENTINEL), { code: '57014' });
    });
    expectContained(await request(app(query, { organizationId: 7 })).get('/signatures/12/manifest'));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('GET /audit-trail/seal-integrity — a verifier failure (platform admin)', async () => {
    verifyAuditIntegrity.mockRejectedValue(new Error(SENTINEL));
    const query = vi.fn(async () => ({ rows: [] }));
    expectContained(
      // The platform admin is the grant holder (was `roles: ['platform_admin']`, a request role; D6, 2026-10-05).
      await request(app(query, { id: PLATFORM_GRANT_HOLDER, organizationId: 7, role: 'member', roles: ['member'] })).get('/audit-trail/seal-integrity'),
    );
  });

  it('leaves the 503 for an unprovisioned store and the 403 for an org admin unchanged', async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error('relation "electronic_signatures" does not exist'), { code: '42P01' });
    });
    const res = await request(app(missing, { organizationId: 7 })).get('/signatures/12/manifest');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: 'SIGNATURE_STORE_UNPROVISIONED' });

    const orgAdmin = await request(app(missing, { organizationId: 7, role: 'admin' })).get('/audit-trail/seal-integrity');
    expect(orgAdmin.status).toBe(403);
    expect(orgAdmin.body.error.code).toBe('FORBIDDEN');
  });
});
