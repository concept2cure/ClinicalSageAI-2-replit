/**
 * Password setup tokens — the ONE way a user who cannot present a password
 * proves they own an email address and sets one.
 *
 * Two flows mint these tokens and they must stay interchangeable, because the
 * same client page (/concept2cure/password-reset?token=…) and the same server
 * handler (POST /api/auth/reset-password) redeem both:
 *
 *   - "Forgot password" (server/routes/auth.ts) — a short-lived token mailed to
 *     an existing account.
 *   - "Invite a member" (server/routes/tenant-users.ts) — a longer-lived token
 *     for an account an org admin just created with an UNUSABLE password hash
 *     (`invite:<uuid>`, the convention SCIM and SAML provisioning already use).
 *     Until the invitee redeems it they cannot sign in.
 *
 * Only the SHA-256 of the token is stored (users.reset_token); the raw token
 * travels once, in the link. Keep the hashing here so a caller cannot store a
 * raw token by mistake.
 */
import crypto from 'crypto';

/** Forgot-password links are short-lived: the requester is at the keyboard. */
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

/** Invitations wait for someone who was not expecting them. */
export const INVITATION_TTL_MS = 21 * 24 * 60 * 60 * 1000;

export interface PasswordSetupToken {
  /** The raw token — goes into the link, never into the database. */
  token: string;
  /** What users.reset_token stores. */
  tokenHash: string;
  expiresAt: Date;
}

export function hashPasswordSetupToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function mintPasswordSetupToken(ttlMs: number, now: number = Date.now()): PasswordSetupToken {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('password setup token TTL must be a positive number of milliseconds');
  }
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashPasswordSetupToken(token), expiresAt: new Date(now + ttlMs) };
}

/** The client route that redeems a token (Concept2CureLogin reads `?token=`). */
export function passwordSetupUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/concept2cure/password-reset?token=${encodeURIComponent(token)}`;
}

/**
 * The origin links are built on. APP_URL is authoritative when set; otherwise
 * the request's own origin, which is what a single-host deployment wants.
 */
export function resolveAppBaseUrl(req: {
  protocol: string;
  get: (header: string) => string | undefined;
}): string {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

/** The password hash an invited, not-yet-activated account carries. */
export function unusableInvitePasswordHash(): string {
  return `invite:${crypto.randomUUID()}`;
}
