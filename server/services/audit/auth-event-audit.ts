/**
 * Authentication events into the audit trail (21 CFR Part 11 §11.10(e)): every
 * login attempt, logout and credential-changing event.
 *
 * ── Why the write opens its own tenant scope ─────────────────────────────────
 * Every /api/auth request runs in the pre-auth scope: tenant '0', no role
 * (`runWithPreAuthScope`, mounted by register-platform-routes). That is right
 * for the request, since no tenant is known until the user has been identified.
 * It is wrong for the audit row of an identified user, which carries that
 * user's organisation. `audit_logs`' tenant isolation policy admits a row only
 * for the scope's own tenant, so under RLS_ENFORCE=on (the only posture
 * production accepts) every such row was refused:
 *   - the MFA challenge every password sign-in issues;
 *   - a wrong password on a real account;
 *   - a lockout.
 * The refusal is swallowed below by design. A sign-in therefore left no audit
 * record (VSR-001 §13, F-19; tests/db/sign-in-audit-trail.dbtest.ts).
 *
 * So the write for an identified user runs in a scope for exactly the tenant it
 * records. That tenant is resolved by the server, from the user record or from
 * its own signed MFA challenge, never from the request. The scope carries no
 * role, so it reaches that tenant's audit chain and nothing else. It wraps the
 * audit write alone: the request's own queries stay in the pre-auth scope. The
 * same least-privilege shape is used for new-organisation provisioning at
 * signup (routes/auth.ts). An event with no identified tenant, such as an
 * unknown email, is written from the scope it arrives in, as tenant 0.
 *
 * ── Why a failure does not fail the request ─────────────────────────────────
 * An audit-pipeline outage must never lock every user out of the product. The
 * failure is logged at warn level. It is no longer the steady state of every
 * sign-in.
 */
import { runWithTenantScope } from '../../db/tenantStore';
import { createScopedLogger } from '../../utils/logger.js';
import auditService from '../auditService';

const logger = createScopedLogger('auth');

export interface AuthAuditEvent {
  action: string;
  userId?: number | string | null;
  tenantId?: number | string | null;
  email?: string;
  outcome: 'success' | 'failure';
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * The sentence the audit ledger shows for an event. The ledger surface reads
 * `description` from a row's payload before it falls back to the action name
 * (server/routes/audit-trail-ledger.routes.ts), and without one a refused
 * sign-in and a successful one both read "User Login". Keyed by
 * action | outcome | reason, the combinations routes/auth.ts and routes/sso.ts
 * record.
 */
const EVENT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'user_login|success|mfa_verified': 'Signed in: password and second factor verified',
  'user_login|success|dev_mfa_skipped': 'Signed in on a development server: second factor skipped',
  'user_login|failure|unknown_email': 'Sign-in refused: no account for this address',
  'user_login|failure|account_locked': 'Sign-in refused: account locked',
  'user_login|failure|account_inactive': 'Sign-in refused: the account is not active (suspended or deprovisioned)',
  'user_login|failure|email_unverified': 'Sign-in refused: the e-mail address has not been confirmed',
  'user_signup|success|verification_sent': 'Signed up: the account waits on its e-mail confirmation link',
  'user_signup|success|dev_no_verification': 'Signed up on a development server: e-mail confirmation skipped',
  'email_verified|success|link': 'E-mail address confirmed from the sign-up link: the account is active',
  'user_login|failure|wrong_password': 'Sign-in refused: wrong password',
  'user_login|failure|wrong_password_threshold_exceeded': 'Sign-in refused: wrong password; the account is now locked',
  // A SAML sign-in, recorded in the organisation that owns the IdP
  // configuration (routes/sso.ts; audit IAM-03).
  'user_login|success|saml_sso': "Signed in through the organisation's SAML identity provider",
  'user_login|failure|saml_validation_failed': 'Sign-in refused: the SAML response did not validate',
  'user_login|failure|saml_org_not_resolved': 'Sign-in refused: the SAML configuration resolved to no organisation',
  'user_login|failure|saml_no_email': 'Sign-in refused: the SAML assertion carried no email address',
  'user_login|failure|saml_user_not_in_organisation':
    'Sign-in refused: the account is not a member of the organisation that owns this identity provider',
  'user_login_mfa_challenge|success|mfa_challenge_totp': 'Password verified: authenticator code requested',
  'user_login_mfa_challenge|success|mfa_challenge_email': 'Password verified: email code sent',
  'user_login_mfa_failed|failure|invalid_code': 'Second factor refused: wrong code',
  'user_login_mfa_failed|failure|invalid_or_expired_challenge': 'Second factor refused: invalid or expired challenge',
  'user_logout|success|': 'Signed out',
  'user_password_reset_requested|success|': 'Password reset requested',
  'user_password_reset_requested|failure|no account for this address': 'Password reset requested for an address with no account',
  'user_password_reset_failed|failure|reset token matched no account': 'Password reset refused: the reset link matched no account',
  'user_password_reset_failed|failure|reset token had expired': 'Password reset refused: the reset link had expired',
  'user_password_changed|success|password reset via emailed token': 'Password changed through an emailed reset link',
  'user_mfa_setup|success|secret_issued': 'Authenticator enrolment started: a new secret was issued',
  'user_mfa_setup|failure|already_enrolled': 'Authenticator enrolment refused: two-step verification is already on',
  'user_mfa_enable|success|': 'Two-step verification turned on',
  'user_mfa_enable|failure|invalid_code': 'Two-step verification not turned on: wrong code',
  'user_mfa_disable|success|': 'Two-step verification turned off',
  'user_mfa_disable|failure|invalid_code': 'Two-step verification not turned off: wrong code',
};

/** The ledger sentence for an event: its own when listed, otherwise one that still states the outcome. */
export function describeAuthEvent(entry: Pick<AuthAuditEvent, 'action' | 'outcome' | 'reason'>): string {
  return (
    EVENT_DESCRIPTIONS[`${entry.action}|${entry.outcome}|${entry.reason ?? ''}`] ??
    `${entry.action.replace(/_/g, ' ')}: ${entry.outcome}${entry.reason ? ` (${entry.reason})` : ''}`
  );
}

/** The organisation an event records, when it names one: a positive integer id. */
function recordedTenant(tenantId: AuthAuditEvent['tenantId']): number | null {
  if (tenantId === null || tenantId === undefined || tenantId === '') return null;
  const id = Number(tenantId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function recordAuthEvent(entry: AuthAuditEvent): Promise<void> {
  const write = () =>
    auditService.logAction({
      tenantId: entry.tenantId ?? undefined,
      userId: entry.userId ?? undefined,
      action: entry.action,
      resourceType: 'user',
      resourceId: entry.userId?.toString() ?? entry.email ?? 'unknown',
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      details: {
        description: describeAuthEvent(entry),
        outcome: entry.outcome,
        reason: entry.reason,
        email: entry.email,
      },
    });

  const tenant = recordedTenant(entry.tenantId);
  const authAudit =
    tenant === null
      ? await write()
      : await runWithTenantScope(
          { tenantId: String(tenant), role: null, source: 'request', caller: `auth audit: ${entry.action}` },
          write,
        );
  if (!authAudit.persisted) {
    logger.warn('Audit log write failed (non-fatal)', {
      err: authAudit.error ?? 'no durable store accepted the row',
      action: entry.action,
    });
  }
}
