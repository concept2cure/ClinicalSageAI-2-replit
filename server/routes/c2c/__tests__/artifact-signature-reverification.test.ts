/**
 * POST /projects/:projectId/artifacts/:artifactId/signatures — the signer is
 * re-verified server-side, and no authentication claim is taken from the body.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * This route applied a 21 CFR Part 11 signature after a role check alone. Its
 * Zod schema took `authenticationMethod` as a free string and
 * `secondFactorVerified` as a boolean, both straight from the request body, and
 * persisted both verbatim onto the signature row. No password, no bcrypt, no
 * TOTP — so a caller could assert that they had been verified by two factors and
 * the record would say so.
 *
 * That is the exact defect POST /api/part11/signatures was DELETED for. The
 * rationale is still in the tree at routes/part11-compliance.ts:359-380: "it
 * recorded mfa_verified from !!req.body.mfaToken — a client-asserted boolean,
 * never verified." It survived here because the correct implementation was
 * written inline in routes/esignature.ts rather than shared, so this route never
 * got it. Both now call services/part11/reverify-signer.
 *
 * The role gate was a second, quieter divergence: it inlined
 * ['admin','approver','reviewer'], which is the DEFAULT of the shared policy but
 * ignores the ESIGNATURE_SIGNING_ROLES override — so a deployment that narrowed
 * its signing roles stayed wide open on this endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 42;
const USER = 7;

/** Rows the mocked drizzle chain resolves, in call order. */
let results: unknown[][] = [];
/** Values handed to db.insert().values(...) — the signature row AND the audit
 *  row the route writes after it, so assertions name which they mean. */
const inserted: Record<string, unknown>[] = [];
/** The signature row specifically: the only insert carrying a signatureHash. */
const signatureRow = () => inserted.find(v => 'signatureHash' in v);

vi.mock('../../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    insert: () => chain,
    values: (v: Record<string, unknown>) => {
      inserted.push(v);
      return chain;
    },
    update: () => chain,
    set: () => chain,
    delete: () => chain,
    returning: () => chain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(resolve),
  };
  return { db: chain, pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() } };
});

// The signer's credentials, as the shared Part 11 deps would report them.
// Declared with the parameter they are actually called with, so the call sites
// below type-check without an `as never` cast that TypeScript does not honour
// for arity (TS2554 counts arguments before it looks at their types).
const passwordMatches = vi.fn(async (_password: string) => true);
const mfaEnrolled = vi.fn(async () => false);
const mfaVerifies = vi.fn(async (_token: string) => true);
vi.mock('../../../services/part11/reverify-signer-deps.js', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => '$2a$10$hash',
    comparePassword: (p: string) => passwordMatches(p),
    isMfaEnabled: () => mfaEnrolled(),
    verifyMfaToken: (_u: number, t: string) => mfaVerifies(t),
    warn: () => {},
  }),
  loadPasswordHash: async () => '$2a$10$hash',
}));

vi.mock('../project-access', () => ({ verifyProjectAccess: async () => true }));
vi.mock('../../../auth', () => ({
  authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
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

function app(role = 'approver') {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    r.user = { id: USER, organizationId: ORG, role };
    r.userId = USER;
    r.userRole = role;
    r.userEmail = 'signer@example.test';
    next();
  });
  a.use('/api/concept2cure', artifactRoutes);
  return a;
}

const URL = '/api/concept2cure/projects/1/artifacts/art_1/signatures';

/** Artifact lookup, then version lookup, then the insert's returning(). */
function storeReady() {
  results = [
    [{ id: 10, artifactId: 'art_1', organizationId: ORG, version: 3 }],
    [{ id: 99, contentHash: 'abc123', version: 3 }],
    [{ signatureId: 'sig_x', signedAt: new Date() }],
  ];
}

beforeEach(() => {
  results = [];
  inserted.length = 0;
  passwordMatches.mockReset().mockResolvedValue(true);
  mfaEnrolled.mockReset().mockResolvedValue(false);
  mfaVerifies.mockReset().mockResolvedValue(true);
});

describe('the client cannot assert its own authentication', () => {
  it('refuses a request that claims two-factor verification but supplies no password', async () => {
    storeReady();
    const res = await request(app())
      .post(URL)
      .send({
        signaturePurpose: 'approval',
        // Exactly the pre-fix payload: the caller declaring itself verified.
        authenticationMethod: 'password+totp',
        secondFactorVerified: true,
      });

    expect(res.status).toBe(400);
    expect(signatureRow()).toBeUndefined();
  });

  it('does not persist an authenticationMethod supplied by the caller', async () => {
    storeReady();
    await request(app())
      .post(URL)
      .send({
        signaturePurpose: 'approval',
        password: 'correct horse',
        authenticationMethod: 'sso-trust-me',
        secondFactorVerified: true,
      });

    const row = signatureRow();
    expect(row).toBeDefined();
    // Derived from what was checked: this signer has no MFA enrolled.
    expect(row!.authenticationMethod).toBe('password');
    expect(row!.secondFactorVerified).toBe(false);
    // And the caller's assertion reached the row under no other key either.
    expect(JSON.stringify(row)).not.toContain('sso-trust-me');
  });
});

describe('re-verification gates the signature', () => {
  it('refuses a wrong password and writes nothing', async () => {
    storeReady();
    passwordMatches.mockResolvedValue(false);

    const res = await request(app()).post(URL).send({
      signaturePurpose: 'approval',
      password: 'wrong',
    });

    expect(res.status).toBe(401);
    expect(signatureRow()).toBeUndefined();
  });

  it('requires the second factor when the signer has MFA enrolled', async () => {
    storeReady();
    mfaEnrolled.mockResolvedValue(true);

    const res = await request(app()).post(URL).send({
      signaturePurpose: 'approval',
      password: 'correct horse',
    });

    expect(res.status).toBe(400);
    expect(signatureRow()).toBeUndefined();
  });

  it('records password+mfa when both factors verified', async () => {
    storeReady();
    mfaEnrolled.mockResolvedValue(true);

    const res = await request(app()).post(URL).send({
      signaturePurpose: 'approval',
      password: 'correct horse',
      mfaToken: '123456',
    });

    expect(res.status).toBe(201);
    expect(signatureRow()!.authenticationMethod).toBe('password+mfa');
    expect(signatureRow()!.secondFactorVerified).toBe(true);
  });
});

describe('§11.10(g) authority', () => {
  it('refuses a role with no signing authority before any credential is checked', async () => {
    storeReady();
    const res = await request(app('viewer')).post(URL).send({
      signaturePurpose: 'approval',
      password: 'correct horse',
    });

    expect(res.status).toBe(403);
    expect(passwordMatches).not.toHaveBeenCalled();
    expect(signatureRow()).toBeUndefined();
  });
});
