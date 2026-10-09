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

/** Production has no configured public origin to build an emailed link on. */
export class PublicOriginNotConfiguredError extends Error {
  readonly code = 'PUBLIC_ORIGIN_NOT_CONFIGURED';
  constructor(reason: string) {
    super(`Emailed links need APP_URL, the deployment's public https origin: ${reason}`);
    this.name = 'PublicOriginNotConfiguredError';
  }
}

/**
 * The origin emailed links are built on.
 *
 * APP_URL when set. Outside production, otherwise, the request's own origin,
 * which is what a laptop or a single-host install wants.
 *
 * In production, APP_URL or nothing: the Host header is never used. It is
 * written by whoever sends the request, and the load balancer accepts
 * connections directly, so a POST /forgot-password naming a victim's address
 * with `Host: attacker.example` emailed the victim a genuine reset token inside
 * a link to the attacker's site (password-reset poisoning; D6, 2026-09-23). The
 * same link carries an invitation's setup token. Without an https APP_URL this
 * throws, and callers must resolve it BEFORE anything that depends on whether
 * an account exists, so the refusal is the same for every address.
 */
export function resolveAppBaseUrl(
  req: { protocol: string; get: (header: string) => string | undefined },
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.APP_URL?.trim();
  if (env.NODE_ENV === 'production') {
    if (!configured) throw new PublicOriginNotConfiguredError('APP_URL is not set');
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new PublicOriginNotConfiguredError(`APP_URL is not a URL ("${configured}")`);
    }
    if (parsed.protocol !== 'https:') {
      throw new PublicOriginNotConfiguredError(`APP_URL must be https ("${configured}")`);
    }
    return configured;
  }
  return configured || `${req.protocol}://${req.get('host')}`;
}

/** The password hash an invited, not-yet-activated account carries. */
export function unusableInvitePasswordHash(): string {
  return `invite:${crypto.randomUUID()}`;
}
