/**
 * JWT token-class discrimination.
 *
 * SECURITY: refresh tokens, MFA challenge tokens, and MFA-partial tokens are
 * signed with the same JWT secret as access tokens. The access path MUST
 * reject them explicitly, otherwise a half-authenticated (password-only)
 * session could present its short-lived token as a Bearer access credential
 * and bypass MFA. See docs/SECURITY_SWARM_AUDIT_2026-06-17.md.
 *
 * This lives in its own module (with no sibling `.js` compiled twin) so that
 * both the TypeScript and the test/runtime module resolvers agree on the same
 * file — `server/middleware/auth.ts` has a legacy `auth.js` counterpart, which
 * makes `../middleware/auth` ambiguous at runtime.
 */

/**
 * The subset of JWT claims relevant to token-class discrimination. A decoded
 * JWT payload carries many other claims (userId, email, organizationId, …) and
 * remains assignable here via structural typing — only these three fields are
 * read.
 */
export interface TokenClassClaims {
  type?: string;
  role?: string | null;
  mfaPending?: boolean;
}

/**
 * Returns a reason string when the token must be rejected on the access path
 * (i.e. it is a refresh / MFA-challenge / MFA-partial token), or null when it
 * is an acceptable access token.
 */
export function nonAccessTokenReason(decoded: TokenClassClaims): string | null {
  if (decoded.mfaPending === true) return 'mfa_partial_token';
  if (decoded.role === 'pending_mfa') return 'mfa_pending_role';
  const type = typeof decoded.type === 'string' ? decoded.type.toLowerCase() : null;
  if (type === 'refresh' || type === 'mfa_challenge' || type === 'mfa_partial') {
    return type;
  }
  return null;
}
