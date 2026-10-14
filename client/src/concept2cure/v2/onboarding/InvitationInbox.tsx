import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { ASSIGNABLE_ORG_ROLES, type AssignableOrgRole } from '@shared/constants/org-roles';

export interface PendingOrganizationInvitation {
  id: number;
  organizationId: number;
  organizationName?: string;
  role: AssignableOrgRole;
  status: 'pending';
  createdAt?: string;
}

function pendingInvitations(body: unknown): PendingOrganizationInvitation[] | null {
  if (!Array.isArray(body)) return null;
  if (!body.every((row) => row && typeof row === 'object' && Number.isInteger(row.id) && row.id > 0 &&
    Number.isInteger(row.organizationId) && row.organizationId > 0 && row.status === 'pending' &&
    ASSIGNABLE_ORG_ROLES.includes(row.role))) return null;
  return body.map((row) => ({
    id: row.id, organizationId: row.organizationId, role: row.role, status: 'pending',
    ...(typeof row.organizationName === 'string' && row.organizationName.trim() ? { organizationName: row.organizationName.trim() } : {}),
    ...(typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) ? { createdAt: row.createdAt } : {}),
  }));
}

/** Use the canonical transport, including its audit warning and session handling. */
async function send(method: 'GET' | 'POST', path: string): Promise<{ ok: true; body: unknown } | { ok: false; why: string }> {
  try {
    const response = await apiRequest(method, path);
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, why: serverMessage(body) ?? 'The request was refused. Try again or contact your administrator.' };
    return { ok: true, body };
  } catch (error) {
    return { ok: false, why: error instanceof ApiRequestError
      ? serverMessage(error.payload) ?? 'The request could not be completed. Try again or contact your administrator.'
      : 'The server could not be reached. Try again.' };
  }
}

/** Existing accounts explicitly consent to another organization; acceptance never changes the active workspace. */
export function InvitationInbox({ onAccepted }: { onAccepted?: (organizationId: number) => void } = {}) {
  const [invitations, setInvitations] = useState<PendingOrganizationInvitation[]>([]);
  const [readState, setReadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [readError, setReadError] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, { error: boolean; text: string }>>({});
  const requestEpoch = useRef(0);
  const sending = useRef(false);

  const read = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    setReadState('loading');
    const answer = await send('GET', '/api/tenant-users/invitations/mine');
    if (epoch !== requestEpoch.current) return;
    const rows = answer.ok ? pendingInvitations(answer.body) : null;
    if (rows) { setInvitations(rows); setReadState('ready'); setReadError(''); }
    else {
      setReadState('failed');
      setReadError(answer.ok ? 'The invitation list could not be confirmed. Try again.' : answer.why);
    }
  }, []);
  useEffect(() => { void read(); return () => { requestEpoch.current += 1; }; }, [read]);

  const respond = async (invitation: PendingOrganizationInvitation, action: 'accept' | 'decline') => {
    if (sending.current || (action === 'accept' && !invitation.organizationName)) return;
    sending.current = true;
    setPendingId(invitation.id);
    const answer = await send('POST', `/api/tenant-users/invitations/${invitation.id}/${action}`);
    const confirmed = answer.ok && answer.body !== null && typeof answer.body === 'object' &&
      (answer.body as { success?: unknown }).success === true;
    if (confirmed) {
      setNotes((prev) => ({ ...prev, [invitation.id]: { error: false, text: action === 'accept'
        ? `Invitation to ${invitation.organizationName} accepted. You now have membership there; your current workspace remains active.`
        : `Invitation${invitation.organizationName ? ` to ${invitation.organizationName}` : ''} declined. No membership was added.` } }));
      setInvitations((prev) => prev.filter((row) => row.id !== invitation.id));
    } else {
      setNotes((prev) => ({ ...prev, [invitation.id]: { error: true, text: answer.ok
        ? serverMessage(answer.body) ?? 'The response did not confirm your choice. Check your invitations before retrying.'
        : answer.why } }));
    }
    sending.current = false;
    setPendingId(null);
    if (confirmed && action === 'accept') onAccepted?.(invitation.organizationId);
  };

  return (
    <section className="de-field" aria-label="Organization invitations">
      <h3 className="de-label">Organization invitations</h3>
      <p className="scaf-note">An existing account joins another organization only after you accept its invitation. Review the organization and role before choosing.</p>
      {readState === 'loading' && <p className="scaf-note" role="status">Reading your invitations…</p>}
      {readState === 'failed' && <div role="alert" className="de-err">{readError} <button type="button" className="btn ghost small" onClick={() => void read()}>Retry invitations</button></div>}
      {readState === 'ready' && invitations.length === 0 && <p className="scaf-note">No pending organization invitations.</p>}
      {readState === 'ready' && invitations.map((invitation) => (
        <div className="ob-review" key={invitation.id}>
          <div className="ob-rev-row"><span className="k">{invitation.organizationName ?? 'Organization name unavailable'}</span><span className="v">{invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}</span></div>
          {invitation.createdAt && <p className="scaf-note">Invited {new Date(invitation.createdAt).toLocaleDateString()}.</p>}
          {!invitation.organizationName && <p className="scaf-note">The inviting organization could not be identified by name. Contact the inviting administrator before accepting.</p>}
          <div className="ob-invite">
            <button type="button" className="btn" disabled={pendingId !== null || !invitation.organizationName} onClick={() => void respond(invitation, 'accept')}>Accept invitation{invitation.organizationName ? ` from ${invitation.organizationName}` : ''}</button>
            <button type="button" className="btn ghost" disabled={pendingId !== null} onClick={() => void respond(invitation, 'decline')}>Decline invitation{invitation.organizationName ? ` from ${invitation.organizationName}` : ''}</button>
          </div>
          {pendingId === invitation.id && <p className="scaf-note" role="status">Recording your choice…</p>}
        </div>
      ))}
      <div role="status" aria-live="polite" aria-atomic="true">
        {Object.entries(notes).map(([id, note]) => <p className={note.error ? 'de-err' : 'scaf-note'} key={id}>{note.text}</p>)}
      </div>
    </section>
  );
}
