/**
 * Contract: POST /projects/:projectId/artifacts/:artifactId/signatures is GONE,
 * and the c2c artifacts router writes no signature substrate of its own.
 *
 * HISTORY. VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md §4.3 found this route
 * persisting a client-asserted `secondFactorVerified`; the 2026-09-05 fix put
 * `reverifySigner` in front of it (see the deleted
 * artifact-signature-reverification.test.ts) but left the SECOND SUBSTRATE in
 * place: an INSERT into `concept2cure_signatures` with its own sha256 recipe,
 * no §11.70 binding basis, no supersession chain, and a signer name taken from
 * `req.userName || req.userEmail || 'unknown'`. Two signature tables with two
 * hash recipes is the zero-duplication violation the assessment named, and the
 * route had no caller in client/ or server/. The canonical substrate is
 * `electronic_signatures` through server/services/part11/signature-persistence.ts,
 * reached by POST /api/esignature/sign and POST /api/c2c/actions/sign.
 *
 * The GET survives: rows already written are §11.70 history and stay readable.
 *
 * @compliance 21 CFR Part 11 §11.70, §11.200
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({
  db: { select: () => { throw new Error('no query expected on this path'); } },
  pool: { query: vi.fn(async () => { throw new Error('no query expected on this path'); }), connect: vi.fn() },
}));
vi.mock('../project-access', () => ({ verifyProjectAccess: async () => true }));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/enterprise-performance', () => ({
  cacheResponse: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import artifactRoutes from '../artifacts';

const ROUTER_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'artifacts.ts'), 'utf8');
/** Executable code only — the removal note deliberately names what was removed. */
const ROUTER_CODE = ROUTER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    r.user = { id: 7, organizationId: 42, role: 'approver' };
    r.userId = 7;
    r.userRole = 'approver';
    r.userEmail = 'signer@example.test';
    next();
  });
  a.use('/api/concept2cure', artifactRoutes);
  return a;
}

const routes = () =>
  (artifactRoutes as any).stack
    .filter((l: any) => l.route)
    .flatMap((l: any) => Object.keys(l.route.methods).map((m: string) => `${m.toUpperCase()} ${l.route.path}`));

describe('POST /projects/:projectId/artifacts/:artifactId/signatures — removed', () => {
  it('is not routed: a fully formed signing request gets 404 and touches no store', async () => {
    const res = await request(app())
      .post('/api/concept2cure/projects/1/artifacts/art_1/signatures')
      .send({ signaturePurpose: 'approval', password: 'correct horse', mfaToken: '123456' });
    expect(res.status).toBe(404);
  });

  it('the GET (§11.70 history) survives; the POST does not', () => {
    const r = routes();
    expect(r).toContain('GET /projects/:projectId/artifacts/:artifactId/signatures');
    expect(r).not.toContain('POST /projects/:projectId/artifacts/:artifactId/signatures');
  });

  it('the router has no local signature-hash recipe and no re-auth wiring left behind', () => {
    expect(/calculateSignatureHash/.test(ROUTER_CODE)).toBe(false);
    expect(/reverifySigner/.test(ROUTER_CODE)).toBe(false);
    expect(/createSignatureSchema/.test(ROUTER_CODE)).toBe(false);
  });
});
