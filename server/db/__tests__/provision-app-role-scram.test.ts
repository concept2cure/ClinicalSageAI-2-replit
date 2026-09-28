/**
 * The SCRAM-SHA-256 verifier provision-app-role.mjs sends instead of the
 * plaintext password (log_statement=ddl would otherwise put the password in the
 * server log). Its equivalence with PostgreSQL's own computation is proven on a
 * real server in tests/db/app-role-provisioning-rds-shape.dbtest.ts.
 */
import { describe, it, expect } from 'vitest';
import { scramSha256Verifier } from '../../../scripts/db/provision-app-role.mjs';

describe('scramSha256Verifier', () => {
  // RFC 7677 §3's worked exchange: user "user", password "pencil", this salt,
  // 4096 iterations. The RFC publishes the client proof and the server
  // signature, from which both halves of the verifier are checkable.
  const SALT = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
  const AUTH_MESSAGE =
    'n=user,r=rOprNGfwEbeRWgbNEkqO,' +
    'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,' +
    'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';

  it('produces the verifier RFC 7677 implies for its test vector', async () => {
    const { createHash, createHmac } = await import('node:crypto');
    const v = scramSha256Verifier('pencil', { salt: SALT });
    const m = v.match(/^SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):(.+)$/)!;
    expect(m[1]).toBe('W22ZaJ0SNY7soEsUEjb6gQ==');
    const storedKey = Buffer.from(m[2], 'base64');
    const serverKey = Buffer.from(m[3], 'base64');
    // ServerSignature = HMAC(ServerKey, AuthMessage)
    expect(createHmac('sha256', serverKey).update(AUTH_MESSAGE).digest('base64')).toBe(
      '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=',
    );
    // ClientKey = ClientProof XOR HMAC(StoredKey, AuthMessage); StoredKey = H(ClientKey)
    const proof = Buffer.from('dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=', 'base64');
    const clientSig = createHmac('sha256', storedKey).update(AUTH_MESSAGE).digest();
    const clientKey = Buffer.from(proof.map((b, i) => b ^ clientSig[i]));
    expect(createHash('sha256').update(clientKey).digest().equals(storedKey)).toBe(true);
  });

  it('salts each verifier freshly', () => {
    expect(scramSha256Verifier('a-sufficiently-long-secret')).not.toBe(
      scramSha256Verifier('a-sufficiently-long-secret'),
    );
  });

  it('refuses a password outside printable ASCII rather than hash it unlike the server', () => {
    expect(() => scramSha256Verifier('pässwörd-long-enough')).toThrow(/printable ASCII/);
  });
});
