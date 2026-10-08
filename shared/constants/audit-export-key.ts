/**
 * The key id an audit export manifest carries when it was sealed under the JWT
 * secret because no dedicated audit export key (AUDIT_EXPORT_SIGNING_KEY) was
 * configured. Only reachable outside production: a production deployment
 * refuses to seal that way (server/services/audit/auditExportKeyPosture.ts).
 *
 * Shared so the seal statement a reader sees can say which kind of key made the
 * seal from the same value the server stamps (QA 2026-10-08, j8: the screen
 * called this "a platform-held key").
 */
export const JWT_SECRET_FALLBACK_KEY_ID = 'jwt-secret-fallback';
