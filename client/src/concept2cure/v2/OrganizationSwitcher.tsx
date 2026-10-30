/** A verified organization change always opens a fresh shell, with no old program or AnA state. */
import React from 'react';
import { redactInternals } from '@/lib/queryClient';
import { captureOrganizationOwner, OrganizationSwitchFailure, switchOrganization } from './switchOrganization';
import { ErrorState, liveGetOrNull, type DataState } from './dataConnect';

const LIST = '/api/organizations?membershipOnly=true';
const SESSION_CHANGED = 'Your session has changed. Reload this page before continuing.';
interface Organization { id: string; name: string | null }
interface Organizations { success: true; organizations: Organization[] }
function isOrganizations(v: unknown): v is Organizations {
  const value = v as Organizations | null;
  return !!value && value.success === true && Array.isArray(value.organizations) && value.organizations.every(org =>
    org && typeof org.id === 'string' && /^\d+$/.test(org.id) && Number.isSafeInteger(Number(org.id)) && Number(org.id) > 0 &&
    (typeof org.name === 'string' || org.name === null)) && new Set(value.organizations.map(org => org.id)).size === value.organizations.length;
}
const label = (org: Organization) => org.name?.trim() || `Organisation ${org.id}`;
const navigateTo = (path: string) => window.location.assign(path);

/** Membership choices belong to the account/workspace that requested them. */
function useMemberships(userId: string, organizationId: string, revision: number, attempt: number): DataState<Organizations> {
  const scope = `${userId}:${organizationId}`;
  const [read, setRead] = React.useState<DataState<Organizations> & { scope: string }>({ scope, data: null, loading: true, empty: false });
  React.useEffect(() => {
    let retired = false;
    setRead({ scope, data: null, loading: true, empty: false });
    const load = async () => {
      try {
        const owner = captureOrganizationOwner({ userId, organizationId });
        const reply = await liveGetOrNull<Organizations>(LIST, isOrganizations, owner.headers);
        if (retired) return;
        if (!owner.current()) throw new Error(SESSION_CHANGED);
        if (reply.error || !reply.data || reply.meta?.pendingStore === true) throw new Error(reply.error || 'Your organization memberships could not be read.');
        setRead({ scope, data: reply.data, loading: false, empty: reply.data.organizations.length === 0 });
      } catch (failure) {
        if (!retired) setRead({ scope, data: null, loading: false, empty: false, error: redactInternals(failure instanceof Error ? failure.message : null, 'Your organization memberships could not be read.') });
      }
    };
    void load();
    return () => { retired = true; };
  }, [scope, userId, organizationId, revision, attempt]);
  return read.scope === scope ? read : { data: null, loading: true, empty: false };
}
interface ChoiceProps {
  organizations: Organization[];
  organizationId: string;
  selected: string;
  chosen: Organization | undefined;
  fieldId: string;
  confirming: boolean;
  busy: boolean;
  onSelect: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSwitch: () => void;
}
function OrganizationChoice({ organizations, organizationId, selected, chosen, fieldId, confirming, busy, onSelect, onConfirm, onCancel, onSwitch }: ChoiceProps) {
  return <div className="de-field">
    <label className="de-label" htmlFor={fieldId}>Organisation to open</label>
    <select id={fieldId} className="de-select" value={selected} disabled={busy || confirming} onChange={event => onSelect(event.target.value)}>
      {!organizations.some(org => org.id === organizationId) && <option value="">Select an organisation</option>}
      {organizations.map(org => <option key={org.id} value={org.id}>{label(org)}{org.id === organizationId ? ' (current)' : ''}</option>)}
    </select>
    {confirming && chosen ? <>
      <p className="de-desc">Switch to {label(chosen)}? Your saved records remain in their organisation. Save or resolve unsaved work before switching.</p>
      <button type="button" className="de-btn ghost" disabled={busy} onClick={onSwitch}>{busy ? 'Switching…' : 'Confirm switch'}</button>{' '}
      <button type="button" className="de-btn ghost" disabled={busy} onClick={onCancel}>Cancel switch</button>
    </> : <button type="button" className="de-btn ghost" disabled={busy || !chosen || selected === organizationId} onClick={onConfirm}>Switch organisation</button>}
  </div>;
}
function OrganizationReadBody({ read, retry, ...choices }: { read: DataState<Organizations>; retry: () => void } & Omit<ChoiceProps, 'organizations'>) {
  if (read.loading) return <p className="de-desc" role="status">Reading your organisations…</p>;
  if (read.error) return <ErrorState variant="inline" title="Your organisations could not be read." message={read.error} retry={retry} />;
  if (!read.data) return null;
  if (!read.data.organizations.length) return <p className="de-desc">No organisation memberships were returned.</p>;
  return <OrganizationChoice organizations={read.data.organizations} {...choices} />;
}

export function OrganizationSwitcher({ userId, organizationId, revision = 0, onClose, navigate = navigateTo }: {
  userId: string;
  organizationId: string;
  revision?: number;
  onClose?: () => void;
  navigate?: (path: string) => void;
}) {
  const id = React.useId();
  const [attempt, setAttempt] = React.useState(0);
  const read = useMemberships(userId, organizationId, revision, attempt);
  const [selected, setSelected] = React.useState(organizationId);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = React.useState(false);
  const chosen = read.data?.organizations.find(org => org.id === selected);
  const change = async () => {
    if (lock.current || !chosen || selected === organizationId) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await switchOrganization(Number(selected), navigate, { userId, organizationId });
      onClose?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The organisation switch could not be completed.');
      if (failure instanceof OrganizationSwitchFailure && failure.requiresSignIn) setRequiresSignIn(true);
    } finally { lock.current = false; setBusy(false); }
  };
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h3 className="de-h-eye" id={`${id}-heading`}>Switch organisation</h3>
      <p className="de-desc">Open an organisation where you have membership. Save your work before switching; your current project and conversation close.</p>
      {error && <ErrorState variant="inline" title="The organisation switch was not completed." message={error} />}
      {requiresSignIn ? <div className="de-field"><button type="button" className="de-btn ghost" onClick={() => navigate('/concept2cure/login')}>Sign in again</button></div> :
        <OrganizationReadBody read={read} retry={() => setAttempt(value => value + 1)} organizationId={organizationId} selected={selected} chosen={chosen}
          fieldId={`${id}-select`} confirming={confirming} busy={busy}
          onSelect={value => { setSelected(value); setError(null); }} onConfirm={() => setConfirming(true)} onCancel={() => setConfirming(false)} onSwitch={() => void change()} />}
    </section>
  );
}
