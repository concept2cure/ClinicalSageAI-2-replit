/**
 * A stored secret's GCM tag is checked at its full 16 bytes (D6; Semgrep
 * gcm-no-tag-length; 2026-10-05; evidence docs/evidence/D6/2026-10-05-semgrep-red/).
 *
 * Node's createDecipheriv('aes-256-gcm') with no authTagLength accepts any tag
 * of 4 to 16 bytes and checks only that many. A ciphertext whose tag is cut to
 * its first 4 bytes decrypted, so forging a stored credential took about 2^32
 * tries instead of 2^128. Both stores below did this: organisation connector
 * and gateway credentials (credential-cipher.ts) and TOTP secrets
 * (mfaService.ts). field-encryption.ts already checked the length.
 */
import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET ??= 'gcm-tag-length-test-secret-0123456789abcdef';

/** The same "iv:tag:ciphertext" hex payload with its tag cut to `bytes`. */
function truncateTag(payload: string, bytes: number): string {
  const [iv, tag, data] = payload.split(':');
  return `${iv}:${tag.slice(0, bytes * 2)}:${data}`;
}

describe('a GCM tag shorter than 16 bytes is refused', () => {
  it('credential-cipher: a connector or gateway credential', async () => {
    const { encryptCredential, decryptCredential } = await import('../credential-cipher');
    const sealed = encryptCredential('gateway-password');
    expect(decryptCredential(sealed)).toBe('gateway-password');
    expect(() => decryptCredential(truncateTag(sealed, 4))).toThrow();
    expect(() => decryptCredential(truncateTag(sealed, 12))).toThrow();
  });

  it('mfaService: a TOTP secret', async () => {
    const { __testing } = await import('../../mfaService');
    const sealed = __testing.encrypt('JBSWY3DPEHPK3PXP');
    expect(__testing.decrypt(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => __testing.decrypt(truncateTag(sealed, 4))).toThrow();
    expect(() => __testing.decrypt(truncateTag(sealed, 12))).toThrow();
  });
});
