/**
 * The SDK adapter is exercised against the REAL @aws-sdk/client-kms command
 * classes with an in-memory KMS behind `send`, so the exact request shape a
 * live KMS receives is pinned without a network or a credential.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import * as sdk from '@aws-sdk/client-kms';
import { kmsOpsFromSdk, KmsSignerError } from '../kms-signer';
import { makeFakeKms } from './fake-kms';

const digest = () => createHash('sha256').update('release payload').digest();

describe('kmsOpsFromSdk', () => {
  it('sign sends SignCommand with MessageType DIGEST and returns the resolved key ARN', async () => {
    const fake = makeFakeKms();
    const ops = kmsOpsFromSdk(fake.client, sdk);
    const out = await ops.sign({ keyId: 'alias/fda-signing-key-2026', digest: digest(), signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' });
    expect(out.keyId).toBe(fake.keyArn);
    expect(out.signature.byteLength).toBe(256);
    const cmd = fake.sent[0] as sdk.SignCommand;
    expect(cmd).toBeInstanceOf(sdk.SignCommand);
    expect(cmd.input).toMatchObject({ KeyId: 'alias/fda-signing-key-2026', MessageType: 'DIGEST', SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' });
  });

  it('verify round-trips through VerifyCommand and rejects a flipped bit', async () => {
    const fake = makeFakeKms();
    const ops = kmsOpsFromSdk(fake.client, sdk);
    const d = digest();
    const { signature } = await ops.sign({ keyId: 'k', digest: d, signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' });
    expect((await ops.verify({ keyId: 'k', digest: d, signature, signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' })).signatureValid).toBe(true);
    const bad = Uint8Array.from(signature);
    bad[10] ^= 0x01;
    expect((await ops.verify({ keyId: 'k', digest: d, signature: bad, signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' })).signatureValid).toBe(false);
    expect(fake.sent[1]).toBeInstanceOf(sdk.VerifyCommand);
  });

  it('getPublicKey returns the DER SPKI KMS holds', async () => {
    const fake = makeFakeKms();
    const ops = kmsOpsFromSdk(fake.client, sdk);
    const pub = await ops.getPublicKey('k');
    expect(Buffer.from(pub.spkiDer).equals(fake.spkiDer)).toBe(true);
    expect(fake.sent[0]).toBeInstanceOf(sdk.GetPublicKeyCommand);
  });

  it('a KMS failure is a KmsSignerError, never a null signature', async () => {
    const fake = makeFakeKms();
    fake.failing = true;
    const ops = kmsOpsFromSdk(fake.client, sdk);
    await expect(ops.sign({ keyId: 'k', digest: digest(), signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' })).rejects.toBeInstanceOf(KmsSignerError);
  });

  it('a response without a signature is refused', async () => {
    const ops = kmsOpsFromSdk({ send: async () => ({ KeyId: 'k' }) }, sdk);
    await expect(ops.sign({ keyId: 'k', digest: digest(), signingAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256' })).rejects.toThrow(/no Signature/);
  });
});
