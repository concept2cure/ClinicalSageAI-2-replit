import React, { useState } from 'react';

export interface OnboardingInvitationOutcome {
  email: string;
  status: 'email_sent' | 'share_link' | 'delivery_failed' | 'pending_membership' | 'created';
  setupUrl?: string;
}

/** A created membership is not evidence that an invitation email was delivered. */
export function invitationOutcome(email: string, status: number, body: unknown): OnboardingInvitationOutcome {
  if (status === 202) return { email, status: 'pending_membership' };
  const data = body as { invitation?: { delivery?: string; setupUrl?: unknown } } | null;
  const invitation = data?.invitation;
  if (invitation?.delivery === 'email') return { email, status: 'email_sent' };
  if (invitation?.delivery === 'link' && typeof invitation.setupUrl === 'string' && invitation.setupUrl) {
    return { email, status: 'share_link', setupUrl: invitation.setupUrl };
  }
  if (invitation?.delivery === 'failed' || invitation?.delivery === 'link') {
    return { email, status: 'delivery_failed' };
  }
  return { email, status: 'created' };
}

export function OnboardingInvitations({ invitations }: { invitations: OnboardingInvitationOutcome[] }) {
  const [copyNote, setCopyNote] = useState<string | null>(null);
  if (!invitations.length) return null;
  const copy = async (invitation: OnboardingInvitationOutcome) => {
    try {
      if (!navigator.clipboard?.writeText || !invitation.setupUrl) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(invitation.setupUrl);
      setCopyNote(`Setup link copied for ${invitation.email}. Share it privately with that person.`);
    } catch {
      setCopyNote('The link could not be copied. Select the link below and copy it manually.');
    }
  };
  return (
    <div className="ob-discovery-summary">
      <div className="pj-seclbl">Invitation handover</div>
      {invitations.map((invitation) => (
        <div key={invitation.email}>
          <div className="ob-rev-row">
            <span className="k">{invitation.email}</span>
            <span className="v">
              {invitation.status === 'email_sent' ? 'Invitation email sent.'
                : invitation.status === 'pending_membership' ? 'Membership invitation recorded. They can accept it from Account in their existing workspace.'
                  : invitation.status === 'share_link' ? 'No email was sent. Share the password setup link privately.'
                    : invitation.status === 'delivery_failed' ? 'Member added, but the invitation could not be delivered. Issue a new setup link from the admin console.'
                      : 'Invitation created; delivery was not confirmed. Check the member in the admin console.'}
            </span>
          </div>
          {invitation.setupUrl && <div className="ob-discovery-actions">
            <input className="ob-in" aria-label={`Setup link for ${invitation.email}`} value={invitation.setupUrl} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className="sp-ask" onClick={() => void copy(invitation)}>Copy setup link for {invitation.email}</button>
          </div>}
        </div>
      ))}
      {copyNote && <p className="scaf-note" role="status">{copyNote}</p>}
      {invitations.some((invitation) => invitation.setupUrl) && <p className="scaf-note">Setup links are only shown for this activation. Closing the wizard clears them; an administrator can issue a replacement from the member drawer.</p>}
    </div>
  );
}
