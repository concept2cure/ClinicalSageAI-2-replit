/**
 * Asymmetric signature over a release-signature payload digest — what the
 * `kms` signer mode writes BESIDE the HMAC seal.
 *
 * The HMAC seal (sign-payload-seal.ts) proves the server sealed a digest. It is
 * symmetric: the verifier holds the same key the sealer did, so it can also
 * forge. This envelope adds what a symmetric seal cannot — a signature only the
 * KMS key custodian could have produced, verifiable by anyone holding the
 * public key. The two are complementary and both are stored; every existing
 * verifier keeps checking the seal, and the envelope is checked on top.
 *
 * What is signed. The same canonical input the seal binds, under its own
 * domain tag: `<DOMAIN>\norg:<id>\ndigest:<payloadDigest>`. SHA-256 of that
 * string is sent to KMS as MessageType DIGEST. An inspector can reproduce the
 * digest from the envelope's `signedInput` and verify with the published public
 * key and openssl alone — no KMS, no server.
 *
 * Verdict semantics mirror the seal so callers reason about them identically:
 *   'unsigned' → no envelope stored (caller decides whether that is allowed
 *                under the current posture — it is not, in kms mode).
 *   'ok'       → envelope present and verified.
 *   'failed'   → present but does not verify, malformed, signed under a
 *                different key/algorithm than the posture expects, or the
 *                verifier itself is unavailable (fail closed).
 *
 * @module server/services/signature/payload-signer
 */

import { createHash, createPublicKey, verify as cryptoVerify, constants as cryptoConstants, timingSafeEqual } from 'crypto';
import type { KmsOps } from './kms-signer.js';
import {
  DEFAULT_KMS_SIGNING_ALGORITHM,
  KMS_SIGNING_ALGORITHMS,
  type KmsSigningAlgorithm,
  type SignerPosture,
} from './signer-mode.js';

/** Domain-separation tag. Distinct from the seal's so the two can never be confused. */
export const PAYLOAD_SIGNATURE_DOMAIN = 'ectd.release-signature.payload-digest.kms.v1';

export interface PayloadSignatureEnvelope {
  /** Envelope schema version. */
  v: 1;
  mode: 'kms';
  /** KMS signing algorithm the signature was produced with. */
  algorithm: KmsSigningAlgorithm;
  /** The key ARN KMS resolved the request to. */
  keyId: string;
  /** Base64 signature bytes. */
  signature: string;
  /** Hash applied to `signedInput` before signing. */
  digestAlgorithm: 'sha256';
  /** The exact canonical string that was hashed and signed. */
  signedInput: string;
  /** sha256 hex of the DER SubjectPublicKeyInfo, so an offline verifier can confirm it holds the right key. */
  publicKeySha256: string;
  /** ISO timestamp of the KMS Sign call (informational; not part of the signed bytes). */
  signedAt: string;
}

export type PayloadSignatureVerdict = 'unsigned' | 'ok' | 'failed';

export function canonicalPayloadSignatureInput(payloadDigest: string, organizationId: number): string {
  return [PAYLOAD_SIGNATURE_DOMAIN, `org:${organizationId}`, `digest:${payloadDigest}`].join('\n');
}

export function digestOfSignedInput(signedInput: string): Buffer {
  return createHash('sha256').update(signedInput, 'utf8').digest();
}

export function publicKeyFingerprint(spkiDer: Uint8Array): string {
  return createHash('sha256').update(spkiDer).digest('hex');
}

export interface PayloadSignerDeps {
  posture: SignerPosture;
  /** Resolves the KMS operations. Only called in kms mode. */
  kms: () => Promise<KmsOps>;
  now?: () => Date;
}

/**
 * Sign a payload digest. Returns null when the posture is not `kms` — the seal
 * alone is the record then. In kms mode every failure THROWS (a release must
 * not proceed with a seal and no signature when a signature was promised).
 */
export async function signPayloadDigest(
  payloadDigest: string,
  organizationId: number,
  deps: PayloadSignerDeps,
): Promise<PayloadSignatureEnvelope | null> {
  const { posture } = deps;
  if (posture.mode !== 'kms' || !posture.kms) return null;
  if (!/^[0-9a-f]{64}$/.test(payloadDigest)) {
    throw new Error(`[payload-signer] refusing to sign a malformed payload digest (${payloadDigest.length} chars)`);
  }
  const kms = await deps.kms();
  const signedInput = canonicalPayloadSignatureInput(payloadDigest, organizationId);
  const digest = digestOfSignedInput(signedInput);
  const [signed, pub] = await Promise.all([
    kms.sign({ keyId: posture.kms.keyId, digest, signingAlgorithm: posture.kms.signingAlgorithm }),
    kms.getPublicKey(posture.kms.keyId),
  ]);
  return {
    v: 1,
    mode: 'kms',
    algorithm: signed.signingAlgorithm,
    keyId: signed.keyId,
    signature: Buffer.from(signed.signature).toString('base64'),
    digestAlgorithm: 'sha256',
    signedInput,
    publicKeySha256: publicKeyFingerprint(pub.spkiDer),
    signedAt: (deps.now ?? (() => new Date()))().toISOString(),
  };
}

/** Structural check of a stored envelope. Anything off → not an envelope (verdict 'failed'). */
export function isPayloadSignatureEnvelope(value: unknown): value is PayloadSignatureEnvelope {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    e.v === 1 &&
    e.mode === 'kms' &&
    typeof e.algorithm === 'string' &&
    (KMS_SIGNING_ALGORITHMS as readonly string[]).includes(e.algorithm) &&
    typeof e.keyId === 'string' &&
    e.keyId.length > 0 &&
    typeof e.signature === 'string' &&
    e.signature.length > 0 &&
    e.digestAlgorithm === 'sha256' &&
    typeof e.signedInput === 'string' &&
    typeof e.publicKeySha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(e.publicKeySha256)
  );
}

function expectedInputMatches(envelope: PayloadSignatureEnvelope, payloadDigest: string, organizationId: number): boolean {
  const expected = Buffer.from(canonicalPayloadSignatureInput(payloadDigest, organizationId), 'utf8');
  const stored = Buffer.from(envelope.signedInput, 'utf8');
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}

/**
 * Verify an envelope against the KMS Verify API — the authoritative path, and
 * the one the SOP names (docs/SOP_KEY_MANAGEMENT.md §7). The envelope's
 * `signedInput` is NOT trusted: the canonical input is rebuilt from the
 * (digest, org) the caller holds and must equal the stored one byte for byte,
 * so an envelope lifted from another run/org fails before KMS is asked.
 */
export async function verifyPayloadSignature(
  payloadDigest: string,
  organizationId: number,
  envelope: unknown,
  deps: PayloadSignerDeps,
): Promise<PayloadSignatureVerdict> {
  if (envelope === undefined || envelope === null) return 'unsigned';
  if (!isPayloadSignatureEnvelope(envelope)) return 'failed';
  if (!expectedInputMatches(envelope, payloadDigest, organizationId)) return 'failed';
  const { posture } = deps;
  if (posture.mode !== 'kms' || !posture.kms) {
    // A signature exists but this process has no signer to verify it with —
    // the control was on and is now unverifiable. Refuse, as the seal does.
    return 'failed';
  }
  if (envelope.algorithm !== posture.kms.signingAlgorithm) return 'failed';
  try {
    const kms = await deps.kms();
    // Verify against the key the POSTURE names, not the key the envelope
    // names: an attacker who can rewrite the envelope can also point it at a
    // key they control. The envelope's keyId is recorded for inspection only.
    const result = await kms.verify({
      keyId: posture.kms.keyId,
      digest: digestOfSignedInput(envelope.signedInput),
      signingAlgorithm: envelope.algorithm,
      signature: Buffer.from(envelope.signature, 'base64'),
    });
    return result.signatureValid ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Offline verification with a published public key (DER SPKI) — for an
 * inspector, the ops verifier, or a disaster-recovery check with no KMS.
 * Pure node:crypto; no network. The public key's fingerprint must match the
 * envelope's, so a verifier cannot be handed the wrong key silently.
 */
export function verifyPayloadSignatureOffline(
  payloadDigest: string,
  organizationId: number,
  envelope: unknown,
  publicKeySpkiDer: Uint8Array,
): PayloadSignatureVerdict {
  if (envelope === undefined || envelope === null) return 'unsigned';
  if (!isPayloadSignatureEnvelope(envelope)) return 'failed';
  if (!expectedInputMatches(envelope, payloadDigest, organizationId)) return 'failed';
  if (publicKeyFingerprint(publicKeySpkiDer) !== envelope.publicKeySha256) return 'failed';
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeySpkiDer), format: 'der', type: 'spki' });
    const padding =
      envelope.algorithm === 'RSASSA_PSS_SHA_256' ? cryptoConstants.RSA_PKCS1_PSS_PADDING : cryptoConstants.RSA_PKCS1_PADDING;
    const ok = cryptoVerify(
      'sha256',
      Buffer.from(envelope.signedInput, 'utf8'),
      { key, padding, ...(envelope.algorithm === 'RSASSA_PSS_SHA_256' ? { saltLength: 32 } : {}) },
      Buffer.from(envelope.signature, 'base64'),
    );
    return ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

export { DEFAULT_KMS_SIGNING_ALGORITHM };
