import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { companySetter, useCompanyLease, useCompanySession, type CompanySession } from './company-documents/companySession';

interface IdentityReview {
  sequenceId: number; profileRevision: number; profileHash: string; filingHash: string;
  variantId?: string | null;
  status: 'unresolved' | 'consistent' | 'reviewed_difference' | 'needs_review'; explanation: string;
  filing: { applicantName: string | null; sponsorAddress: string | null; applicationNumber: string | null };
  differences: Array<{ field: 'name' | 'address'; companyValue: string; filingValue: string | null; missing: boolean }>;
  review: { company_role: string; reviewed_by: number; reviewed_at: string; reason: string } | null;
}
const roles = ['sponsor', 'applicant', 'legal_manufacturer', 'local_representative', 'parent_brand'] as const;
function valid(value: unknown, sequenceId: number, variantId?: string): value is IdentityReview {
  const data = value as IdentityReview | null;
  return data?.sequenceId === sequenceId && Number.isSafeInteger(data.profileRevision) && typeof data.profileHash === 'string'
    && typeof data.filingHash === 'string' && Array.isArray(data.differences) && !!data.filing && typeof data.status === 'string'
    && (data.variantId ?? null) === (variantId ?? null);
}

function IdentityFacts({ data }: { data: IdentityReview }) {
  return <>
      <p>Applicant of record: {data.filing.applicantName || 'Missing'} · Agency application number: {data.filing.applicationNumber || 'Not recorded'}</p>
      <p role="status">{data.status === 'consistent' ? 'The company name and address agree with the recorded filing.' : data.status === 'reviewed_difference' ? 'A role difference has been reviewed for this exact company and filing revision.' : data.status === 'unresolved' ? 'Identity is incomplete. Complete the missing company or filing facts before recording a role difference.' : 'The letterhead differs from the recorded filing identity and needs review.'}</p>
      {data.differences.length > 0 && <table><caption>Identity differences for this sequence</caption><thead><tr><th scope="col">Field</th><th scope="col">Company presentation</th><th scope="col">Filing record</th></tr></thead>
        <tbody>{data.differences.map(difference => <tr key={difference.field}><th scope="row">{difference.field}</th><td>{difference.companyValue || 'Missing'}</td><td>{difference.filingValue || 'Missing'}</td></tr>)}</tbody></table>}
      <p className="company-hint">{data.explanation}</p>
      {data.review && <p>Reviewed company role: {data.review.company_role.replaceAll('_', ' ')} · {data.review.reason}</p>}
  </>;
}

interface IdentityProps { sequenceId: number; profileRevision: number; canReview: boolean; variantId?: string; current?: () => boolean }
interface IdentityState { owner: string; data: IdentityReview | null; error: string; loading: boolean; busy: boolean; role: (typeof roles)[number]; reason: string }
function useIdentityReview(props: IdentityProps & { owner: CompanySession }) {
  const { sequenceId, variantId, owner } = props;
  const [epoch, setEpoch] = useState(0);
  const latest = useRef(props); latest.current = props;
  const enabled = owner.current() && props.current?.() !== false;
  const lease = useCompanyLease(owner, JSON.stringify([epoch, enabled]));
  const [state, setState] = useState<IdentityState>({ owner: lease.key, data: null, error: '', loading: true, busy: false, role: 'sponsor', reason: '' });
  const form = useRef(state); form.current = state;
  const operation = useRef<{ owner: string; pending: boolean } | null>(null);
  const current = () => lease.current() && props.current?.() !== false && latest.current.current?.() !== false;
  const admission = useRef(current); admission.current = current;
  const pending = () => operation.current?.owner === lease.key && operation.current.pending;
  const load = useCallback(async (admitted: () => boolean) => {
    if (!admitted() || (operation.current?.owner === lease.key && operation.current.pending)) return;
    const request = { owner: lease.key, pending: true }; operation.current = request;
    const isCurrent = () => lease.current() && admitted() && operation.current === request;
    const project = companySetter(isCurrent, setState);
    project(previous => ({ ...previous, owner: lease.key, data: null, error: '', loading: true, busy: false, reason: '' }));
    try {
      const result = await apiCall('GET', `/api/client-branding/company-documents/identity?sequenceId=${sequenceId}${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ''}`, undefined, isCurrent);
      if (!result || !isCurrent()) return;
      const verified = result.ok && valid(result.body, sequenceId, variantId);
      project(previous => ({ ...previous, data: verified ? result.body as IdentityReview : null,
        error: verified ? '' : apiErrorText(result, 'The filing identity comparison could not be verified.'), loading: false }));
    } finally {
      if (operation.current === request) { request.pending = false; project(previous => ({ ...previous, loading: false })); }
    }
  }, [lease, sequenceId, variantId]);
  useEffect(() => { if (enabled) void load(admission.current); }, [enabled, load]);
  const active = current() && state.owner === lease.key;
  const canEdit = () => current() && props.canReview && latest.current.canReview && !pending();
  const update = (patch: Partial<IdentityState>) => companySetter(canEdit, setState)(previous => ({ ...previous, ...patch }));
  const save = async () => {
    const { data, reason, role, owner: formOwner } = form.current;
    if (!canEdit() || formOwner !== lease.key || !data || data.status !== 'needs_review' || reason.trim().length < 8) return;
    const request = { owner: lease.key, pending: true }; operation.current = request;
    const isCurrent = () => current() && props.canReview && latest.current.canReview && operation.current === request;
    const project = companySetter(isCurrent, setState);
    project(previous => ({ ...previous, busy: true }));
    try {
      const result = await apiCall('POST', '/api/client-branding/company-documents/identity/review', { sequenceId, ...(variantId ? { variantId } : {}),
        expectedRevision: data.profileRevision, profileHash: data.profileHash, filingHash: data.filingHash, companyRole: role, reason: reason.trim() }, isCurrent);
      if (!result || !isCurrent()) return;
      if (!result.ok || !valid(result.body, sequenceId, variantId)) {
        project(previous => ({ ...previous, error: apiErrorText(result, 'The identity review was not confirmed. Refresh the comparison.') })); return;
      }
      const verified = result.body;
      project(previous => ({ ...previous, data: verified, error: '', reason: '' }));
    } finally {
      if (operation.current === request) { request.pending = false; project(previous => ({ ...previous, busy: false })); }
    }
  };
  return { state, active, update, save, retry: () => { if (!pending()) companySetter(current, setEpoch)(value => value + 1); } };
}
function IdentityComparison(props: IdentityProps & { owner: CompanySession }) {
  const { state, active, update, save, retry } = useIdentityReview(props);
  const { data, role, reason, busy } = state;
  return <section className="company-editor" aria-label="Company and filing identity comparison">
    <h3>Company identity and filing identity</h3>
    {active && state.loading && <p role="status">Comparing the letterhead with this filing’s recorded identity…</p>}
    {active && state.error && <p role="alert">{state.error} <button type="button" className="btn ghost small" onClick={retry}>Retry identity comparison</button></p>}
    {active && data && <>
      <IdentityFacts data={data} />
      {props.canReview && data.status === 'needs_review' && <fieldset disabled={busy}>
        <legend>Review the company’s role in this filing</legend>
        <label className="company-field"><span>Company role</span><select value={role} onChange={event => update({ role: event.target.value as typeof role })}>{roles.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="company-field"><span>Reason this role explains the difference</span><input minLength={8} maxLength={2000} value={reason} onChange={event => update({ reason: event.target.value })} /></label>
        <button type="button" className="btn small" disabled={reason.trim().length < 8} onClick={() => void save()}>{busy ? 'Recording review…' : 'Record reviewed role difference'}</button>
      </fieldset>}
    </>}
  </section>;
}

/** A role difference is explicitly reviewed, never copied over the filing identity. */
export function CompanyFilingIdentityReview(props: IdentityProps) {
  const session = useCompanySession();
  const owner = useCompanyLease(session, JSON.stringify([props.sequenceId, props.profileRevision, props.variantId ?? null, props.canReview]));
  return <IdentityComparison key={owner.key} {...props} owner={owner} />;
}
