import { describe, it, expect } from 'vitest';
import { authMiddleware } from '../../auth';
import * as authTs from '../../middleware/auth';
import * as authJs from '../../middleware/auth.js';
import * as authAdapter from '../../middleware/authAdapter';
import * as dbTs from '../../db';
import * as dbJs from '../../db.js';
import { getRequestActor } from '../../utils/tenantContext';

describe('stage3 auth/db contract smoke', () => {
  it('exports canonical and compatibility auth surfaces', () => {
    expect(typeof authMiddleware).toBe('function');
    expect(typeof authTs.authenticateToken).toBe('function');
    expect(typeof authTs.requireAuth).toBe('function');
    expect(typeof authTs.requireOrgAccess).toBe('function');

    expect(typeof authJs.authenticateJWT).toBe('function');
    expect(typeof authJs.authenticateToken).toBe('function');
    expect(typeof authJs.requireAuth).toBe('function');
    expect(typeof authJs.verifyJwt).toBe('function');
    expect(typeof authJs.requireRole).toBe('function');
    expect(typeof authJs.requirePermission).toBe('function');
    expect(typeof authJs.hasPermission).toBe('function');
    expect(typeof authJs.isPublicRoute).toBe('function');

    expect(typeof authAdapter.authenticate).toBe('function');
    expect(typeof authAdapter.requireRole).toBe('function');
    expect(typeof authAdapter.requirePermission).toBe('function');
    expect(typeof authAdapter.requireSameOrganization).toBe('function');
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
    const reqCompatJs: any = {
      path: '/api/protected',
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
    const resCompatJs = mkRes();
    const nextCanonical = () => {
      throw new Error('canonical middleware called next() unexpectedly');
    };
    const nextCompatTs = () => {
      throw new Error('compat ts middleware called next() unexpectedly');
    };
    const nextCompatJs = () => {
      throw new Error('compat js middleware called next() unexpectedly');
    };

    authMiddleware(reqCanonical, resCanonical, nextCanonical as any);
    authTs.authenticateToken(reqCompatTs, resCompatTs, nextCompatTs as any);
    authJs.authenticateJWT(reqCompatJs, resCompatJs, nextCompatJs as any);

    // authMiddleware is async internally; wait one microtask tick.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(resCanonical.statusCode).toBe(401);
    expect(resCompatTs.statusCode).toBe(401);
    expect(resCompatJs.statusCode).toBe(401);
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
