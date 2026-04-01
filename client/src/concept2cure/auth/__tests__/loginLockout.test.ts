import {
  computeFailedLoginState,
  getLockoutRemainingSeconds,
  LOGIN_LOCKOUT_MS,
  LOGIN_LOCKOUT_THRESHOLD,
} from '../loginLockout';

describe('loginLockout', () => {
  it('increments failed attempts without lockout before threshold', () => {
    const next = computeFailedLoginState(LOGIN_LOCKOUT_THRESHOLD - 2, 1000);
    expect(next.failedAttempts).toBe(LOGIN_LOCKOUT_THRESHOLD - 1);
    expect(next.lockedUntil).toBeNull();
  });

  it('locks sign-in when threshold is reached', () => {
    const next = computeFailedLoginState(LOGIN_LOCKOUT_THRESHOLD - 1, 2000);
    expect(next.failedAttempts).toBe(LOGIN_LOCKOUT_THRESHOLD);
    expect(next.lockedUntil).toBe(2000 + LOGIN_LOCKOUT_MS);
  });

  it('computes remaining lockout seconds safely', () => {
    expect(getLockoutRemainingSeconds(null, 1000)).toBe(0);
    expect(getLockoutRemainingSeconds(4000, 1000)).toBe(3);
    expect(getLockoutRemainingSeconds(900, 1000)).toBe(0);
  });
});
