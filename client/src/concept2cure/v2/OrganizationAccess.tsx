import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { getJwtOrgId } from '@/utils/authToken';
import { useLiveRows, type ListState } from './dataConnect';
import { useDialog } from './useDialog';
import { ceremonyOpen, registerCeremonyOpen } from './ceremony';
import { C2CForm, type C2CFormConfig } from './C2CForm';
import { assertOrganizationSwitchSafe, switchOrganization } from './switchOrganization';
import { C2CToast, useToast } from './toast';
import { I } from './icons';

interface Membership { id: number; name: string; role: string; status: string; }
interface Invitation { id: number; organizationId: number; organizationName: string; role: string; }
const membershipsShape = (value: unknown): value is Membership[] => Array.isArray(value) && value.every((row) => Number.isInteger(row?.id) && typeof row.name === 'string' && typeof row.role === 'string');
const invitationsShape = (value: unknown): value is Invitation[] => Array.isArray(value) && value.every((row) => Number.isInteger(row?.id) && Number.isInteger(row?.organizationId) && typeof row.role === 'string');
type Decision = { kind: 'switch'; membership: Membership } | { kind: 'accept' | 'decline'; invitation: Invitation };

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
    title: `${accepting ? 'Accept' : 'Decline'} invitation to ${decision.invitation.organizationName || `organization ${decision.invitation.organizationId}`}?`,
    governed: accepting ? `You will join this organization as ${decision.invitation.role}. Your current organization does not change until you choose to switch.` : 'The invitation will be declined. You will not join this organization.',
    submitLabel: accepting ? 'Accept invitation' : 'Decline invitation',
  };
}

function OrganizationList({ state, choose }: { state: ListState<Membership>; choose: (choice: Decision) => void }) {
  if (state.loading) return <p>Loading organizations…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  return <>{state.rows.map((membership) => <div key={membership.id}>
    <b>{membership.name}</b> · {membership.role}{String(membership.id) === getJwtOrgId() ? ' · current' : ''}{membership.status !== 'active' ? ` · ${membership.status}` : ''}
    <button className="btn ghost small" disabled={String(membership.id) === getJwtOrgId() || membership.status !== 'active'} onClick={() => choose({ kind: 'switch', membership })}>Switch to {membership.name}</button>
  </div>)}</>;
}

function InvitationList({ state, choose }: { state: ListState<Invitation>; choose: (choice: Decision) => void }) {
  if (state.loading) return <p>Loading invitations…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  if (!state.rows.length) return <p>No pending invitations.</p>;
  return <>{state.rows.map((invitation) => {
    const name = invitation.organizationName || `Organization ${invitation.organizationId}`;
    return <div key={invitation.id}><b>{name}</b> · offered role: {invitation.role}
      <button className="btn ghost small" aria-label={`Accept invitation from ${name}`} onClick={() => choose({ kind: 'accept', invitation })}>Accept</button>
      <button className="btn ghost small" aria-label={`Decline invitation from ${name}`} onClick={() => choose({ kind: 'decline', invitation })}>Decline</button>
    </div>;
  })}</>;
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
  const invitations = useLiveRows<Invitation>('/api/tenant-users/invitations/mine', ['own-invitations', epoch], invitationsShape);
  const memberships = useLiveRows<Membership>(open ? '/api/auth/enterprise/organizations' : null, ['own-organizations', open, epoch], membershipsShape);
  useEffect(() => open ? registerCeremonyOpen() : undefined, [open]);
  useEffect(() => {
    const timer = window.setInterval(() => setEpoch((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const choose = (choice: Decision) => {
    if (choice.kind === 'switch') {
      try { assertOrganizationSwitchSafe(); } catch (error) { notify((error as Error).message, 'error'); return; }
    }
    setOpen(false); setDecision(choice);
  };
  const submit = async () => {
    if (!decision || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      if (decision.kind === 'switch') {
        await switchOrganization(decision.membership.id);
        setDecision(null);
      } else {
        const response = await apiRequest('POST', `/api/tenant-users/invitations/${decision.invitation.id}/${decision.kind}`);
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success !== true) throw new Error(serverMessage(body) ?? 'The invitation decision was not confirmed.');
        notify(decision.kind === 'accept' ? 'Invitation accepted. The organization is now available in your organization list; your current organization has not changed.' : 'Invitation declined. No membership was added.');
        setEpoch((value) => value + 1); setDecision(null); setOpen(true);
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'The request could not be completed.', 'error'); }
    finally { sending.current = false; setBusy(false); }
  };
  const form = decisionForm(decision, busy);
  return <>
    <button className="tb-btn" aria-label="Organizations and invitations" title="Organizations and invitations" onClick={() => {
      if (ceremonyOpen()) { notify('Finish or cancel the open governed form before changing organization access.', 'error'); return; }
      setOpen(true); setEpoch((value) => value + 1);
    }}>{I.users ?? I.user}{!invitations.loading && !invitations.error && invitations.rows.length > 0 ? <span aria-hidden="true">{invitations.rows.length}</span> : null}</button>
    {open && <><div className="tt-scrim" onClick={() => setOpen(false)} /><aside className="tt-panel" ref={ref} role="dialog" aria-modal="true" aria-label="Organizations and invitations" tabIndex={-1}>
      <div className="tt-head"><b>Organizations and invitations</b><button className="tt-close" aria-label="Close organizations and invitations" onClick={() => setOpen(false)}>Close</button></div>
      <div className="tt-scroll">
        <h3>Your organizations</h3>
        <OrganizationList state={memberships} choose={choose} />
        <h3>Pending invitations</h3>
        <InvitationList state={invitations} choose={choose} />
        {(invitations.error || memberships.error) && <button className="btn ghost small" onClick={() => setEpoch((value) => value + 1)}>Retry organization access</button>}
      </div>
    </aside></>}
    {form && <C2CForm config={form} onCancel={() => { if (!sending.current) { setDecision(null); setOpen(true); } }} onSubmit={() => void submit()} />}
    <C2CToast msg={toast} />
  </>;
}
