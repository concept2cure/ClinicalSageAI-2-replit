// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let authMiddleware: any;
let authTs: any;
let dbTs: any;
let dbJs: any;
let getRequestActor: any;

beforeAll(async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  // JWT_SECRET must be at least JWT_SECRET_MIN_LENGTH (32) chars or
  // server/config/environment.ts:104 throws at module load.
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';

  // Ensure modules are evaluated with test env vars above.
  vi.resetModules();

  ({ authMiddleware } = await import('../../auth.ts'));
  authTs = await import('../../middleware/auth.ts');
  dbTs = await import('../../db.ts');
  dbJs = await import('../../db.js');
  ({ getRequestActor } = await import('../../utils/tenantContext'));
});

describe('stage3 auth/db contract smoke', () => {
  it('exports canonical and compatibility auth surfaces', () => {
    expect(typeof authMiddleware).toBe('function');
    expect(typeof authTs.authenticateToken).toBe('function');
    expect(typeof authTs.requireAuth).toBe('function');
    expect(typeof authTs.requireOrgAccess).toBe('function');
  });

  it('keeps auth.js a pure re-export shim of auth.ts (M-5), and authAdapter.ts intact', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const authJsContent = fs.readFileSync(path.join(repoRoot, 'server/middleware/auth.js'), 'utf8');
    const authAdapterContent = fs.readFileSync(
      path.join(repoRoot, 'server/middleware/authAdapter.ts'),
      'utf8'
    );

    // The shim must re-export the canonical module and carry NO implementation
    // of its own — the moment auth.js defines a function or imports a verifier,
    // the resolver-dependent shadow pair (ledger M-5) is back.
    expect(authJsContent).toContain("} from './auth.ts';");
    expect(authJsContent).not.toMatch(/^\s*(export\s+)?(default\s+)?(async\s+)?(const|function|class|let|var)\s/m);
    expect(authJsContent).not.toContain('jsonwebtoken');
    expect(authJsContent).not.toContain('verifyJwtWithRotation');
    // The compatibility names route importers actually use stay exported.
    for (const name of [
      'authenticateToken',
      'authenticateJWT',
      'authenticate',
      'requireAuth',
      'requireRole',
      'requireOrgAccess',
      'requireSameOrganization',
      'requirePermission',
      'optionalAuth',
      'invalidateOrgMembershipCache',
      'PLATFORM_SCOPED_ROLES',
    ]) {
      expect(authJsContent, `auth.js shim must keep exporting ${name}`).toContain(name);
    }
    expect(authAdapterContent).toContain('const authModule = require(\'./auth\');');
    expect(authAdapterContent).toContain('export const authenticate =');
    expect(authAdapterContent).toContain('export const requireRole =');
    expect(authAdapterContent).toContain('export const requirePermission =');
    expect(authAdapterContent).toContain('export const requireSameOrganization =');
  });

  it('keeps db.ts and db.js export shape parity for critical helpers', () => {
    expect(typeof dbTs.db).toBe('object');
    expect(typeof dbTs.getPool).toBe('function');
    expect(typeof dbTs.getDb).toBe('function');
    expect(typeof dbTs.runMigrations).toBe('function');
    expect(typeof dbTs.ensureAuthTables).toBe('function');
    expect(typeof dbTs.query).toBe('function');
    expect(typeof dbTs.transaction).toBe('function');
    expect(typeof dbTs.healthCheck).toBe('function');

    expect(typeof dbJs.db).toBe('object');
    expect(typeof dbJs.getPool).toBe('function');
    expect(typeof dbJs.getDb).toBe('function');
    expect(typeof dbJs.runMigrations).toBe('function');
    expect(typeof dbJs.ensureAuthTables).toBe('function');
    expect(typeof dbJs.query).toBe('function');
    expect(typeof dbJs.transaction).toBe('function');
    expect(typeof dbJs.healthCheck).toBe('function');
  });

  it('rejects invalid JWT in canonical and compatibility middleware paths', async () => {
    const reqCanonical: any = {
      headers: { authorization: 'Bearer invalid.jwt.token' },
    };
    const reqCompatTs: any = {
      headers: { authorization: 'Bearer invalid.jwt.token' },
    };

    const mkRes = () => {
      const res: any = {
        statusCode: 200,
        body: undefined,
      };
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.json = (payload: any) => {
        res.body = payload;
        return res;
      };
      return res;
    };

    const resCanonical = mkRes();
    const resCompatTs = mkRes();
    const nextCanonical = () => {
      throw new Error('canonical middleware called next() unexpectedly');
    };
    const nextCompatTs = () => {
      throw new Error('compat ts middleware called next() unexpectedly');
    };

    authMiddleware(reqCanonical, resCanonical, nextCanonical as any);
    authTs.authenticateToken(reqCompatTs, resCompatTs, nextCompatTs as any);

    // authMiddleware is async internally; wait one microtask tick.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(resCanonical.statusCode).toBe(401);
    expect(resCompatTs.statusCode).toBe(401);
  });

  it('enforces org mismatch in TS requireOrgAccess middleware', () => {
    const req: any = {
      user: {
        role: 'user',
        roles: ['user'],
        organizationId: '2',
      },
      params: { organizationId: '999' },
      body: {},
      query: {},
    };
    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.body = payload;
        return this;
      },
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    authTs.requireOrgAccess(req, res, next as any);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body?.error?.code).toBe('AUTH_005');
  });

  it('prefers authenticated tenant context over forged headers for actor metadata', () => {
    const req: any = {
      headers: {
        'x-user-name': 'forged-user',
        'x-user-role': 'admin',
      },
      user: {
        email: 'trusted@company.com',
        role: 'viewer',
      },
    };

    const actor = getRequestActor(req);
    expect(actor.userName).toBe('trusted@company.com');
    expect(actor.userRole).toBe('viewer');
  });
});
