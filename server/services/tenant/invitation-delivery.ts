/**
 * The invitation a newly created member receives: a password-setup token
 * stored on their account, and the link delivered by email or handed to the
 * administrator. Called by POST /api/tenant-users (server/routes/tenant-users.ts)
 * after atomicCreateUser; moved here from that route file unchanged except for
 * storeSetupToken (D3, 2026-09-28; docs/evidence/D3/2026-09-28-users-rls/).
 */
import { pool } from '../../db';
import auditService from '../auditService';
import { isEmailConfigured, sendInvitationEmail } from '../emailService';
import {
  INVITATION_TTL_MS,
  mintPasswordSetupToken,
  passwordSetupUrl,
} from '../password-setup-token';
import { createScopedLogger } from '../../utils/logger.js';
import { inVerifiedOrgScope } from './verified-org-scope';

const log = createScopedLogger('tenant-users');

interface InvitationArgs {
  userId: number;
  email: string;
  role: string;
  organizationId: number;
  /** The caller's role in organizationId, as authorizeOrgAccess verified it. */
  verifiedRole: string;
  callerId: number | null;
  appBaseUrl: string;
}

/**
 * Store the setup token's hash on the new account, in the organization it was
 * just made a member of — the scope atomicCreateUser wrote it in. A tenant
 * scope reaches only its own members' users rows
 * (migrations/20260928_users_membership_rls.sql), so written from the session's
 * organization when an administrator of two acts on the other, this matched
 * nothing and the setup link was dead while the response said it was issued.
 * Anything but one row is therefore an error, never a silent success.
 */
async function storeSetupToken(
  req: any,
  args: InvitationArgs,
  setup: ReturnType<typeof mintPasswordSetupToken>
): Promise<void> {
  // tenant-isolation-safe: users is a global identity table; this id is the row atomicCreateUser just created for the organization the caller was verified to administer (authorizeOrgAccess), inside this same request.
  const stored = await inVerifiedOrgScope(req, args.organizationId, args.verifiedRole, () =>
    pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
      [setup.tokenHash, setup.expiresAt, args.userId]
    )
  );
  if (stored.rowCount !== 1) {
    throw new Error('the password-setup token was not stored on the new account');
  }
}

/** What the admin is told about how the invitee will receive their link. */
export interface InvitationDelivery {
  expiresAt: string | null;
  emailSent: boolean;
  /**
   * 'email' — the invitee has the link; 'link' — the admin must hand it over;
   * 'failed' — the account exists but no activation link could be issued.
   */
  delivery: 'email' | 'link' | 'failed';
  /** Present only when no email went out: the one copy of the setup link. */
  setupUrl?: string;
  /** Present when SMTP is configured but refused the message. */
  emailError?: string;
}

/**
 * Activate a NEWLY created account: mint a password-setup token (the same
 * token "forgot password" uses — server/services/password-setup-token.ts),
 * store its hash on the user row, and send the invitation. The account was
 * inserted with an unusable password hash, so this link is the only way in.
 *
 * Delivery is reported honestly. When SMTP is not configured (or refuses the
 * message) nothing was sent, and the response carries the setup link so the
 * org admin — who just created the account and is the only reader of this
 * response — can hand it over. Either way the audit trail records which.
 */
export async function issueInvitation(req: any, args: InvitationArgs): Promise<InvitationDelivery> {
  const { appBaseUrl } = args;
  const setup = mintPasswordSetupToken(INVITATION_TTL_MS);
  await storeSetupToken(req, args, setup);
  const setupUrl = passwordSetupUrl(appBaseUrl, setup.token);

  const orgRow = await pool.query('SELECT name FROM organizations WHERE id = $1', [
    args.organizationId,
  ]);
  const orgName: string = orgRow.rows[0]?.name ?? 'your organization';
  const inviterName: string = req.user?.name || req.user?.email || 'An administrator';

  let emailSent = false;
  let emailError: string | undefined;
  if (isEmailConfigured()) {
    try {
      emailSent = await sendInvitationEmail(
        args.email,
        inviterName,
        orgName,
        setupUrl,
        setup.expiresAt
      );
    } catch (err) {
      log.error('Invitation email failed', err);
      emailError = 'The invitation email could not be sent';
    }
  }
  const delivery: InvitationDelivery['delivery'] = emailSent ? 'email' : 'link';

  const audit = await auditService.logAction({
    tenantId: args.organizationId,
    userId: args.callerId ?? undefined,
    action: 'user_invited',
    resourceType: 'user',
    resourceId: String(args.userId),
    ipAddress: req.ip,
    userAgent: req.get?.('user-agent'),
    details: {
      email: args.email,
      role: args.role,
      delivery,
      emailSent,
      invitationExpiresAt: setup.expiresAt.toISOString(),
    },
  });
  if (!audit.persisted) {
    log.warn('Audit log write failed (non-fatal)', { action: 'user_invited', err: audit.error });
  }

  return {
    expiresAt: setup.expiresAt.toISOString(),
    emailSent,
    delivery,
    ...(emailSent ? {} : { setupUrl }),
    ...(emailError ? { emailError } : {}),
  };
}
