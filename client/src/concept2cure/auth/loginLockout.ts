export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_MS = 30_000;

export const getLockoutRemainingSeconds = (lockedUntil: number | null, now: number = Date.now()): number => {
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((lockedUntil - now) / 1000));
};

export const computeFailedLoginState = (
  failedAttempts: number,
  now: number = Date.now()
): { failedAttempts: number; lockedUntil: number | null } => {
  const nextFailedAttempts = failedAttempts + 1;
  if (nextFailedAttempts >= LOGIN_LOCKOUT_THRESHOLD) {
    return { failedAttempts: nextFailedAttempts, lockedUntil: now + LOGIN_LOCKOUT_MS };
  }
  return { failedAttempts: nextFailedAttempts, lockedUntil: null };
};
