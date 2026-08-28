/**
 * Server-keyed seal over the release-signature payload digest.
 * Pure crypto — no DB. Proves the seal binds the digest to the AUDIT_HMAC_KEY so
 * a steps-column tamperer cannot forge a self-consistent snapshot+digest.
 */
import { describe, it, expect } from 'vitest';
import {
  isSignSealConfigured,
  sealSignPayloadDigest,
  verifySignPayloadSeal,
} from '../sign-payload-seal';

const KEY = 'test-audit-hmac-key-with-plenty-of-entropy-0123456789';
const env = (v?: string) => ({ AUDIT_HMAC_KEY: v } as unknown as NodeJS.ProcessEnv);
const DIGEST = 'a'.repeat(64);

describe('sign-payload-seal', () => {
  it('seals + verifies a digest under a configured key', () => {
    const seal = sealSignPayloadDigest(DIGEST, 1, env(KEY));
    expect(seal).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignPayloadSeal(DIGEST, 1, seal, env(KEY))).toBe('ok');
  });

  it('is deterministic (same digest+org+key → same seal)', () => {
    expect(sealSignPayloadDigest(DIGEST, 7, env(KEY))).toBe(sealSignPayloadDigest(DIGEST, 7, env(KEY)));
  });

  it('binds the digest — a forged digest does NOT verify against the real seal', () => {
    const seal = sealSignPayloadDigest(DIGEST, 1, env(KEY));
    expect(verifySignPayloadSeal('b'.repeat(64), 1, seal, env(KEY))).toBe('failed');
  });

  it('binds the org — a different org does NOT verify', () => {
    const seal = sealSignPayloadDigest(DIGEST, 1, env(KEY));
    expect(verifySignPayloadSeal(DIGEST, 2, seal, env(KEY))).toBe('failed');
  });

  it('a seal made under a different key does NOT verify (rotation fails closed)', () => {
    const seal = sealSignPayloadDigest(DIGEST, 1, env(KEY));
    expect(verifySignPayloadSeal(DIGEST, 1, seal, env('a-different-key-entirely-0123456789abcdef'))).toBe('failed');
  });

  it('no key configured → sealing disabled (null) and an absent seal is "unsealed"', () => {
    expect(isSignSealConfigured(env(undefined))).toBe(false);
    expect(sealSignPayloadDigest(DIGEST, 1, env(undefined))).toBeNull();
    expect(verifySignPayloadSeal(DIGEST, 1, undefined, env(undefined))).toBe('unsealed');
  });

  it('a stored seal with the key now ABSENT fails closed (unverifiable, not accepted)', () => {
    const seal = sealSignPayloadDigest(DIGEST, 1, env(KEY));
    expect(verifySignPayloadSeal(DIGEST, 1, seal, env(undefined))).toBe('failed');
  });

  it('a malformed (non-hex / wrong-length) stored seal fails closed', () => {
    expect(verifySignPayloadSeal(DIGEST, 1, 'not-hex', env(KEY))).toBe('failed');
    expect(verifySignPayloadSeal(DIGEST, 1, 'abcd', env(KEY))).toBe('failed');
  });
});
