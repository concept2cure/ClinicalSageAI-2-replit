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
import { afterEach, describe, it, expect, vi } from 'vitest';
import { reverifySigner, verifySignerPassword, type ReverifySignerDeps } from '../reverify-signer';

const USER = 7;

function deps(over: Partial<ReverifySignerDeps> = {}): ReverifySignerDeps {
  return {
    loadPasswordHash: async () => '$2a$10$storedhash',
    comparePassword: async () => true,
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => true,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
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

describe("the account's allowance (F-27): the sign-in's lockout", () => {
  it('refuses a locked account before comparing anything, and counts nothing', async () => {
    const compare = vi.fn(async () => true);
    const counted = vi.fn(async () => {});
    const r = await reverifySigner(
      USER,
      { password: 'right' },
      deps({ isAccountLocked: async () => true, comparePassword: compare, recordFailedAttempt: counted }),
    );
    expect(r).toMatchObject({ ok: false, status: 423, code: 'ACCOUNT_LOCKED' });
    expect(compare).not.toHaveBeenCalled();
    expect(counted).not.toHaveBeenCalled();
  });

  it('refuses when the lockout cannot be read, rather than signing unmetered', async () => {
    const r = await reverifySigner(
      USER,
      { password: 'right' },
      deps({ isAccountLocked: async () => { throw new Error('users unreadable'); } }),
    );
    expect(r).toMatchObject({ ok: false, status: 401, code: 'ACCOUNT_STATE_UNKNOWN' });
  });

  it('counts a wrong password', async () => {
    const counted = vi.fn(async () => {});
    await reverifySigner(USER, { password: 'wrong' }, deps({ comparePassword: async () => false, recordFailedAttempt: counted }));
    expect(counted).toHaveBeenCalledWith(USER);
  });

  it('counts a wrong code once the password is right', async () => {
    const counted = vi.fn(async () => {});
    const r = await reverifySigner(
      USER,
      { password: 'p', mfaToken: '123456' },
      deps({ isMfaEnabled: async () => true, verifyMfaToken: async () => false, recordFailedAttempt: counted }),
    );
    expect(r).toMatchObject({ ok: false, code: 'MFA_VERIFICATION_FAILED' });
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it('does not count a missing or malformed factor: nothing was guessed', async () => {
    const counted = vi.fn(async () => {});
    await reverifySigner(USER, {}, deps({ recordFailedAttempt: counted }));
    await reverifySigner(USER, { password: 'p', mfaToken: '12' }, deps({ isMfaEnabled: async () => true, recordFailedAttempt: counted }));
    expect(counted).not.toHaveBeenCalled();
  });

  it('does not count a signature that verifies', async () => {
    const counted = vi.fn(async () => {});
    const r = await reverifySigner(USER, { password: 'p' }, deps({ recordFailedAttempt: counted }));
    expect(r).toMatchObject({ ok: true });
    expect(counted).not.toHaveBeenCalled();
  });

  it('still refuses when the failure cannot be counted', async () => {
    const r = await reverifySigner(
      USER,
      { password: 'wrong' },
      deps({ comparePassword: async () => false, recordFailedAttempt: async () => { throw new Error('write refused'); } }),
    );
    expect(r).toMatchObject({ ok: false, code: 'PASSWORD_VERIFICATION_FAILED' });
  });
});

describe("the account's standing (F-28): a suspended or deprovisioned account cannot sign", () => {
  it('refuses an account that is not active before comparing anything, and counts nothing', async () => {
    const compare = vi.fn(async () => true);
    const counted = vi.fn(async () => {});
    const r = await reverifySigner(
      USER,
      { password: 'right', mfaToken: '123456' },
      deps({ isAccountActive: async () => false, comparePassword: compare, recordFailedAttempt: counted }),
    );
    expect(r, 'an account that is not active signed').toMatchObject({ ok: false, status: 401, code: 'ACCOUNT_INACTIVE' });
    expect(compare).not.toHaveBeenCalled();
    expect(counted).not.toHaveBeenCalled();
  });

  it("refuses when the account's standing cannot be read, rather than assuming it is active", async () => {
    const r = await reverifySigner(
      USER,
      { password: 'right' },
      deps({ isAccountActive: async () => { throw new Error('users unreadable'); } }),
    );
    expect(r).toMatchObject({ ok: false, status: 401, code: 'ACCOUNT_STATE_UNKNOWN' });
  });

  it("the signing dialog's password check refuses it too: it is the same first factor", async () => {
    const compare = vi.fn(async () => true);
    const r = await verifySignerPassword(USER, 'right', deps({ isAccountActive: async () => false, comparePassword: compare }));
    expect(r).toMatchObject({ ok: false, status: 401, code: 'ACCOUNT_INACTIVE' });
    expect(compare).not.toHaveBeenCalled();
  });

  it('a request without a password is still a request without a password', async () => {
    const r = await reverifySigner(USER, {}, deps({ isAccountActive: async () => false }));
    expect(r).toMatchObject({ ok: false, status: 400, code: 'PASSWORD_REQUIRED' });
  });
});

/**
 * ADR-0014 §4 (P1-2b), enforced from P-25 (2026-10-08): in production, anyone
 * applying a governed electronic signature uses an authenticator app. This is
 * the one place every signing ceremony re-verifies its signer, so it is the one
 * place the rule lives. "Production" is NODE_ENV=production, read at each
 * signature, as the platform's other production-only rules read it.
 */
describe('in production a signer needs an enrolled authenticator (ADR-0014 P1-2b)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses a signer with none, in those words, after the password and before anything else', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const code = vi.fn(async () => true);
    const counted = vi.fn(async () => {});
    const r = await reverifySigner(
      USER,
      { password: 'right' },
      deps({ isMfaEnabled: async () => false, verifyMfaToken: code, recordFailedAttempt: counted }),
    );
    expect(r).toEqual({
      ok: false,
      status: 403,
      code: 'AUTHENTICATOR_REQUIRED',
      error: 'Enrol an authenticator in Account to sign. Nothing was signed.',
    });
    expect(code, 'no code is checked for a signer who has no authenticator').not.toHaveBeenCalled();
    expect(counted, 'a missing enrolment is not a guess, and is not counted').not.toHaveBeenCalled();
  });

  it('a code sent anyway does not stand in for an enrolment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await reverifySigner(USER, { password: 'right', mfaToken: '123456' }, deps({ isMfaEnabled: async () => false }));
    expect(r).toMatchObject({ ok: false, code: 'AUTHENTICATOR_REQUIRED' });
  });

  it('a wrong password is refused as a wrong password: the enrolment is not disclosed before the password is proven', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const counted = vi.fn(async () => {});
    const r = await reverifySigner(
      USER,
      { password: 'wrong' },
      deps({ isMfaEnabled: async () => false, comparePassword: async () => false, recordFailedAttempt: counted }),
    );
    expect(r).toMatchObject({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED' });
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it('a signer with an authenticator goes on to the code check', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const enrolled = deps({ isMfaEnabled: async () => true });
    expect(await reverifySigner(USER, { password: 'right' }, enrolled)).toMatchObject({ ok: false, status: 400, code: 'MFA_TOKEN_REQUIRED' });
    expect(await reverifySigner(USER, { password: 'right', mfaToken: '123456' }, enrolled)).toEqual({
      ok: true,
      authenticationMethod: 'password+mfa',
      secondFactorVerified: true,
    });
  });

  it('an enrolment that cannot be read is still refused as unknown, not as missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await reverifySigner(
      USER,
      { password: 'right' },
      deps({ isMfaEnabled: async () => { throw new Error('users unreadable'); } }),
    );
    expect(r).toMatchObject({ ok: false, status: 401, code: 'MFA_STATE_UNKNOWN' });
  });

  it('only a declared development or test environment relaxes it: the password alone signs there', async () => {
    for (const env of ['development', 'test', ' Test ']) {
      vi.stubEnv('NODE_ENV', env);
      const r = await reverifySigner(USER, { password: 'right' }, deps({ isMfaEnabled: async () => false }));
      expect(r, `NODE_ENV=${JSON.stringify(env)}`).toEqual({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
    }
  });

  it('fails closed: staging, a blank or unrecognised NODE_ENV, and an unset one all enforce it (as the bundle guard does)', async () => {
    for (const env of ['staging', '', '   ', 'prod', 'Production']) {
      vi.stubEnv('NODE_ENV', env);
      const r = await reverifySigner(USER, { password: 'right' }, deps({ isMfaEnabled: async () => false }));
      expect(r, `NODE_ENV=${JSON.stringify(env)}`).toMatchObject({ ok: false, status: 403, code: 'AUTHENTICATOR_REQUIRED' });
    }
    const saved = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const r = await reverifySigner(USER, { password: 'right' }, deps({ isMfaEnabled: async () => false }));
      expect(r, 'NODE_ENV unset').toMatchObject({ ok: false, status: 403, code: 'AUTHENTICATOR_REQUIRED' });
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved;
    }
  });
});
