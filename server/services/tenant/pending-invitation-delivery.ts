import { isEmailConfigured, sendGenericEmail } from '../emailService';

/** Existing-account invitations ask for consent, never password activation.
 * The authenticated recipient inbox is always the durable notification. */
export async function deliverPendingInvitation(email: string, appBaseUrl: string): Promise<{ emailSent: boolean; inbox: true }> {
  const url = `${appBaseUrl.replace(/\/+$/, '')}/concept2cure?organization-invitations=1`;
  let emailSent = false;
  try {
    emailSent = isEmailConfigured() && await sendGenericEmail(email, 'An organization invitation is waiting', `An organization administrator invited you to join their workspace. Sign in to your existing Concept2Cure account to review the organization and offered role, then accept or decline: ${url}\nYour membership and current organization do not change until you consent.`);
  } catch { /* The durable inbox invitation still exists; delivery must not undo or misreport it. */ }
  return { emailSent, inbox: true };
}
