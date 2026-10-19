/**
 * A release signed before a key rotation still verifies after it (SOP §5) —
 * without ever trusting the key an envelope names.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * verifyPayloadSignature verified against posture.kms.keyId — the CURRENT key —
 * and treated the envelope's keyId as inspection-only. docs/SOP_KEY_MANAGEMENT.md
 * §5 rotates by creating next year's key, moving the alias to it, and keeping the
 * previous key "enabled for Verify only", and tells an inspector "old signatures
 * verify against the old key". They did not: after the SOP's own rotation every
 * earlier release would have verified `failed`, and its export blocked.
 *
 * ── The rotation, as the SOP does it ─────────────────────────────────────────
 * Two keys with distinct ARNs. CONCEPT2CURE_SIGNER_KMS_KEY_ID is the ALIAS
 * (terraform/stack/release_signing.tf sets it to the alias), and the alias moves
 * from the 2026 key to the 2027 key. Sign returns the ARN, which is what an
 * envelope records — so alias and envelope never agree as strings, even today.
 */
import { describe, it, expect } from 'vitest';
import { signPayloadDigest, verifyPayloadSignature, type PayloadSignatureEnvelope } from '../payload-signer';
import type { KmsOps } from '../kms-signer';
import type { SignerPosture } from '../signer-mode';
import { makeFakeKms, type FakeKms } from './fake-kms';

const DIGEST = 'b'.repeat(64);
const ORG = 11;
const ALIAS = 'alias/fda-signing-key';

/** Two keys behind one KMS: `aliasTo` is the key the alias currently names. */
function rotatingKms() {
  const keys = {
    k2026: makeFakeKms('arn:aws:kms:us-east-1:000000000000:key/2026-0001'),
    k2027: makeFakeKms('arn:aws:kms:us-east-1:000000000000:key/2027-0001'),
  };
  const state = { aliasTo: 'k2026' as keyof typeof keys, unreadable: new Set<string>() };
  const route = (keyId: string): FakeKms => {
    if (keyId === ALIAS) return keys[state.aliasTo];
    const hit = Object.values(keys).find((k) => k.keyArn === keyId);
    if (!hit) throw new Error(`NotFoundException: no key ${keyId}`);
    return hit;
  };
  const ops: KmsOps = {
    sign: (i) => route(i.keyId).ops.sign(i),
    verify: (i) => route(i.keyId).ops.verify(i),
    getPublicKey: (keyId) => {
      if (state.unreadable.has(keyId)) return Promise.reject(new Error(`AccessDeniedException: ${keyId}`));
      return route(keyId).ops.getPublicKey(keyId);
    },
  };
  return { keys, state, ops };
}

const posture = (verifyKeyIds?: string[]): SignerPosture => ({
  mode: 'kms',
  production: true,
  hmacSealConfigured: true,
  hmacAccepted: false,
  kms: {
    keyId: ALIAS,
    region: 'us-east-1',
    signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    ...(verifyKeyIds ? { verifyKeyIds } : {}),
  },
});
const depsOf = (ops: KmsOps, p: SignerPosture) => ({ posture: p, kms: async () => ops });

describe('a key rotation, as SOP §5 does it', () => {
  it('before rotation: a release signed under the alias verifies (the alias and the envelope ARN never match as text)', async () => {
    const { ops, keys } = rotatingKms();
    const env = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, posture())))!;
    expect(env.keyId, 'the envelope records the ARN, not the alias').toBe(keys.k2026.keyArn);
    expect(await verifyPayloadSignature(DIGEST, ORG, env, depsOf(ops, posture()))).toBe('ok');
  });

  it('after rotation, with the previous key retained for Verify: the 2026 release still verifies', async () => {
    const { ops, keys, state } = rotatingKms();
    const env2026 = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, posture())))!;
    state.aliasTo = 'k2027'; // the alias moves to next year's key
    const after = posture([keys.k2026.keyArn]);
    expect(await verifyPayloadSignature(DIGEST, ORG, env2026, depsOf(ops, after))).toBe('ok');
  });

  it('and a release signed after rotation is signed with, and verifies against, the new key', async () => {
    const { ops, keys, state } = rotatingKms();
    state.aliasTo = 'k2027';
    const after = posture([keys.k2026.keyArn]);
    const env2027 = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, after)))!;
    expect(env2027.keyId).toBe(keys.k2027.keyArn);
    expect(await verifyPayloadSignature(DIGEST, ORG, env2027, depsOf(ops, after))).toBe('ok');
  });

  it('after rotation WITHOUT retaining the previous key: the 2026 release fails closed (the SOP requires keeping it)', async () => {
    const { ops, state } = rotatingKms();
    const env2026 = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, posture())))!;
    state.aliasTo = 'k2027';
    expect(await verifyPayloadSignature(DIGEST, ORG, env2026, depsOf(ops, posture()))).toBe('failed');
  });

  it('a retained key that cannot be read does not stop a current-key release verifying', async () => {
    const { ops, keys, state } = rotatingKms();
    state.aliasTo = 'k2027';
    const after = posture([keys.k2026.keyArn]);
    const env2027 = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, after)))!;
    state.unreadable.add(keys.k2026.keyArn);
    expect(await verifyPayloadSignature(DIGEST, ORG, env2027, depsOf(ops, after))).toBe('ok');
  });
});

describe('the envelope still cannot choose its own key', () => {
  it("an envelope signed by an attacker's own key, naming that key, fails — it is not a trusted key", async () => {
    const { ops, keys } = rotatingKms();
    const attacker = makeFakeKms('arn:aws:kms:us-east-1:999999999999:key/attacker');
    const forged = (await signPayloadDigest(DIGEST, ORG, depsOf(attacker.ops, posture())))!;
    expect(forged.keyId).toBe(attacker.keyArn);
    const p = posture([keys.k2026.keyArn]);
    expect(await verifyPayloadSignature(DIGEST, ORG, forged, depsOf(ops, p))).toBe('failed');
  });

  it("borrowing a trusted key's fingerprint selects that key, and KMS then refuses the forged signature", async () => {
    const { ops, keys } = rotatingKms();
    const genuine = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, posture())))!;
    const attacker = makeFakeKms('arn:aws:kms:us-east-1:999999999999:key/attacker');
    const theirs = (await signPayloadDigest(DIGEST, ORG, depsOf(attacker.ops, posture())))!;
    const forged: PayloadSignatureEnvelope = {
      ...theirs,
      keyId: keys.k2026.keyArn,
      publicKeySha256: genuine.publicKeySha256, // a public fact, so an attacker has it
    };
    expect(await verifyPayloadSignature(DIGEST, ORG, forged, depsOf(ops, posture()))).toBe('failed');
  });

  it('a retained key never signs: signing after rotation uses only the current key', async () => {
    const { ops, keys, state } = rotatingKms();
    state.aliasTo = 'k2027';
    const env = (await signPayloadDigest(DIGEST, ORG, depsOf(ops, posture([keys.k2026.keyArn]))))!;
    expect(env.keyId).not.toBe(keys.k2026.keyArn);
  });
});
