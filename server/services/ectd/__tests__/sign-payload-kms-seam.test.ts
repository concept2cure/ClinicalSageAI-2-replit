/**
 * The seam: sign-payload-seal.ts resolves CONCEPT2CURE_SIGNER_MODE from env,
 * signs with KMS in kms mode, and verifies with the seal's verdict vocabulary.
 * The KMS is the in-memory fake injected through the test seam.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  __setKmsOpsLoaderForTests,
  isKmsSignerConfigured,
  sealSignPayloadDigest,
  signSignPayloadDigest,
  verifySignPayloadSeal,
  verifySignPayloadSignature,
} from '../sign-payload-seal';
import { makeFakeKms } from '../../signature/__tests__/fake-kms';

const KEY = 'test-audit-hmac-key-with-plenty-of-entropy-0123456789';
const DIGEST = 'd'.repeat(64);
const kmsEnv = (o: Record<string, string> = {}) =>
  ({
    NODE_ENV: 'test',
    AUDIT_HMAC_KEY: KEY,
    CONCEPT2CURE_SIGNER_MODE: 'kms',
    CONCEPT2CURE_SIGNER_KMS_KEY_ID: 'alias/fda-signing-key-2026',
    CONCEPT2CURE_SIGNER_KMS_REGION: 'us-east-1',
    ...o,
  }) as unknown as NodeJS.ProcessEnv;
const hmacEnv = { NODE_ENV: 'test', AUDIT_HMAC_KEY: KEY, CONCEPT2CURE_SIGNER_MODE: 'hmac' } as unknown as NodeJS.ProcessEnv;

afterEach(() => __setKmsOpsLoaderForTests(null));

describe('sign-payload-seal × CONCEPT2CURE_SIGNER_MODE', () => {
  it('hmac posture: seal only, no envelope, and an absent envelope is "unsigned"', async () => {
    expect(isKmsSignerConfigured(hmacEnv)).toBe(false);
    expect(sealSignPayloadDigest(DIGEST, 1, hmacEnv)).toMatch(/^[0-9a-f]{64}$/);
    expect(await signSignPayloadDigest(DIGEST, 1, hmacEnv)).toBeNull();
    expect(await verifySignPayloadSignature(DIGEST, 1, undefined, hmacEnv)).toBe('unsigned');
  });

  it('kms posture: the envelope is written BESIDE the seal and both verify', async () => {
    const fake = makeFakeKms();
    __setKmsOpsLoaderForTests(async () => fake.ops);
    const env = kmsEnv();
    expect(isKmsSignerConfigured(env)).toBe(true);
    const seal = sealSignPayloadDigest(DIGEST, 1, env)!;
    const envelope = (await signSignPayloadDigest(DIGEST, 1, env))!;
    expect(envelope.keyId).toBe(fake.keyArn);
    expect(verifySignPayloadSeal(DIGEST, 1, seal, env)).toBe('ok');
    expect(await verifySignPayloadSignature(DIGEST, 1, envelope, env)).toBe('ok');
  });

  it('kms posture: a tampered envelope, or one from another org, fails closed', async () => {
    const fake = makeFakeKms();
    __setKmsOpsLoaderForTests(async () => fake.ops);
    const env = kmsEnv();
    const envelope = (await signSignPayloadDigest(DIGEST, 1, env))!;
    expect(await verifySignPayloadSignature(DIGEST, 2, envelope, env)).toBe('failed');
    expect(await verifySignPayloadSignature('e'.repeat(64), 1, envelope, env)).toBe('failed');
  });

  it('a stored envelope with the posture downgraded to hmac is "failed", never accepted', async () => {
    const fake = makeFakeKms();
    __setKmsOpsLoaderForTests(async () => fake.ops);
    const envelope = (await signSignPayloadDigest(DIGEST, 1, kmsEnv()))!;
    expect(await verifySignPayloadSignature(DIGEST, 1, envelope, hmacEnv)).toBe('failed');
  });

  it('a malformed posture throws (the boot gate, seen from the seam)', () => {
    expect(() => isKmsSignerConfigured({ NODE_ENV: 'test', CONCEPT2CURE_SIGNER_MODE: 'hsm_kms' } as unknown as NodeJS.ProcessEnv)).toThrow(/retired literal/);
  });
});
