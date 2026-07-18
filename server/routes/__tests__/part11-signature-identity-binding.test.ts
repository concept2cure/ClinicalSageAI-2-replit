/**
 * Regression: 21 CFR Part 11 §11.200(a)(2) signer-identity binding for
 * POST /api/part11/signatures.
 *
 * The bug: the signing identity (`signerId`) was taken entirely from the request
 * body and was never bound to the authenticated session user. The handler then
 * verified the supplied `password` against whatever account the body `signerId`
 * named and persisted the e-signature + audit row under that body value. An
 * authenticated user could therefore record an electronic signature attributed
 * to — and password-verified against — a DIFFERENT account, defeating §11.200(a)(2)
 * ("used only by their genuine owners") and §11.70 signature/record linking.
 *
 * The fix binds the signer to the authenticated user: a body `signerId` that does
 * not match the session user (id or email) is rejected (403), and the password is
 * always verified against the authenticated user's credential — never a body value.
 */

import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// The §11.10(g) signing-authority gate resolves the signer's org role from the
// membership record; mock it so these identity-binding tests control authority
// independently (default: an authorized role, so the gate is transparent).
const resolveSignerOrgRole = vi.hoisted(() => vi.fn());
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));

import part11Router from '../part11-compliance';

// The authenticated session user. Their stored password is "correct-horse".
const AUTH_USER_ID = 42;
const AUTH_USER_EMAIL = 'genuine.owner@example.com';
const VICTIM_USER_ID = 99; // a different account the attacker tries to sign as

let authUserHash: string;

/**
 * Fake pg pool. Records which signerId the password lookup was issued for, and
 * returns a stored hash ONLY for the genuine authenticated user. This lets the
 * test prove the credential checked is the session user's, not a body value.
 */
function makePool() {
  const passwordLookups: string[] = [];
  return {
    passwordLookups,
    query: async (sql: string, params: any[]) => {
      if (/FROM users\s+WHERE id::text/i.test(sql)) {
        const id = String(params[0]);
        passwordLookups.push(id);
        // Only the genuine authenticated user has a usable credential row.
        if (id === String(AUTH_USER_ID) || id === AUTH_USER_EMAIL) {
          return { rows: [{ password_hash: authUserHash }] };
        }
        return { rows: [] };
      }
      // electronic_signatures INSERT (and anything else) — accept as a no-op.
      return { rows: [], rowCount: 1 };
    },
  };
}

function buildApp(pool: ReturnType<typeof makePool>) {
  const app = express();
  app.use(express.json());
  // Stand-in for authenticateToken: every request is the genuine session user.
  app.use((req: any, _res, next) => {
    req.user = { id: AUTH_USER_ID, userId: AUTH_USER_ID, email: AUTH_USER_EMAIL, role: 'user' };
    req.pool = pool;
    next();
  });
  app.use('/api/part11', part11Router);
  return app;
}

describe('POST /api/part11/signatures — §11.200 signer-identity binding', () => {
  beforeAll(async () => {
    authUserHash = await bcrypt.hash('correct-horse', 4);
  });

  beforeEach(() => {
    resolveSignerOrgRole.mockReset();
    resolveSignerOrgRole.mockResolvedValue('approver'); // an authorized signing role
  });

  it('403s a session user whose org role lacks signing authority (§11.10(g))', async () => {
    resolveSignerOrgRole.mockResolvedValueOnce('viewer'); // not a signing role
    const pool = makePool();
    const res = await request(buildApp(pool))
      .post('/api/part11/signatures')
      .send({ documentId: 'doc-x', documentContent: '<p>c</p>', meaning: 'approval', password: 'correct-horse' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
    // Blocked before any credential lookup.
    expect(pool.passwordLookups).toEqual([]);
  });

  it('rejects signing as a different signerId than the authenticated user (no spoofing)', async () => {
    const pool = makePool();
    const app = buildApp(pool);

    const res = await request(app)
      .post('/api/part11/signatures')
      .send({
        documentId: 'doc-1',
        signerId: VICTIM_USER_ID, // attacker claims to be someone else
        meaning: 'approval',
        password: 'correct-horse', // the attacker's OWN password
      });

    expect(res.status).toBe(403);
    // The credential lookup must never have been issued against the victim id.
    expect(pool.passwordLookups).not.toContain(String(VICTIM_USER_ID));
  });

  it('signs successfully when no signerId is supplied — bound to the session user', async () => {
    const pool = makePool();
    const app = buildApp(pool);

    const res = await request(app)
      .post('/api/part11/signatures')
      .send({
        documentId: 'doc-2',
        documentContent: '<p>Clinical Overview v0.7</p>',
        meaning: 'approval',
        password: 'correct-horse',
      });

    expect(res.status).toBe(201);
    // Password was verified against the AUTHENTICATED user, not a body value.
    expect(pool.passwordLookups).toEqual([String(AUTH_USER_ID)]);
    expect(res.body?.data?.id).toBeTruthy();
  });

  it('accepts a matching signerId (redundant assertion) and still binds to the session user', async () => {
    const pool = makePool();
    const app = buildApp(pool);

    const res = await request(app)
      .post('/api/part11/signatures')
      .send({
        documentId: 'doc-3',
        documentContent: '<p>Clinical Overview v0.7</p>',
        signerId: AUTH_USER_ID,
        meaning: 'approval',
        password: 'correct-horse',
      });

    expect(res.status).toBe(201);
    expect(pool.passwordLookups).toEqual([String(AUTH_USER_ID)]);
  });

  it('refuses to sign empty/absent content — a signature must bind content (§11.70)', async () => {
    const pool = makePool();
    const res = await request(buildApp(pool))
      .post('/api/part11/signatures')
      .send({ documentId: 'doc-empty', meaning: 'approval', password: 'correct-horse' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ESIGNATURE_CONTENT_REQUIRED');
    // Rejected before any credential lookup — nothing signed.
    expect(pool.passwordLookups).toEqual([]);
  });

  it('fails the request (500) if the signature insert fails — never a phantom signature', async () => {
    // A pool that authenticates the user but throws on the electronic_signatures insert.
    const passwordLookups: string[] = [];
    const pool = {
      passwordLookups,
      query: async (sql: string, params: any[]) => {
        if (/FROM users\s+WHERE id::text/i.test(sql)) {
          passwordLookups.push(String(params[0]));
          return { rows: [{ password_hash: authUserHash }] };
        }
        if (/INSERT INTO electronic_signatures/i.test(sql)) {
          throw new Error('connection reset');
        }
        return { rows: [], rowCount: 1 };
      },
    } as any;
    const res = await request(buildApp(pool))
      .post('/api/part11/signatures')
      .send({
        documentId: 'doc-5',
        documentContent: '<p>content</p>',
        meaning: 'approval',
        password: 'correct-horse',
      });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ESIGNATURE_PERSIST_FAILED');
  });

  it('rejects with 401 when the supplied password is wrong (still bound to session user)', async () => {
    const pool = makePool();
    const app = buildApp(pool);

    const res = await request(app)
      .post('/api/part11/signatures')
      .send({
        documentId: 'doc-4',
        documentContent: '<p>content</p>',
        meaning: 'approval',
        password: 'wrong-password',
      });

    expect(res.status).toBe(401);
    expect(pool.passwordLookups).toEqual([String(AUTH_USER_ID)]);
  });
});
