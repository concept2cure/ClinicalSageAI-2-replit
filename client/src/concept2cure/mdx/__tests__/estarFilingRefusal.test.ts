/**
 * The eSTAR filing's refusal sentence comes from the server's own code. The
 * governed re-authentication now requires the second factor whenever the signer
 * has one enrolled (server/routes/c2c/actions.ts verifyReauth), so the two codes
 * that rule adds must read as what they are — not fall through to the generic
 * "check the eSTAR you selected".
 */
import { describe, expect, it } from 'vitest';
import { describeFilingRefusal } from '../hooks/useEstarFiling';

describe('describeFilingRefusal — the second factor', () => {
  it('asks for the authenticator code when the server requires it', () => {
    const text = describeFilingRefusal(401, 'REAUTH_TOTP_REQUIRED');
    expect(text).toMatch(/authenticator enrolled/);
    expect(text).toMatch(/Nothing was filed and nothing was signed/);
  });

  it('says the factor could not be checked, not that the password was wrong', () => {
    const text = describeFilingRefusal(401, 'REAUTH_MFA_STATE_UNKNOWN');
    expect(text).toMatch(/second factor could not be checked/);
    expect(text).not.toMatch(/password/i);
  });

  it('keeps the existing sentences', () => {
    expect(describeFilingRefusal(401, 'REAUTH_TOTP_INVALID')).toMatch(/authenticator code was not accepted/);
    expect(describeFilingRefusal(401, 'REAUTH_PASSWORD_INVALID')).toMatch(/password was not accepted/);
  });
});
