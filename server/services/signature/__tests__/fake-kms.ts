/**
 * An in-memory KMS for tests: a real RSA-2048 key pair from node:crypto behind
 * the two surfaces the signer can be handed — `KmsOps` directly, and an
 * SDK-shaped `{ send }` client that understands the REAL @aws-sdk/client-kms
 * command classes. No AWS credentials, no network.
 *
 * KMS signs a DIGEST (MessageType 'DIGEST'): for RSASSA_PKCS1_V1_5_SHA_256 that
 * is RSA over the EMSA-PKCS1-v1_5 encoding of DigestInfo(SHA-256) || digest,
 * which is byte-identical to what `crypto.verify('sha256', message, …)` checks
 * for the original message. The offline verifier therefore accepts the fake's
 * signatures exactly as it would a live KMS's.
 */
import { constants as C, generateKeyPairSync, privateEncrypt, publicDecrypt } from 'crypto';
import { GetPublicKeyCommand, SignCommand, VerifyCommand } from '@aws-sdk/client-kms';
import type { KmsClientLike, KmsOps } from '../kms-signer';
import type { KmsSigningAlgorithm } from '../signer-mode';

export interface FakeKms {
  ops: KmsOps;
  client: KmsClientLike;
  /** The key ARN the fake resolves every alias/id to. */
  keyArn: string;
  spkiDer: Buffer;
  /** Every SDK command the client received. */
  sent: unknown[];
  /** Flip to make every KMS call fail (network down / key disabled). */
  failing: boolean;
}

const DIGEST_INFO_SHA256 = Buffer.from('3031300d060960864801650304020105000420', 'hex');

export function makeFakeKms(keyArn = 'arn:aws:kms:us-east-1:000000000000:key/fake-0001'): FakeKms {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;

  const signDigest = (digest: Uint8Array, alg: KmsSigningAlgorithm): Buffer => {
    if (alg !== 'RSASSA_PKCS1_V1_5_SHA_256') {
      throw new Error(`fake KMS: ${alg} is not emulated; use RSASSA_PKCS1_V1_5_SHA_256`);
    }
    const em = Buffer.concat([DIGEST_INFO_SHA256, Buffer.from(digest)]);
    return privateEncrypt({ key: privateKey, padding: C.RSA_PKCS1_PADDING }, em);
  };
  const verifyDigest = (digest: Uint8Array, sig: Uint8Array, alg: KmsSigningAlgorithm): boolean => {
    if (alg !== 'RSASSA_PKCS1_V1_5_SHA_256') return false;
    try {
      const em = Buffer.concat([DIGEST_INFO_SHA256, Buffer.from(digest)]);
      return publicDecrypt({ key: publicKey, padding: C.RSA_PKCS1_PADDING }, Buffer.from(sig)).equals(em);
    } catch {
      return false;
    }
  };

  const fake: FakeKms = {
    keyArn,
    spkiDer,
    sent: [],
    failing: false,
    ops: {
      async sign(input) {
        if (fake.failing) throw new Error('fake KMS unavailable');
        return { signature: signDigest(input.digest, input.signingAlgorithm), keyId: keyArn, signingAlgorithm: input.signingAlgorithm };
      },
      async verify(input) {
        if (fake.failing) throw new Error('fake KMS unavailable');
        return { signatureValid: verifyDigest(input.digest, input.signature, input.signingAlgorithm), keyId: keyArn };
      },
      async getPublicKey() {
        if (fake.failing) throw new Error('fake KMS unavailable');
        return { keyId: keyArn, spkiDer, keySpec: 'RSA_2048', signingAlgorithms: ['RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PSS_SHA_256'] };
      },
    },
    client: {
      async send(command: unknown) {
        fake.sent.push(command);
        if (fake.failing) throw new Error('fake KMS unavailable');
        if (command instanceof SignCommand) {
          const i = command.input;
          if (i.MessageType !== 'DIGEST') throw new Error('fake KMS: expected MessageType DIGEST');
          const out = await fake.ops.sign({
            keyId: String(i.KeyId),
            digest: i.Message as Uint8Array,
            signingAlgorithm: i.SigningAlgorithm as KmsSigningAlgorithm,
          });
          return { Signature: out.signature, KeyId: keyArn, SigningAlgorithm: i.SigningAlgorithm };
        }
        if (command instanceof VerifyCommand) {
          const i = command.input;
          const out = await fake.ops.verify({
            keyId: String(i.KeyId),
            digest: i.Message as Uint8Array,
            signature: i.Signature as Uint8Array,
            signingAlgorithm: i.SigningAlgorithm as KmsSigningAlgorithm,
          });
          return { SignatureValid: out.signatureValid, KeyId: keyArn, SigningAlgorithm: i.SigningAlgorithm };
        }
        if (command instanceof GetPublicKeyCommand) {
          return { KeyId: keyArn, PublicKey: new Uint8Array(spkiDer), KeySpec: 'RSA_2048', SigningAlgorithms: ['RSASSA_PKCS1_V1_5_SHA_256'] };
        }
        throw new Error(`fake KMS: unknown command ${String((command as { constructor?: { name?: string } })?.constructor?.name)}`);
      },
    },
  };
  return fake;
}
