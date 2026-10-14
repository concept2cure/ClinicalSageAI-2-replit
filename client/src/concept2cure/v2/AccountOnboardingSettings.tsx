/**
 * Self-service onboarding in the existing Account drawer (D2).
 * Membership invitations and reporting persona use the session user's routes;
 * neither accepts a client-selected user or tenant. Accepting an invitation
 * creates membership, not a new session. The current tenant is left untouched.
 */
import React from 'react';
import { apiRequest, extractApiError, queryClient, redactInternals } from '@/lib/queryClient';
import { useAuth } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { type ReportPersona } from '@shared/constants/domain/report-personas';
import { ASSIGNABLE_ORG_ROLES } from '@shared/constants/org-roles';
import { EmptyState, ErrorState } from './dataConnect';
import { I } from './icons';
import { isPersonaRead, reportPersonaKey } from './reportingPersona';
import { OrganizationSwitcher } from './OrganizationSwitcher';

type Read<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; error: string };
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';
const INBOX = '/api/tenant-users/invitations/mine';
const PERSONA = '/api/users/me/persona';
const SESSION_CHANGED = 'Your session has changed. Close Account and open it again before changing these settings.';
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positiveId = (v: unknown): boolean => (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0;

/** The canonical API client supplies bearer credentials and redacts refusals. No dev-user fallback. */
async function request(method: Method, path: string, body?: unknown): Promise<unknown> {
  if (!getAuthToken()) throw new Error(SESSION_CHANGED);
  try {
    const response = await apiRequest(method, path, body);
    const result: unknown = await response.json();
    if (!response.ok || (isObject(result) && result.success === false)) {
      throw new Error(extractApiError(result, response.status).message);
    }
    return result;
  } catch (error) {
    throw new Error(redactInternals(error instanceof Error ? error.message : null, 'The request could not be completed. Try again.'), { cause: error });
  }
}

/** Ignore late reads after this account closes or a newer retry completes. */
function useRead<T>(path: string, guard: (v: unknown) => v is T) {
  const [read, setRead] = React.useState<Read<T>>({ state: 'loading' });
  const version = React.useRef(0);
  const mounted = React.useRef(true);
  const load = React.useCallback(async () => {
    const current = ++version.current;
    setRead({ state: 'loading' });
    try {
      const value = await request('GET', path);
      if (!guard(value)) throw new Error('The server did not return the requested settings. Try again.');
      if (mounted.current && current === version.current) setRead({ state: 'ready', data: value });
      return true;
    } catch (error) {
      if (mounted.current && current === version.current) setRead({ state: 'error', error: (error as Error).message });
      return false;
    }
  }, [path, guard]);
  React.useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);
  return { read, load, setRead };
}

function Outcome({ text }: { text: string | null }) {
  return text ? <div className="de-field"><p className="de-desc" role="status">{text}</p></div> : null;
}

interface Invitation {
  id: number;
  organizationId: number;
  email: string;
  role: string;
  status: 'pending';
}
function isInvitationList(v: unknown): v is Invitation[] {
  return Array.isArray(v) && v.every(row => isObject(row) && positiveId(row.id) && positiveId(row.organizationId) &&
    typeof row.email === 'string' && row.email.trim() && row.status === 'pending' &&
    (ASSIGNABLE_ORG_ROLES as readonly unknown[]).includes(row.role)) &&
    new Set(v.map(row => String(row.id))).size === v.length;
}

function InvitationsSection({ userId, onMembershipChange }: { userId: string; onMembershipChange: () => void }) {
  const heading = React.useId();
  const { read, load } = useRead(INBOX, isInvitationList);
  const [confirm, setConfirm] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const lock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const respond = async (invitation: Invitation, action: 'accept' | 'decline') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(invitation.id);
    setError(null);
    setNote(null);
    try {
      const result = await request('POST', `/api/tenant-users/invitations/${invitation.id}/${action}`);
      if (!isObject(result) || result.success !== true) {
        throw new Error('The server did not confirm the invitation response. Reload invitations before trying again.');
      }
      if (action === 'accept' && (!isObject(result.data) || String(result.data.invitationId) !== String(invitation.id) ||
          String(result.data.organizationId) !== String(invitation.organizationId) || String(result.data.userId) !== userId ||
          result.data.role !== invitation.role || result.data.status !== 'accepted')) {
        throw new Error('The server did not confirm membership for this invitation. Reload invitations before trying again.');
      }
      setConfirm(null);
      setNote(`Invitation ${action === 'accept' ? 'accepted' : 'declined'} for organisation ${invitation.organizationId}.`);
      if (action === 'accept') onMembershipChange();
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby={heading}>
      <h3 className="de-h-eye" id={heading}>Invitations</h3>
      <p className="de-desc">Accept an invitation to join that organisation. Your current session stays in its existing organisation.</p>
      <Outcome text={note} />
      {error && <ErrorState variant="inline" title="The invitation response was not confirmed." message={error} />}
      {read.state === 'loading' && <EmptyState busy icon={I.user} title="Reading invitations" />}
      {read.state === 'error' && <ErrorState variant="inline" title="Your invitations could not be read." message={read.error} retry={() => void load()} />}
      {read.state === 'ready' && (read.data.length === 0 ? <p className="de-desc">No pending invitations.</p> : read.data.map(invitation => (
        <div className="de-field" key={invitation.id}>
          <div className="de-quote">
            <div className="de-label">Organisation {invitation.organizationId}</div>
            <p className="de-desc">Invited as {invitation.role} · {invitation.email}</p>
            {confirm === invitation.id ? (
              <>
                <p className="de-desc">Declining this invitation does not create membership. The invitation response remains recorded.</p>
                <button type="button" className="de-btn ghost" disabled={busy !== null} onClick={() => void respond(invitation, 'decline')}>
                  {busy === invitation.id ? 'Declining…' : 'Confirm decline'}
                </button>{' '}
                <button type="button" className="de-btn ghost" disabled={busy !== null} onClick={() => setConfirm(null)}>Cancel decline</button>
              </>
            ) : (
              <>
                <button type="button" className="de-btn ghost" aria-label={`Accept invitation to organisation ${invitation.organizationId}`} disabled={busy !== null} onClick={() => void respond(invitation, 'accept')}>
                  {busy === invitation.id ? 'Accepting…' : 'Accept invitation'}
                </button>{' '}
                <button type="button" className="de-btn ghost" aria-label={`Decline invitation to organisation ${invitation.organizationId}`} disabled={busy !== null} onClick={() => { setConfirm(invitation.id); setError(null); }}>Decline</button>
              </>
            )}
          </div>
        </div>
      )))}
    </section>
  );
}

/** Sentence-case display for the shared enum; access roles never come from this selector. */
const PERSONA_LABELS: Record<ReportPersona, string> = {
  executive: 'Executive', ra_lead: 'Regulatory affairs lead', ra_ops: 'Regulatory affairs operations',
  reg_strategy: 'Regulatory strategy', medical_writer: 'Medical writer', qa: 'Quality assurance', auditor: 'Auditor',
  pm: 'Program manager', clinical_ops: 'Clinical operations', tmf_lead: 'Trial master file lead',
  submission_coordinator: 'Submission coordinator', compliance_officer: 'Compliance officer',
  nonclinical_lead: 'Nonclinical lead', labeling_lead: 'Labeling lead', biosafety_officer: 'Biosafety officer',
  iacuc_coordinator: 'IACUC coordinator', pi: 'Principal investigator', research_admin: 'Research administrator',
  research_ops: 'Research operations', research_security: 'Research security', finance: 'Finance',
};

function ReportingRoleSection({ userId, organizationId }: { userId: string; organizationId: string }) {
  const id = React.useId();
  const { read, load, setRead } = useRead(PERSONA, isPersonaRead);
  const [persona, setPersona] = React.useState<ReportPersona | ''>('');
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  React.useEffect(() => { if (read.state === 'ready') setPersona(read.data.persona ?? ''); }, [read]);
  const save = async () => {
    if (lock.current || read.state !== 'ready' || (persona && !read.data.availablePersonas.includes(persona))) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await request('PUT', PERSONA, { persona: persona || null });
      if (!isObject(result) || result.success !== true || result.persona !== (persona || null) || result.role !== read.data.role) {
        throw new Error('The server did not confirm the reporting role. Reload this setting before trying again.');
      }
      const confirmed = { ...read.data, persona: persona || null };
      setRead({ state: 'ready', data: confirmed });
      queryClient.setQueryData(reportPersonaKey(userId, organizationId), confirmed);
      setNote('Reporting role saved. Your access role is unchanged.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h3 className="de-h-eye" id={`${id}-heading`}>Reporting role</h3>
      <p className="de-desc">Choose the work you perform in your current organisation. This personalises reporting; it does not grant permissions.</p>
      {read.state === 'loading' && <EmptyState busy icon={I.user} title="Reading your reporting role" />}
      {read.state === 'error' && <ErrorState variant="inline" title="Your reporting role could not be read." message={read.error} retry={() => void load()} />}
      {read.state === 'ready' && (
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <div className="de-field">
            <label className="de-label" htmlFor={`${id}-persona`}>Reporting role</label>
            <select id={`${id}-persona`} className="de-select" value={persona} disabled={busy} onChange={event => { setPersona(event.target.value as ReportPersona | ''); setNote(null); }}>
              <option value="">Not set</option>
              {read.data.availablePersonas.map(value => <option key={value} value={value}>{PERSONA_LABELS[value]}</option>)}
            </select>
          </div>
          {error && <ErrorState variant="inline" title="Your reporting role was not confirmed." message={error} retry={() => void load()} />}
          <Outcome text={note} />
          <div className="de-field"><button type="submit" className="de-btn ghost" disabled={busy || persona === (read.data.persona ?? '')}>{busy ? 'Saving reporting role…' : 'Save reporting role'}</button></div>
        </form>
      )}
    </section>
  );
}

/** A fresh Account read owns identity. A session change removes every editing control. */
export function AccountOnboardingSettings({ userId, organizationId, onClose }: { userId: string; organizationId: string; onClose?: () => void }) {
  const { user } = useAuth();
  const [membershipVersion, setMembershipVersion] = React.useState(0);
  if (!getAuthToken() || !user || !positiveId(userId) || !positiveId(organizationId) ||
      String(user.id) !== String(userId) || String(user.organizationId) !== String(organizationId)) {
    return <ErrorState variant="inline" title="Account settings are unavailable for this session." message={SESSION_CHANGED} />;
  }
  return (
    <React.Fragment key={`${userId}:${organizationId}`}>
      <InvitationsSection userId={userId} onMembershipChange={() => setMembershipVersion(value => value + 1)} />
      <div className="acct-sep" />
      <OrganizationSwitcher userId={userId} organizationId={organizationId} revision={membershipVersion} onClose={onClose} />
      <div className="acct-sep" />
      <ReportingRoleSection userId={userId} organizationId={organizationId} />
    </React.Fragment>
  );
}
