/**
 * AWS KMS asymmetric signer — the `kms` arm of CONCEPT2CURE_SIGNER_MODE.
 *
 * The private key lives in KMS (FIPS 140-2 validated HSM boundary,
 * docs/SOP_KEY_MANAGEMENT.md §3–4) and is never exported. This module holds the
 * ONE place that talks to it. Everything above it (payload-signer.ts, the
 * sign-payload-seal seam) sees only `KmsOps`: sign a digest, verify a
 * signature, fetch the public key. That interface is what tests inject — an
 * in-memory KMS built on node:crypto — so the whole signing and verification
 * path runs without AWS credentials, and the SDK adapter below is the only code
 * that a live account exercises.
 *
 * Why an adapter over the SDK rather than the SDK directly: the SDK's command
 * classes are the contract AWS publishes, so `kmsOpsFromSdk` is tested against
 * the REAL `SignCommand` / `VerifyCommand` / `GetPublicKeyCommand` classes with a
 * fake `send`. That pins the exact input shape (KeyId, Message, MessageType:
 * 'DIGEST', SigningAlgorithm) a live KMS will receive, without a network.
 *
 * Fail closed everywhere: an SDK that is missing, a KMS call that throws, a
 * response without a signature — each is a thrown KmsSignerError, never a null
 * signature that a caller could mistake for "unsigned by design".
 *
 * @module server/services/signature/kms-signer
 */

import type { KmsSigningAlgorithm } from './signer-mode.js';

export class KmsSignerError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(`[kms-signer] ${message}`);
    this.name = 'KmsSignerError';
  }
}

/** A SHA-256 digest handed to KMS with MessageType 'DIGEST'. */
export interface KmsSignInput {
  keyId: string;
  /** Raw 32-byte SHA-256 digest of the canonical input. */
  digest: Uint8Array;
  signingAlgorithm: KmsSigningAlgorithm;
}

export interface KmsSignOutput {
  signature: Uint8Array;
  /** The key ARN KMS resolved the request to (aliases resolve to an ARN). */
  keyId: string;
  signingAlgorithm: KmsSigningAlgorithm;
}

export interface KmsVerifyInput extends KmsSignInput {
  signature: Uint8Array;
}

export interface KmsPublicKey {
  keyId: string;
  /** DER-encoded SubjectPublicKeyInfo, exactly as KMS returns it. */
  spkiDer: Uint8Array;
  keySpec?: string;
  signingAlgorithms?: string[];
}

/** The three KMS operations the signer needs. Injected; never reached for directly. */
export interface KmsOps {
  sign(input: KmsSignInput): Promise<KmsSignOutput>;
  verify(input: KmsVerifyInput): Promise<{ signatureValid: boolean; keyId: string }>;
  getPublicKey(keyId: string): Promise<KmsPublicKey>;
}

/** The subset of @aws-sdk/client-kms this adapter needs. Structural, so tests can pass the real module. */
export interface KmsSdkLike {
  SignCommand: new (input: Record<string, unknown>) => unknown;
  VerifyCommand: new (input: Record<string, unknown>) => unknown;
  GetPublicKeyCommand: new (input: Record<string, unknown>) => unknown;
}

export interface KmsClientLike {
  send(command: unknown): Promise<Record<string, unknown> | undefined>;
}

function bytes(value: unknown, what: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new KmsSignerError(`KMS returned no ${what}`);
}

/**
 * Wrap an SDK client + module as KmsOps. Pure mapping; every KMS failure is
 * rethrown as KmsSignerError with the original error as `cause`.
 */
export function kmsOpsFromSdk(client: KmsClientLike, sdk: KmsSdkLike): KmsOps {
  const send = async (command: unknown, op: string): Promise<Record<string, unknown>> => {
    let out: Record<string, unknown> | undefined;
    try {
      out = await client.send(command);
    } catch (err) {
      throw new KmsSignerError(`${op} failed: ${err instanceof Error ? err.message : String(err)}`, err);
    }
    if (!out || typeof out !== 'object') throw new KmsSignerError(`${op} returned no response`);
    return out;
  };

  return {
    async sign(input) {
      const out = await send(
        new sdk.SignCommand({
          KeyId: input.keyId,
          Message: input.digest,
          MessageType: 'DIGEST',
          SigningAlgorithm: input.signingAlgorithm,
        }),
        'Sign',
      );
      return {
        signature: bytes(out.Signature, 'Signature'),
        keyId: typeof out.KeyId === 'string' && out.KeyId ? out.KeyId : input.keyId,
        signingAlgorithm:
          (typeof out.SigningAlgorithm === 'string' ? out.SigningAlgorithm : input.signingAlgorithm) as KmsSigningAlgorithm,
      };
    },
    async verify(input) {
      const out = await send(
        new sdk.VerifyCommand({
          KeyId: input.keyId,
          Message: input.digest,
          MessageType: 'DIGEST',
          Signature: input.signature,
          SigningAlgorithm: input.signingAlgorithm,
        }),
        'Verify',
      );
      return {
        signatureValid: out.SignatureValid === true,
        keyId: typeof out.KeyId === 'string' && out.KeyId ? out.KeyId : input.keyId,
      };
    },
    async getPublicKey(keyId) {
      const out = await send(new sdk.GetPublicKeyCommand({ KeyId: keyId }), 'GetPublicKey');
      return {
        keyId: typeof out.KeyId === 'string' && out.KeyId ? out.KeyId : keyId,
        spkiDer: bytes(out.PublicKey, 'PublicKey'),
        keySpec: typeof out.KeySpec === 'string' ? out.KeySpec : undefined,
        signingAlgorithms: Array.isArray(out.SigningAlgorithms) ? (out.SigningAlgorithms as string[]) : undefined,
      };
    },
  };
}

/**
 * Load the real SDK and build KmsOps for `region`. Credentials come from the
 * default AWS provider chain (task role, instance profile, env) — nothing in
 * this codebase holds an AWS secret. The dynamic import keeps the SDK out of
 * every process that never runs in kms mode.
 *
 * UNEXECUTED AGAINST A LIVE ACCOUNT as of 2026-09-20: the development
 * environment holds no AWS credentials. docs/evidence/W3b/2026-09-20/README.md
 * records this; the live path is the founder's IQ step.
 */
export async function loadDefaultKmsOps(region: string): Promise<KmsOps> {
  let sdk: typeof import('@aws-sdk/client-kms');
  try {
    sdk = await import('@aws-sdk/client-kms');
  } catch (err) {
    throw new KmsSignerError(
      '@aws-sdk/client-kms is not installed; CONCEPT2CURE_SIGNER_MODE=kms cannot sign (see docs/security/DEPENDENCIES.md)',
      err,
    );
  }
  const client = new sdk.KMSClient({ region });
  return kmsOpsFromSdk(client as unknown as KmsClientLike, sdk as unknown as KmsSdkLike);
}
