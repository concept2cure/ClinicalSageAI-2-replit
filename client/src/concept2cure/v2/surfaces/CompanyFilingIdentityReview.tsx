import React, { useEffect, useRef, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';

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

/** A role difference is explicitly reviewed, never copied over the filing identity. */
export function CompanyFilingIdentityReview({ sequenceId, profileRevision, canReview, variantId }: { sequenceId: number; profileRevision: number; canReview: boolean; variantId?: string }) {
  const [state, setState] = useState<{ owner: string; data: IdentityReview | null; error: string; loading: boolean }>({ owner: '', data: null, error: '', loading: true });
  const [role, setRole] = useState<(typeof roles)[number]>('sponsor'), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [epoch, setEpoch] = useState(0);
  const generation = useRef({ value: 0 }), owner = `${getJwtOrgId()}:${getAuthToken()}:${sequenceId}:${profileRevision}:${variantId}`;
  useEffect(() => {
    const currentSession = generation.current;
    const ticket = ++currentSession.value; setState({ owner, data: null, error: '', loading: true }); setReason(''); setBusy(false);
    void apiCall('GET', `/api/client-branding/company-documents/identity?sequenceId=${sequenceId}${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ''}`).then(result => {
      if (ticket !== generation.current.value) return;
      setState({ owner, data: result.ok && valid(result.body, sequenceId, variantId) ? result.body : null,
        error: result.ok && valid(result.body, sequenceId, variantId) ? '' : apiErrorText(result, 'The filing identity comparison could not be verified.'), loading: false });
    });
    return () => { currentSession.value++; };
  }, [owner, sequenceId, variantId, epoch]);
  const data = state.owner === owner ? state.data : null;
  const save = async () => {
    if (!data || busy || !canReview || reason.trim().length < 8) return;
    const ticket = generation.current.value; setBusy(true);
    const result = await apiCall('POST', '/api/client-branding/company-documents/identity/review', { sequenceId, ...(variantId ? { variantId } : {}),
      expectedRevision: data.profileRevision, profileHash: data.profileHash, filingHash: data.filingHash, companyRole: role, reason: reason.trim() });
    if (ticket !== generation.current.value) return;
    setBusy(false);
    if (!result.ok || !valid(result.body, sequenceId, variantId)) { setState(previous => ({ ...previous, error: apiErrorText(result, 'The identity review was not confirmed. Refresh the comparison.') })); return; }
    setState({ owner, data: result.body, error: '', loading: false }); setReason('');
  };
  return <section className="company-editor" aria-label="Company and filing identity comparison">
    <h3>Company identity and filing identity</h3>
    {(state.owner !== owner || state.loading) && <p role="status">Comparing the letterhead with this filing’s recorded identity…</p>}
    {state.owner === owner && state.error && <p role="alert">{state.error} <button type="button" className="btn ghost small" onClick={() => setEpoch(value => value + 1)}>Retry identity comparison</button></p>}
    {data && <>
      <IdentityFacts data={data} />
      {canReview && data.status === 'needs_review' && <fieldset disabled={busy}>
        <legend>Review the company’s role in this filing</legend>
        <label className="company-field"><span>Company role</span><select value={role} onChange={event => setRole(event.target.value as typeof role)}>{roles.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
        <label className="company-field"><span>Reason this role explains the difference</span><input minLength={8} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button type="button" className="btn small" disabled={reason.trim().length < 8} onClick={() => void save()}>{busy ? 'Recording review…' : 'Record reviewed role difference'}</button>
      </fieldset>}
    </>}
  </section>;
}
