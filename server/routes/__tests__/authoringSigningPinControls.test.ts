/**
 * The signing PIN had two doors, and only one was locked.
 *
 * POST /users/pin is the canonical way to set the credential that gates every
 * electronic signature in this router. It was hardened to require the CURRENT
 * PIN, bcrypt-verified, before overwriting an existing one — §11.200(a)(1):
 * possession of a session must not become possession of the signing credential.
 *
 * POST /docs/:docId/create-pin did the same job with no caller and neither
 * control. It called createUserPin() straight through, whose upsert ended in
 * `failed_attempts = 0, locked_until = NULL` — so it also cleared the
 * three-attempt lockout that verifyUserPin enforces, meaning the brute-force
 * control could be reset between guesses by the session doing the guessing.
 *
 * These tests pin that the bypass is gone and the control that remains is the
 * one that actually checks.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-pin-controls';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({ sub: 'u1', organizationId: 7, email: 'signer@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** A signer who already HAS a PIN — the case the control exists for. */
function existingPin(hash: string) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('SELECT pin_hash') && s.includes('user_pins')) {
      return { rowCount: 1, rows: [{ pin_hash: hash }] };
    }
    return { rowCount: 0, rows: [] };
  });
}

/** Every statement this request issued. */
const statements = () => mockQuery.mock.calls.map(c => String(c[0]));

beforeEach(() => mockQuery.mockReset());

describe('the deleted PIN bypass', () => {
  it('POST /docs/:docId/create-pin no longer exists', async () => {
    existingPin(await bcrypt.hash('current-pin', 10));
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/create-pin')
      .set('Authorization', await bearer())
      .send({ pin: 'brand-new-pin' });

    expect(res.status).toBe(404);
    // Nothing may have touched the credential on the way to that 404.
    expect(statements().some(s => s.includes('user_pins') && s.includes('INSERT'))).toBe(false);
  });
});

describe('the deleted UAT seeder', () => {
  it('POST /docs/:docId/seed-stability no longer exists', async () => {
    mockQuery.mockImplementation(async () => ({ rowCount: 0, rows: [] }));
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/seed-stability')
      .set('Authorization', await bearer())
      .send({});

    // It had no environment guard, so a fixture seeder defaulting to
    // 'UAT-PROD' was reachable over HTTP in any deployment.
    expect(res.status).toBe(404);
  });
});

describe('POST /users/pin — the control that remains', () => {
  it('refuses to overwrite a sitting PIN without the current one', async () => {
    existingPin(await bcrypt.hash('current-pin', 10));
    const res = await request(makeApp())
      .post('/api/authoring/users/pin')
      .set('Authorization', await bearer())
      .send({ pin: 'brand-new-pin' }); // no old_pin

    expect(res.status).toBe(400);
    expect(statements().some(s => s.includes('UPDATE user_pins'))).toBe(false);
  });

  it('refuses a WRONG current PIN', async () => {
    existingPin(await bcrypt.hash('current-pin', 10));
    const res = await request(makeApp())
      .post('/api/authoring/users/pin')
      .set('Authorization', await bearer())
      .send({ pin: 'brand-new-pin', old_pin: 'not-the-current-one' });

    expect(res.status).toBe(401);
    expect(statements().some(s => s.includes('UPDATE user_pins'))).toBe(false);
  });

  it('accepts the change when the current PIN is proved', async () => {
    existingPin(await bcrypt.hash('current-pin', 10));
    const res = await request(makeApp())
      .post('/api/authoring/users/pin')
      .set('Authorization', await bearer())
      .send({ pin: 'brand-new-pin', old_pin: 'current-pin' });

    expect(res.status).toBeLessThan(400);
    expect(statements().some(s => s.includes('UPDATE user_pins'))).toBe(true);
  });

  it('lets a first-time signer enrol, where there is no current PIN to prove', async () => {
    mockQuery.mockImplementation(async () => ({ rowCount: 0, rows: [] }));
    const res = await request(makeApp())
      .post('/api/authoring/users/pin')
      .set('Authorization', await bearer())
      .send({ pin: 'first-pin' });

    expect(res.status).toBeLessThan(400);
    expect(statements().some(s => s.includes('INSERT INTO user_pins'))).toBe(true);
  });
});
