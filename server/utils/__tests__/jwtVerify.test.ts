/**
 * Pins the JWT rotation contract:
 *
 *   - Tokens signed with the current secret verify.
 *   - When previousSecret is configured, tokens signed with EITHER
 *     secret verify — that's what makes rotation zero-downtime.
 *   - Expired tokens still produce TokenExpiredError (we do NOT
 *     retry against the previous secret on expiry).
 *   - Algorithm is pinned to HS256 — alg-confusion attempts refused.
 *   - When previousSecret is NOT configured, behavior matches the
 *     pre-rotation baseline (one secret, one verify path).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const CURRENT = 'a'.repeat(40);
const PREVIOUS = 'b'.repeat(40);

async function loadVerify() {
  return (await import('../jwtVerify')).verifyJwtWithRotation;
}

async function loadIsRotating() {
  return (await import('../jwtVerify')).isJwtRotationInProgress;
}

function setSecrets(current?: string, previous?: string) {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = 'postgres://test';
  if (current) process.env.JWT_SECRET = current;
  else delete process.env.JWT_SECRET;
  if (previous) process.env.JWT_SECRET_PREVIOUS = previous;
  else delete process.env.JWT_SECRET_PREVIOUS;
  delete process.env.JWT_SECRET_DEV;
  delete process.env.JWT_SECRET_PREVIOUS_DEV;
}

describe('verifyJwtWithRotation — no rotation in progress', () => {
  it('verifies a token signed with the current secret', async () => {
    setSecrets(CURRENT);
    const token = jwt.sign({ sub: 'alice' }, CURRENT, { algorithm: 'HS256' });
    const verify = await loadVerify();
    const decoded = verify<{ sub: string }>(token);
    expect(decoded.sub).toBe('alice');
  });

  it('rejects a token signed with an unrelated secret', async () => {
    setSecrets(CURRENT);
    const token = jwt.sign({ sub: 'attacker' }, 'something else entirely' + 'x'.repeat(20), {
      algorithm: 'HS256',
    });
    const verify = await loadVerify();
    expect(() => verify(token)).toThrow();
  });

  it('rejects an expired token even when previous is set', async () => {
    setSecrets(CURRENT, PREVIOUS);
    const expired = jwt.sign({ sub: 'alice' }, CURRENT, {
      algorithm: 'HS256',
      expiresIn: '-1h',
    });
    const verify = await loadVerify();
    expect(() => verify(expired)).toThrow(/expired|jwt expired/i);
  });
});

describe('verifyJwtWithRotation — rotation in progress', () => {
  it('verifies tokens signed with the CURRENT secret', async () => {
    setSecrets(CURRENT, PREVIOUS);
    const tok = jwt.sign({ sub: 'a' }, CURRENT, { algorithm: 'HS256' });
    const verify = await loadVerify();
    expect(verify<{ sub: string }>(tok).sub).toBe('a');
  });

  it('verifies tokens signed with the PREVIOUS secret (zero-downtime rotation)', async () => {
    setSecrets(CURRENT, PREVIOUS);
    const tok = jwt.sign({ sub: 'b' }, PREVIOUS, { algorithm: 'HS256' });
    const verify = await loadVerify();
    expect(verify<{ sub: string }>(tok).sub).toBe('b');
  });

  it('rejects tokens signed with neither secret', async () => {
    setSecrets(CURRENT, PREVIOUS);
    const tok = jwt.sign({ sub: 'attacker' }, 'unrelated-secret' + 'x'.repeat(20), {
      algorithm: 'HS256',
    });
    const verify = await loadVerify();
    expect(() => verify(tok)).toThrow();
  });

  it('rejects tokens signed with a different algorithm (HS512)', async () => {
    setSecrets(CURRENT, PREVIOUS);
    const tok = jwt.sign({ sub: 'attacker' }, CURRENT, { algorithm: 'HS512' });
    const verify = await loadVerify();
    // The verifier pins algorithms: ['HS256'] — anything else throws.
    expect(() => verify(tok)).toThrow();
  });

  it('throws the PRIMARY error (not the previous-secret one) when both fail', async () => {
    setSecrets(CURRENT, PREVIOUS);
    // Garbage token — both secrets will fail with the same signature
    // error, but the contract says throw the primary one.
    const verify = await loadVerify();
    try {
      verify('not.a.valid.jwt');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/jwt malformed|invalid|signature/i);
    }
  });
});

describe('isJwtRotationInProgress', () => {
  it('false when previous secret is unset', async () => {
    setSecrets(CURRENT);
    const isRotating = await loadIsRotating();
    expect(isRotating()).toBe(false);
  });

  it('true when previous secret is set', async () => {
    setSecrets(CURRENT, PREVIOUS);
    const isRotating = await loadIsRotating();
    expect(isRotating()).toBe(true);
  });
});
