import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { acceptedMembershipRole, invitationName, invitationResponseNote, isInvitationList, isMembershipList, useOrganizationAccessRows, type Invitation, type Membership } from './organizationAccessData';
import { type ListState } from './dataConnect';
import { useDialog } from './useDialog';
import { ceremonyOpen, registerCeremonyOpen } from './ceremony';
import { C2CForm, type C2CFormConfig } from './C2CForm';
import { assertOrganizationSwitchSafe, requireOrganizationOwner, switchOrganization, type OrganizationOwner } from './switchOrganization';
import { C2CToast, useToast } from './toast';
import { I } from './icons';

type Decision = ({ kind: 'switch'; membership: Membership } | { kind: 'accept' | 'decline'; invitation: Invitation }) & { owner: OrganizationOwner };
type Choice = Omit<Extract<Decision, { kind: 'switch' }>, 'owner'> | Omit<Extract<Decision, { kind: 'accept' | 'decline' }>, 'owner'>;

function decisionForm(decision: Decision | null, busy: boolean): C2CFormConfig | null {
  if (!decision) return null;
  const common = { fields: [], busy: busy ? 'Applying your confirmed choice…' : undefined };
  if (decision.kind === 'switch') return {
    ...common, title: `Switch to ${decision.membership.name}?`, submitLabel: 'Switch organization',
    governed: 'The server verifies your membership and rotates this session. Save work and copy one-time keys first. The workspace reloads at Projects with no project from your previous organization.',
  };
  const accepting = decision.kind === 'accept';
  return {
    ...common,
    title: `${accepting ? 'Accept' : 'Decline'} invitation to ${invitationName(decision.invitation) || 'an unnamed organization'}?`,
    governed: accepting ? `The invitation offers ${decision.invitation.role}. Your existing membership role, if present, is preserved. Your current organization does not change until you choose to switch.` : 'The invitation will be declined. You will not join this organization.',
    submitLabel: accepting ? 'Accept invitation' : 'Decline invitation',
  };
}

function OrganizationList({ state, choose, currentId }: { state: ListState<Membership>; choose: (choice: Choice) => void; currentId?: string }) {
  if (state.loading) return <p>Loading organizations…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  return <>{state.rows.map((membership) => <div key={membership.id}>
    <b>{membership.name}</b> · {membership.role}{String(membership.id) === currentId ? ' · current' : ''}{membership.status !== 'active' ? ` · ${membership.status}` : ''}
    <button className="btn ghost small" disabled={String(membership.id) === currentId || membership.status !== 'active'} onClick={() => choose({ kind: 'switch', membership })}>Switch to {membership.name}</button>
  </div>)}</>;
}

function InvitationList({ state, choose }: { state: ListState<Invitation>; choose: (choice: Choice) => void }) {
  if (state.loading) return <p>Loading invitations…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  if (!state.rows.length) return <p>No pending invitations.</p>;
  return <>{state.rows.map((invitation) => {
    const name = invitationName(invitation) || 'Organization name unavailable';
    return <div key={invitation.id}><b>{name}</b> · offered role: {invitation.role}
      <button className="btn ghost small" aria-label={`Accept invitation from ${name}`} disabled={!invitationName(invitation)} onClick={() => choose({ kind: 'accept', invitation })}>Accept</button>
      <button className="btn ghost small" aria-label={`Decline invitation from ${name}`} onClick={() => choose({ kind: 'decline', invitation })}>Decline</button>
    </div>;
  })}</>;
}

async function respondToInvitation(decision: Extract<Decision, { kind: 'accept' | 'decline' }>, mounted: () => boolean) {
  const response = await apiRequest('POST', `/api/tenant-users/invitations/${decision.invitation.id}/${decision.kind}`, undefined, decision.owner.headers);
  if (!mounted()) return null;
  requireOrganizationOwner(decision.owner);
  const body = await response.json().catch(() => null);
  if (!mounted()) return null;
  requireOrganizationOwner(decision.owner);
  if (!response.ok || body?.success !== true) throw new Error(serverMessage(body) ?? 'The invitation decision was not confirmed.');
  const role = decision.kind === 'accept' ? acceptedMembershipRole(body.data, decision.invitation, decision.owner.userId) : null;
  if (decision.kind === 'accept' && role === null) throw new Error('The server did not confirm membership for this invitation. Reload invitations before trying again.');
  return invitationResponseNote(decision.invitation, decision.kind, role);
}

/** The recipient's own invitation inbox and membership selector, available to
 * every signed-in user. Neither action trusts the display name for identity. */
export function OrganizationAccess() {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('organization-invitations') === '1');
  const [epoch, setEpoch] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast();
  const sending = useRef(false);
  const ref = useDialog(() => setOpen(false), open);
  const invitations = useOrganizationAccessRows<Invitation>('/api/tenant-users/invitations/mine', epoch, isInvitationList);
  const memberships = useOrganizationAccessRows<Membership>(open ? '/api/auth/enterprise/organizations' : null, epoch, isMembershipList);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => open ? registerCeremonyOpen() : undefined, [open]);
  useEffect(() => {
    const timer = window.setInterval(() => setEpoch((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const choose = (choice: Choice) => {
    const owner = choice.kind === 'switch' ? memberships.owner : invitations.owner;
    if (choice.kind === 'accept' && !invitationName(choice.invitation)) return;
    if (!owner?.current()) { notify('Your session has changed. Reload organization access before continuing.', 'error'); return; }
    if (choice.kind === 'switch') {
      try { assertOrganizationSwitchSafe(); } catch (error) { notify((error as Error).message, 'error'); return; }
    }
    setOpen(false); setDecision({ ...choice, owner });
  };
  const submit = async () => {
    if (!decision || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      requireOrganizationOwner(decision.owner);
      if (decision.kind === 'switch') {
        await switchOrganization(decision.membership.id, undefined, decision.owner);
        if (mounted.current) setDecision(null);
      } else {
        const note = await respondToInvitation(decision, () => mounted.current);
        if (!note || !mounted.current) return;
        notify(note);
        setEpoch((value) => value + 1); setDecision(null); setOpen(true);
      }
    } catch (error) { if (mounted.current) notify(error instanceof Error ? error.message : 'The request could not be completed.', 'error'); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
  };
  const form = decisionForm(decision?.owner.current() ? decision : null, busy);
  return <>
    <button className="tb-btn" aria-label="Organizations and invitations" title="Organizations and invitations" onClick={() => {
      if (ceremonyOpen()) { notify('Finish or cancel the open governed form before changing organization access.', 'error'); return; }
      setOpen(true); setEpoch((value) => value + 1);
    }}>{I.users ?? I.user}{!invitations.loading && !invitations.error && invitations.rows.length > 0 ? <span aria-hidden="true">{invitations.rows.length}</span> : null}</button>
    {open && <><div className="tt-scrim" onClick={() => setOpen(false)} /><aside className="tt-panel" ref={ref} role="dialog" aria-modal="true" aria-label="Organizations and invitations" tabIndex={-1}>
      <div className="tt-head"><b>Organizations and invitations</b><button className="tt-close" aria-label="Close organizations and invitations" onClick={() => setOpen(false)}>Close</button></div>
      <div className="tt-scroll">
        <h3>Your organizations</h3>
        <OrganizationList state={memberships} choose={choose} currentId={memberships.owner?.organizationId} />
        <h3>Pending invitations</h3>
        <InvitationList state={invitations} choose={choose} />
        {(invitations.error || memberships.error) && <button className="btn ghost small" onClick={() => setEpoch((value) => value + 1)}>Retry organization access</button>}
      </div>
    </aside></>}
    {form && <C2CForm config={form} onCancel={() => { if (!sending.current) { setDecision(null); setOpen(true); } }} onSubmit={() => void submit()} />}
    <C2CToast msg={toast} />
  </>;
}
