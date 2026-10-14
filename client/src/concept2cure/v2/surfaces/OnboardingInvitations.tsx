import React, { useState } from 'react';
import { invitationOutcome, type InvitationOutcome } from '../onboarding/invitationOutcome';

// One pure outcome contract serves the wizard and its private handover.
export { invitationOutcome };
export type OnboardingInvitationOutcome = InvitationOutcome;
const STATE_LABELS: Record<InvitationOutcome['state'], string> = {
  email: 'Email sent', link: 'Share setup link', 'pending-consent': 'Awaiting consent',
  'member-added': 'Member added', 'activation-failed': 'Activation needs attention',
  'delivery-unconfirmed': 'Delivery unconfirmed', refused: 'Invitation refused', unconfirmed: 'Outcome unconfirmed',
};

export function OnboardingInvitations({ invitations }: { invitations: OnboardingInvitationOutcome[] }) {
  const [copyNotes, setCopyNotes] = useState<Record<number, string>>({});
  if (!invitations.length) return null;
  const copy = async (invitation: OnboardingInvitationOutcome, index: number) => {
    try {
      if (!navigator.clipboard?.writeText || !invitation.setupUrl) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(invitation.setupUrl);
      setCopyNotes(notes => ({ ...notes, [index]: 'Setup link copied. Share it privately with this person.' }));
    } catch {
      setCopyNotes(notes => ({ ...notes, [index]: 'The link could not be copied. Select the visible link below and copy it manually.' }));
    }
  };
  return (
    <section className="ob-discovery-summary" aria-label="Invitation results">
      <div className="pj-seclbl">Invitation handover</div>
      {invitations.map((invitation, index) => (
        <div key={`${invitation.email}-${index}`}>
          <div className="ob-rev-row">
            <span className="k">{invitation.email}</span>
            <span className="v">
              {STATE_LABELS[invitation.state]}
            </span>
          </div>
          <p className="scaf-note">{invitation.note}</p>
          {invitation.setupUrl && <div className="ob-discovery-actions">
            <input className="ob-in" aria-label={`Setup link for ${invitation.email}`} value={invitation.setupUrl} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className="sp-ask" onClick={() => void copy(invitation, index)}>Copy setup link for {invitation.email}</button>
            {invitation.expiresAt && <p className="scaf-note">Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>}
            <p className="scaf-note" role="status" aria-live="polite">{copyNotes[index] ?? ''}</p>
          </div>}
        </div>
      ))}
      {invitations.some((invitation) => invitation.setupUrl) && <p className="scaf-note">Setup links are only shown for this handover. Closing this view clears them; an administrator can issue a replacement from the member drawer.</p>}
    </section>
  );
}
