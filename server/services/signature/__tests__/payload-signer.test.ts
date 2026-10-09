/**
 * The KMS envelope: sign, verify (KMS Verify API path and offline public-key
 * path), and tamper detection on every field an attacker with steps-column
 * write access could reach.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalPayloadSignatureInput,
  signPayloadDigest,
  verifyPayloadSignature,
  verifyPayloadSignatureOffline,
  type PayloadSignatureEnvelope,
} from '../payload-signer';
import type { SignerPosture } from '../signer-mode';
import { makeFakeKms } from './fake-kms';

const DIGEST = 'a'.repeat(64);
const ORG = 7;
const kmsPosture = (keyId = 'alias/fda-signing-key-2026'): SignerPosture => ({
  mode: 'kms',
  production: false,
  hmacSealConfigured: true,
  hmacAccepted: false,
  kms: { keyId, region: 'us-east-1', signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' },
});
const hmacPosture: SignerPosture = { mode: 'hmac', production: false, hmacSealConfigured: true, hmacAccepted: false };

async function signed() {
  const fake = makeFakeKms();
  const deps = { posture: kmsPosture(), kms: async () => fake.ops, now: () => new Date('2026-09-20T00:00:00Z') };
  const envelope = (await signPayloadDigest(DIGEST, ORG, deps))!;
  return { fake, deps, envelope };
}

describe('signPayloadDigest', () => {
  it('returns null under dev/hmac (the seal alone is the record)', async () => {
    const fake = makeFakeKms();
    expect(await signPayloadDigest(DIGEST, ORG, { posture: hmacPosture, kms: async () => fake.ops })).toBeNull();
  });
  it('in kms mode produces an envelope carrying algorithm, resolved key id, and the exact signed input', async () => {
    const { fake, envelope } = await signed();
    expect(envelope).toMatchObject({ v: 1, mode: 'kms', algorithm: 'RSASSA_PKCS1_V1_5_SHA_256', keyId: fake.keyArn, digestAlgorithm: 'sha256', signedAt: '2026-09-20T00:00:00.000Z' });
    expect(envelope.signedInput).toBe(canonicalPayloadSignatureInput(DIGEST, ORG));
    expect(envelope.signedInput).toContain('ectd.release-signature.payload-digest.kms.v1');
    expect(envelope.publicKeySha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('refuses a malformed digest and propagates a KMS failure (never sealed-but-unsigned)', async () => {
    const fake = makeFakeKms();
    const deps = { posture: kmsPosture(), kms: async () => fake.ops };
    await expect(signPayloadDigest('nope', ORG, deps)).rejects.toThrow(/malformed payload digest/);
    fake.failing = true;
    await expect(signPayloadDigest(DIGEST, ORG, deps)).rejects.toThrow(/unavailable/);
  });
});

describe('verifyPayloadSignature (KMS Verify API path)', () => {
  it('ok for a genuine envelope; unsigned when none is stored', async () => {
    const { deps, envelope } = await signed();
    expect(await verifyPayloadSignature(DIGEST, ORG, envelope, deps)).toBe('ok');
    expect(await verifyPayloadSignature(DIGEST, ORG, undefined, deps)).toBe('unsigned');
    expect(await verifyPayloadSignature(DIGEST, ORG, null, deps)).toBe('unsigned');
  });
  it('detects a tampered digest, org, signature, or signedInput', async () => {
    const { deps, envelope } = await signed();
    expect(await verifyPayloadSignature('b'.repeat(64), ORG, envelope, deps)).toBe('failed');
    expect(await verifyPayloadSignature(DIGEST, ORG + 1, envelope, deps)).toBe('failed');
    const sig = Buffer.from(envelope.signature, 'base64');
    sig[5] ^= 0xff;
    expect(await verifyPayloadSignature(DIGEST, ORG, { ...envelope, signature: sig.toString('base64') }, deps)).toBe('failed');
    expect(await verifyPayloadSignature(DIGEST, ORG, { ...envelope, signedInput: envelope.signedInput + ' ' }, deps)).toBe('failed');
  });
  it('a malformed or foreign-algorithm envelope fails closed', async () => {
    const { deps, envelope } = await signed();
    expect(await verifyPayloadSignature(DIGEST, ORG, { junk: true }, deps)).toBe('failed');
    expect(await verifyPayloadSignature(DIGEST, ORG, { ...envelope, algorithm: 'RSASSA_PSS_SHA_256' }, deps)).toBe('failed');
    expect(await verifyPayloadSignature(DIGEST, ORG, { ...envelope, v: 2 }, deps)).toBe('failed');
  });
  it('an envelope exists but the posture is no longer kms → failed (unverifiable is not accepted)', async () => {
    const { envelope, fake } = await signed();
    expect(await verifyPayloadSignature(DIGEST, ORG, envelope, { posture: hmacPosture, kms: async () => fake.ops })).toBe('failed');
  });
  it('verifies against the key the POSTURE names, not the key the envelope names', async () => {
    const { envelope } = await signed();
    // A different key pair claims the same ARN in its envelope: the posture's
    // key (this fake) does not verify it.
    const other = makeFakeKms(envelope.keyId);
    const deps = { posture: kmsPosture(), kms: async () => other.ops };
    expect(await verifyPayloadSignature(DIGEST, ORG, envelope, deps)).toBe('failed');
  });
  it('KMS unavailable at verify time → failed, not ok', async () => {
    const { deps, envelope, fake } = await signed();
    fake.failing = true;
    expect(await verifyPayloadSignature(DIGEST, ORG, envelope, deps)).toBe('failed');
  });
});

describe('verifyPayloadSignatureOffline (published public key, no KMS)', () => {
  it('ok with the right public key; failed with the wrong one or a tampered envelope', async () => {
    const { envelope, fake } = await signed();
    expect(verifyPayloadSignatureOffline(DIGEST, ORG, envelope, fake.spkiDer)).toBe('ok');
    expect(verifyPayloadSignatureOffline(DIGEST, ORG, envelope, makeFakeKms().spkiDer)).toBe('failed');
    const forged: PayloadSignatureEnvelope = { ...envelope, signedInput: canonicalPayloadSignatureInput('c'.repeat(64), ORG) };
    expect(verifyPayloadSignatureOffline('c'.repeat(64), ORG, forged, fake.spkiDer)).toBe('failed');
    expect(verifyPayloadSignatureOffline(DIGEST, ORG, undefined, fake.spkiDer)).toBe('unsigned');
  });
});
