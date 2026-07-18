/**
 * 21 CFR Part 11 §11.10(g) signing-authority policy — single source of truth.
 *
 * A valid electronic signature requires not only identity (password + MFA,
 * §11.200) but that the signer is AUTHORIZED to sign: "use of ... controls to
 * ensure that persons who ... electronically sign records ... have the authority
 * to do so" (§11.10(g), §11.10(d)). Identity ≠ authority — a logged-in user with
 * valid credentials must still hold a signing role.
 *
 * This module centralizes which organization roles may apply a signature so
 * every signing surface (the artifact-signature route and the /api/esignature
 * route) enforces the SAME policy. The default set mirrors the policy already
 * enforced on the artifact-signature route; a deployment can override it via the
 * ESIGNATURE_SIGNING_ROLES env var (comma-separated role names).
 *
 * Pure / DB-free so it can be unit-tested directly.
 *
 * @compliance 21 CFR Part 11 §11.10(d), §11.10(g)
 */

export const DEFAULT_SIGNING_ROLES: readonly string[] = ['admin', 'approver', 'reviewer'];

/** The role allowlist in effect (env override or the default policy), normalized. */
export function signingAuthorityRoles(): string[] {
  const raw = process.env.ESIGNATURE_SIGNING_ROLES;
  const list = raw && raw.trim() ? raw.split(',') : DEFAULT_SIGNING_ROLES.slice();
  return list.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
}

/**
 * Whether a role is permitted to apply an electronic signature. Case-insensitive;
 * an empty/absent role is never authorized (fail closed).
 */
export function isSigningAuthorized(
  role: string | null | undefined,
  allowed: string[] = signingAuthorityRoles(),
): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return r.length > 0 && allowed.includes(r);
}
