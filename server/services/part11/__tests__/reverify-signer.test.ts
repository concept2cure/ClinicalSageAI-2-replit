/**
 * §11.200(a)(1) re-verification policy.
 *
 * The branch that matters is the one nobody exercises: every REFUSAL. On a
 * healthy system the password matches, MFA answers, and the signature applies —
 * so a policy that quietly returned ok on an unreadable MFA service, or on a
 * signer with no stored hash, would look correct forever.
 *
 * Dependencies are injected, so every one of those states is constructible here
 * without a database.
 */
import { describe, it, expect, vi } from 'vitest';
import { reverifySigner, type ReverifySignerDeps } from '../reverify-signer';

const USER = 7;

function deps(over: Partial<ReverifySignerDeps> = {}): ReverifySignerDeps {
  return {
    loadPasswordHash: async () => '$2a$10$storedhash',
    comparePassword: async () => true,
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => true,
    warn: () => {},
    ...over,
  };
}

describe('first factor', () => {
  it('refuses when no password is supplied', async () => {
    const r = await reverifySigner(USER, {}, deps());
    expect(r).toMatchObject({ ok: false, status: 400, code: 'PASSWORD_REQUIRED' });
  });

  it('refuses an empty password rather than treating it as absent-but-fine', async () => {
    const r = await reverifySigner(USER, { password: '' }, deps());
    expect(r).toMatchObject({ ok: false, code: 'PASSWORD_REQUIRED' });
  });

  it('refuses a non-string password (a JSON object cannot be bcrypt-compared)', async () => {
    const compare = vi.fn(async () => true);
    const r = await reverifySigner(USER, { password: { $ne: null } }, deps({ comparePassword: compare }));
    expect(r).toMatchObject({ ok: false, code: 'PASSWORD_REQUIRED' });
    expect(compare).not.toHaveBeenCalled();
  });

  it('refuses when the password does not match', async () => {
    const r = await reverifySigner(USER, { password: 'wrong' }, deps({ comparePassword: async () => false }));
    expect(r).toMatchObject({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED' });
  });

  it('refuses a signer with no stored hash, and never calls compare', async () => {
    const compare = vi.fn(async () => true);
    const r = await reverifySigner(
      USER,
      { password: 'anything' },
      deps({ loadPasswordHash: async () => null, comparePassword: compare }),
    );
    expect(r).toMatchObject({ ok: false, code: 'PASSWORD_VERIFICATION_FAILED' });
    expect(compare).not.toHaveBeenCalled();
  });

  it('refuses when the comparison itself throws, rather than propagating a 500', async () => {
    const r = await reverifySigner(
      USER,
      { password: 'p' },
      deps({ comparePassword: async () => { throw new Error('bcrypt exploded'); } }),
    );
    // A thrown comparison is a failed factor, not a server error the caller has
    // to distinguish — and certainly not a pass.
    expect(r).toMatchObject({ ok: false, code: 'PASSWORD_VERIFICATION_FAILED' });
  });
});

describe('second factor', () => {
  it('accepts password alone when the signer has no MFA enrolled', async () => {
    const r = await reverifySigner(USER, { password: 'p' }, deps({ isMfaEnabled: async () => false }));
    expect(r).toEqual({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  });

  it('requires a token when MFA is enrolled', async () => {
    const r = await reverifySigner(USER, { password: 'p' }, deps({ isMfaEnabled: async () => true }));
    expect(r).toMatchObject({ ok: false, status: 400, code: 'MFA_TOKEN_REQUIRED' });
  });

  it('rejects a token that is not six digits before spending a verify call', async () => {
    const verify = vi.fn(async () => true);
    const r = await reverifySigner(
      USER,
      { password: 'p', mfaToken: '12345' },
      deps({ isMfaEnabled: async () => true, verifyMfaToken: verify }),
    );
    expect(r).toMatchObject({ ok: false, code: 'MFA_TOKEN_REQUIRED' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuses when the token does not verify', async () => {
    const r = await reverifySigner(
      USER,
      { password: 'p', mfaToken: '000000' },
      deps({ isMfaEnabled: async () => true, verifyMfaToken: async () => false }),
    );
    expect(r).toMatchObject({ ok: false, status: 401, code: 'MFA_VERIFICATION_FAILED' });
  });

  it('refuses when verification throws', async () => {
    const r = await reverifySigner(
      USER,
      { password: 'p', mfaToken: '123456' },
      deps({ isMfaEnabled: async () => true, verifyMfaToken: async () => { throw new Error('totp down'); } }),
    );
    expect(r).toMatchObject({ ok: false, code: 'MFA_VERIFICATION_FAILED' });
  });

  it('REFUSES when the MFA enrolment state cannot be read', async () => {
    // The easy-to-miss branch: an unreachable MFA service must not become a way
    // to sign with one factor. Failing open here would be invisible — the
    // signature applies, and the row says secondFactorVerified false, which is
    // indistinguishable from a signer who legitimately has no MFA.
    const r = await reverifySigner(
      USER,
      { password: 'p' },
      deps({ isMfaEnabled: async () => { throw new Error('mfa service down'); } }),
    );
    expect(r).toMatchObject({ ok: false, status: 401, code: 'MFA_STATE_UNKNOWN' });
  });

  it('accepts and reports password+mfa when both factors verify', async () => {
    const r = await reverifySigner(
      USER,
      { password: 'p', mfaToken: '123456' },
      deps({ isMfaEnabled: async () => true }),
    );
    expect(r).toEqual({ ok: true, authenticationMethod: 'password+mfa', secondFactorVerified: true });
  });
});

describe('what gets persisted is what was checked', () => {
  it('never reports a second factor that was not verified', async () => {
    const noMfa = await reverifySigner(USER, { password: 'p' }, deps({ isMfaEnabled: async () => false }));
    expect(noMfa).toMatchObject({ ok: true, secondFactorVerified: false });
    // The pre-fix artifacts route accepted `secondFactorVerified: true` from the
    // request body for exactly this signer. There is no input here that can
    // produce that value without a verified token.
  });

  it('takes no authentication claim from its caller', async () => {
    // The credentials argument has room for password and mfaToken and nothing
    // else — there is no channel for an asserted method or verification flag.
    const r = await reverifySigner(
      USER,
      { password: 'p', mfaToken: '123456', authenticationMethod: 'sso', secondFactorVerified: true } as never,
      deps({ isMfaEnabled: async () => false }),
    );
    expect(r).toEqual({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  });
});
