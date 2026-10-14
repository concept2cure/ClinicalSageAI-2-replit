import React, { useState } from 'react';
import type { InvitationOutcome } from './invitationOutcome';

/** Setup links remain visible until navigation, with a separate copy act per person. */
export function InvitationResults({ invitations }: { invitations: InvitationOutcome[] }) {
  const [copyNotes, setCopyNotes] = useState<Record<number, string>>({});
  if (!invitations.length) return null;
  const copy = async (invitation: InvitationOutcome, index: number) => {
    if (!invitation.setupUrl) return;
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(invitation.setupUrl);
      setCopyNotes((prev) => ({ ...prev, [index]: 'Setup link copied. Share it privately with this person.' }));
    } catch {
      setCopyNotes((prev) => ({ ...prev, [index]: 'The link could not be copied. Select the visible link below and copy it manually.' }));
    }
  };
  return (
    <section className="ob-review" aria-label="Invitation results">
      <h3 className="pj-seclbl">Team invitation results</h3>
      {invitations.map((invitation, index) => (
        <div key={`${invitation.email}-${index}`} className="ob-discovery-summary">
          <div className="ob-rev-row">
            <span className="k">{invitation.email}</span>
            <span className="v">{({ email: 'Email sent', link: 'Share setup link', 'pending-consent': 'Awaiting consent', 'member-added': 'Member added', 'activation-failed': 'Activation needs attention', 'delivery-unconfirmed': 'Delivery unconfirmed', refused: 'Invitation refused', unconfirmed: 'Outcome unconfirmed' })[invitation.state]}</span>
          </div>
          <p className="scaf-note">{invitation.note}</p>
          {invitation.setupUrl && (
            <div className="ob-review">
              <label htmlFor={`ob-setup-link-${index}`} className="scaf-note">Password setup link for {invitation.email}</label>
              <input id={`ob-setup-link-${index}`} className="ob-in" value={invitation.setupUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
              {invitation.expiresAt && <p className="scaf-note">Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>}
              <button type="button" className="btn ghost small" onClick={() => void copy(invitation, index)}>Copy setup link for {invitation.email}</button>
              <p className={copyNotes[index] ? 'scaf-note' : 'sr-only'} role="status" aria-live="polite">{copyNotes[index] ?? ''}</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
