import { serverMessage } from '@/lib/queryClient';
import { ASSIGNABLE_ORG_ROLES, type AssignableOrgRole } from '@shared/constants/org-roles';

export type InvitationState =
  | 'email' | 'link' | 'pending-consent' | 'member-added'
  | 'activation-failed' | 'delivery-unconfirmed' | 'refused' | 'unconfirmed';

/** Private activation result. Setup URLs must never enter saved discovery or AnA context. */
export interface InvitationOutcome {
  email: string;
  state: InvitationState;
  /** The server confirmed a membership, an invitation, or a replacement setup link. */
  recorded: boolean;
  /** Existing account added immediately; other states still require setup or consent. */
  readyForAccess: boolean;
  reissued: boolean;
  role?: AssignableOrgRole;
  note: string;
  setupUrl?: string;
  expiresAt?: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** The route issues http(s) links to the canonical password setup screen. */
function setupLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        !url.pathname.endsWith('/concept2cure/password-reset') || !url.searchParams.get('token')) return undefined;
    return value;
  } catch { return undefined; }
}

function validExpiry(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function deliveredInvitation(confirmed: InvitationOutcome, invitation: Record<string, unknown>): InvitationOutcome | null {
  const reissuedNote = confirmed.reissued
    ? 'A new setup link was issued. The previous link no longer works; their role is unchanged' +
      (confirmed.role ? ` (${confirmed.role.charAt(0).toUpperCase() + confirmed.role.slice(1)})` : '') + '. '
    : '';
  if (invitation.delivery === 'failed') return {
    ...confirmed, state: 'activation-failed',
    note: 'The account was added, but no activation link could be issued. This person cannot sign in yet. Issue a new setup link from Members or ask them to use Forgot password.',
  };
  if (invitation.delivery === 'email' && invitation.emailSent === true) return {
    ...confirmed, state: 'email',
    note: reissuedNote + 'An invitation email with a password setup link was sent. This person must set their password before signing in.',
  };
  if (invitation.delivery === 'link') {
    const setupUrl = setupLink(invitation.setupUrl);
    const expiresAt = validExpiry(invitation.expiresAt);
    if (setupUrl) return {
      ...confirmed, state: 'link', setupUrl,
      ...(expiresAt ? { expiresAt } : {}),
      note: reissuedNote + 'No invitation email was sent. Share this password setup link privately with this person before continuing.',
    };
  }
  return null;
}

function memberInvitation(base: InvitationOutcome, reply: Record<string, unknown>, status: number): InvitationOutcome {
  const role = ASSIGNABLE_ORG_ROLES.find((r) => r === reply.role);
  const confirmed = { ...base, recorded: true, reissued: reply.reissued === true, ...(role ? { role } : {}) };
  const invitation = record(reply.invitation);
  if (invitation) {
    const delivered = deliveredInvitation(confirmed, invitation);
    if (delivered) return delivered;
  }
  if (reply.createdNewUser === false && !invitation && status === 201) return {
    ...confirmed, state: 'member-added', readyForAccess: true,
    note: 'This existing account was added to the organization. No password setup email was required.',
  };
  if (reply.createdNewUser === true || confirmed.reissued || invitation) return {
    ...confirmed, state: 'delivery-unconfirmed',
    note: 'The account or invitation was recorded, but delivery could not be confirmed. Check Members and issue a new setup link if needed.',
  };
  return base;
}

/** POST /api/tenant-users: a 2xx response alone never proves delivery or access. */
export function invitationOutcome(email: string, status: number, body: unknown): InvitationOutcome {
  const base: InvitationOutcome = {
    email, state: 'unconfirmed', recorded: false, readyForAccess: false, reissued: false,
    note: 'The invitation outcome could not be confirmed. Check Members before retrying to avoid issuing a duplicate invitation.',
  };
  if (status === 0) return {
    ...base,
    note: 'The server could not be reached, so the invitation outcome is unconfirmed. Check Members before retrying.',
  };
  const reply = record(body);
  if (status < 200 || status >= 300 || reply?.success === false) return {
    ...base, state: 'refused',
    note: serverMessage(body) ?? (status === 403
      ? 'The invitation was refused. Ask an organization administrator to check your permissions and available seats.'
      : 'The invitation was refused. Check Members and try again.'),
  };
  if (!reply) return base;
  if (reply.pendingInvitation === true) return {
    ...base, recorded: true, state: 'pending-consent',
    note: 'A pending invitation was recorded. This person already has an account and must accept before membership is added; no password setup email was sent by this action.',
  };
  // A 202 without the pending-invitation contract does not confirm a membership.
  if (status === 202) return base;
  return memberInvitation(base, reply, status);
}
