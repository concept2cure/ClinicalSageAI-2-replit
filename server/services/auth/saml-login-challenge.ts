/** SAML verifies the first factor; the canonical local MFA verifier opens the session. */
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../../shared/schema';
import { createSamlMfaChallengeToken } from '../mfaService';
import { mfaEnrolmentOf, type MfaMethodEntry } from '../mfa-enrolment';
import { createEmailOtp } from '../emailOtpService';
import { sendLoginOtpEmail } from '../emailService';
import { recordAuthEvent } from '../audit/auth-event-audit';
import { canDeliverLoginCode, LOGIN_CODE_UNDELIVERABLE_REASON } from './login-code-delivery';

interface SamlChallengeInput {
  user: { id: number; email: string; orgRole: string };
  organizationId: number;
  sessionIndex?: string;
  request: { ipAddress?: string; userAgent?: string };
}
export interface SamlLoginChallenge {
  mfaRequired: true;
  challengeId: string;
  mfaMethods: MfaMethodEntry[];
  maskedEmail?: string;
}

/** Null means no deliverable second factor; no access token/session is ever issued here. */
export async function issueSamlLoginChallenge(input: SamlChallengeInput): Promise<SamlLoginChallenge | null> {
  const { user, organizationId, request } = input;
  const [account] = await db.select({ mfaEnabled: users.mfaEnabled, mfaMethod: users.mfaMethod })
    .from(users).where(eq(users.id, user.id)).limit(1);
  if (!account) throw new Error('SAML account no longer exists');
  const enrolment = mfaEnrolmentOf(account);
  const event = { action: 'user_login_mfa_challenge' as const, userId: user.id, tenantId: organizationId, email: user.email, ...request };
  if (enrolment.signInFactor === 'email') {
    if (!canDeliverLoginCode()) {
      await recordAuthEvent({ ...event, outcome: 'failure', reason: LOGIN_CODE_UNDELIVERABLE_REASON });
      return null;
    }
    try {
      const code = await createEmailOtp(user.id);
      await sendLoginOtpEmail(user.email, code);
    } catch {
      await recordAuthEvent({ ...event, outcome: 'failure', reason: LOGIN_CODE_UNDELIVERABLE_REASON });
      return null;
    }
  }
  const challengeId = createSamlMfaChallengeToken({ userId: user.id, email: user.email, organizationId: String(organizationId), role: user.orgRole }, input.sessionIndex);
  await recordAuthEvent({ ...event, outcome: 'success', reason: `saml_mfa_challenge_${enrolment.signInFactor}` });
  const [local, domain] = user.email.split('@');
  return {
    mfaRequired: true, challengeId, mfaMethods: enrolment.mfaMethods,
    ...(enrolment.signInFactor === 'email' ? { maskedEmail: `${local.slice(0, 2)}***@${domain}` } : {}),
  };
}
