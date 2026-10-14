/** A verified organization change always opens a fresh shell, with no old program or AnA state. */
import React from 'react';
import { apiRequest, extractApiError, queryClient, redactInternals } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { ErrorState, useLiveData, type DataState } from './dataConnect';

const LIST = '/api/organizations?membershipOnly=true';
const SELECT = '/api/auth/enterprise/select-organization';
const DESTINATION = '/concept2cure/projects';
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

class SwitchRefusal extends Error {
  constructor(message: string, readonly requiresSignIn: boolean, cause?: unknown) { super(message, { cause }); }
}
const expiredOrUnknown = (status: number) => status >= 500 || status === 401;
function sessionMatches(userId: string, organizationId: string): boolean {
  const caller = authService.getUser();
  return !!getAuthToken() && String(caller?.id) === userId && String(caller?.organizationId) === organizationId;
}
async function selectSession(organizationId: string): Promise<string> {
  const response = await apiRequest('POST', SELECT, { organizationId });
  const answer = await response.json() as { success?: boolean; token?: unknown; organization?: { id?: unknown } };
  if (!response.ok || answer?.success !== true) {
    throw new SwitchRefusal(extractApiError(answer, response.status).message, expiredOrUnknown(response.status));
  }
  // A success has already spent the previous access token. Missing credentials
  // cannot be retried as a still-authenticated request in the old organization.
  if (typeof answer.token !== 'string' || !answer.token || String(answer.organization?.id) !== organizationId) {
    throw new SwitchRefusal('The new organisation session could not be confirmed. Sign in again before continuing.', true);
  }
  return answer.token;
}
function switchFailure(failure: unknown, rotated: boolean): SwitchRefusal {
  if (failure instanceof SwitchRefusal) return failure;
  const status = (failure as { status?: number } | null)?.status;
  if (rotated || !status || expiredOrUnknown(status)) {
    return new SwitchRefusal(rotated
      ? 'The new organisation could not be opened. Sign in again before continuing.'
      : 'The organisation switch could not be confirmed. Sign in again before continuing.', true, failure);
  }
  return new SwitchRefusal(redactInternals(failure instanceof Error ? failure.message : null, 'The organisation was not switched. Try again.'), false, failure);
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
      <p className="de-desc">Switch to {label(chosen)}? Your saved records remain in their organisation. Unsaved changes on this page are discarded.</p>
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
  const read = useLiveData<Organizations>(LIST, [revision, attempt], isOrganizations);
  const [selected, setSelected] = React.useState(organizationId);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = React.useState(false);
  const chosen = read.data?.organizations.find(org => org.id === selected);
  const failClosed = (message: string) => {
    setRequiresSignIn(true);
    setError(message);
    authService.endSession(null);
  };
  const change = async () => {
    if (lock.current || !chosen || selected === organizationId) return;
    if (!sessionMatches(userId, organizationId)) {
      setError('Your session has changed. Close Account and open it again before switching organisations.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    let rotated = false;
    try {
      const token = await selectSession(selected);
      // The route spends the previous access token before it answers success.
      rotated = true;
      const persistent = !sessionStorage.getItem('trialsage_access_token') && Boolean(localStorage.getItem('trialsage_access_token'));
      const user = await authService.adoptSession(token, persistent, { userId, organizationId: selected });
      if (!user) throw new Error('The new organisation session could not be verified. Sign in again before continuing.');
      // The current program is a tab mirror. Never restore it into a different
      // tenant; a fresh document also discards conversation and entitlement state.
      sessionStorage.removeItem('c2c.shell-project');
      delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
      queryClient.clear();
      navigate(DESTINATION);
      onClose?.();
    } catch (failure) {
      const refusal = switchFailure(failure, rotated);
      if (refusal.requiresSignIn) failClosed(refusal.message);
      else setError(refusal.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h3 className="de-h-eye" id={`${id}-heading`}>Switch organisation</h3>
      <p className="de-desc">Open an organisation where you have membership. Save your work before switching; your current program and conversation close.</p>
      {error && <ErrorState variant="inline" title="The organisation switch was not completed." message={error} />}
      {requiresSignIn ? <div className="de-field"><button type="button" className="de-btn ghost" onClick={() => navigate('/concept2cure/login')}>Sign in again</button></div> :
        <OrganizationReadBody read={read} retry={() => setAttempt(value => value + 1)} organizationId={organizationId} selected={selected} chosen={chosen}
          fieldId={`${id}-select`} confirming={confirming} busy={busy}
          onSelect={value => { setSelected(value); setError(null); }} onConfirm={() => setConfirming(true)} onCancel={() => setConfirming(false)} onSwitch={() => void change()} />}
    </section>
  );
}
