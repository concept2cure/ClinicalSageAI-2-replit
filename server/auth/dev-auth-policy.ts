/**
 * Dev-auth policy gate.
 *
 * Centralizes the rule for when dev-only authentication shortcuts (MFA skip
 * on /login, /dev-login token issuance, etc.) are permitted.
 *
 * Hard rule: dev-auth shortcuts are NEVER allowed unless BOTH of the
 * following are true:
 *
 *   1. process.env.NODE_ENV === 'development'
 *   2. process.env.ALLOW_DEV_AUTH === '1'
 *
 * The second flag must be set explicitly. This means staging, beta, e2e,
 * and production environments — even ones that historically used
 * NODE_ENV !== 'production' as a "dev mode" signal — cannot enable these
 * paths by accident.
 *
 * Any new dev-auth shortcut added to the codebase MUST gate behind
 * isDevAuthAllowed(). This is enforced by scripts/ci/check-no-dev-auth-in-prod.mjs.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limit access to authorized individuals
 */

export function isDevAuthAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEV_AUTH === '1'
  );
}

export function devAuthDenialReason(): string {
  if (process.env.NODE_ENV !== 'development') {
    return `dev-auth disabled (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})`;
  }
  if (process.env.ALLOW_DEV_AUTH !== '1') {
    return 'dev-auth disabled (ALLOW_DEV_AUTH not set to "1")';
  }
  return 'dev-auth allowed';
}
