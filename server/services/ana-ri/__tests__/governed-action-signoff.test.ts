/**
 * Tests for verifySignerCredentials — the fail-closed Part 11 §11.200
 * re-authentication used by the governed-action route. Deps are injected, so
 * no bcrypt / MFA / DB is involved.
 */

import { describe, it, expect } from 'vitest';
import {
  verifySignerCredentials,
  type SignoffVerificationDeps,
} from '../governed-action-signoff.js';

function deps(over: Partial<SignoffVerificationDeps> = {}): SignoffVerificationDeps {
  return {
    loadPasswordHash: async () => 'hash',
    comparePassword: async () => true,
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => true,
    ...over,
  };
}

describe('verifySignerCredentials', () => {
  it('verifies password-only when MFA is disabled', async () => {
    const r = await verifySignerCredentials(deps(), { userId: 1, password: 'pw' });
    expect(r.verified).toBe(true);
    expect(r.secondFactorVerified).toBe(false);
  });

  it('requires a password', async () => {
    const r = await verifySignerCredentials(deps(), { userId: 1, password: '' });
    expect(r.verified).toBe(false);
    expect(r.code).toBe('PASSWORD_REQUIRED');
  });

  it('rejects a wrong password', async () => {
    const r = await verifySignerCredentials(deps({ comparePassword: async () => false }), { userId: 1, password: 'bad' });
    expect(r.code).toBe('PASSWORD_INVALID');
  });

  it('fails closed when the password hash is missing', async () => {
    const r = await verifySignerCredentials(deps({ loadPasswordHash: async () => null }), { userId: 1, password: 'pw' });
    expect(r.verified).toBe(false);
    expect(r.code).toBe('PASSWORD_INVALID');
  });

  it('fails closed when MFA state cannot be determined', async () => {
    const r = await verifySignerCredentials(
      deps({ isMfaEnabled: async () => { throw new Error('db down'); } }),
      { userId: 1, password: 'pw' }
    );
    expect(r.verified).toBe(false);
    expect(r.code).toBe('MFA_STATE_UNKNOWN');
  });

  it('requires a well-formed MFA token when MFA is enabled', async () => {
    const r = await verifySignerCredentials(deps({ isMfaEnabled: async () => true }), { userId: 1, password: 'pw' });
    expect(r.code).toBe('MFA_TOKEN_REQUIRED');
    const bad = await verifySignerCredentials(deps({ isMfaEnabled: async () => true }), { userId: 1, password: 'pw', mfaToken: '12' });
    expect(bad.code).toBe('MFA_TOKEN_REQUIRED');
  });

  it('rejects an invalid MFA token', async () => {
    const r = await verifySignerCredentials(
      deps({ isMfaEnabled: async () => true, verifyMfaToken: async () => false }),
      { userId: 1, password: 'pw', mfaToken: '000000' }
    );
    expect(r.code).toBe('MFA_TOKEN_INVALID');
  });

  it('verifies both factors when MFA is enabled and the token is valid', async () => {
    const r = await verifySignerCredentials(
      deps({ isMfaEnabled: async () => true, verifyMfaToken: async () => true }),
      { userId: 1, password: 'pw', mfaToken: '123456' }
    );
    expect(r.verified).toBe(true);
    expect(r.secondFactorVerified).toBe(true);
  });
});
