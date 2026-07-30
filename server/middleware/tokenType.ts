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
 *
 * ALLOW-LIST, not deny-list: any token that carries an explicit `type` claim
 * other than `access` is rejected — including type values this code has never
 * heard of (`password_reset`, `invite`, …). A token class must be positively
 * recognized as an access token to pass; previously only the three known
 * non-access classes were rejected, so an unknown explicit type authenticated.
 *
 * A token with NO `type` claim is still tolerated here for surfaces whose
 * token population may predate typed issuance (collab/socket/authoring).
 * HTTP API middlewares must use `requireAccessTokenReason` below, which also
 * rejects the absent-type case.
 */
export function nonAccessTokenReason(decoded: TokenClassClaims): string | null {
  if (decoded.mfaPending === true) return 'mfa_partial_token';
  if (decoded.role === 'pending_mfa') return 'mfa_pending_role';
  const type = typeof decoded.type === 'string' ? decoded.type.toLowerCase() : null;
  if (type !== null && type !== 'access') {
    return type;
  }
  return null;
}

/**
 * Strict access-token requirement for the normal API authentication path:
 * the token must carry an explicit `type: 'access'` claim. "Reject known bad
 * token classes" is not a fail-closed identity rule — the expected class must
 * be positively asserted. All first-party issuers stamp `type: 'access'` on
 * access tokens; a token without the claim is treated as unclassified and
 * refused. Returns a reason string when the token must be rejected, or null
 * when it is an acceptable access token.
 */
export function requireAccessTokenReason(decoded: TokenClassClaims): string | null {
  const nonAccess = nonAccessTokenReason(decoded);
  if (nonAccess) return nonAccess;
  const type = typeof decoded.type === 'string' ? decoded.type.toLowerCase() : null;
  if (type !== 'access') return 'missing_token_type';
  return null;
}
