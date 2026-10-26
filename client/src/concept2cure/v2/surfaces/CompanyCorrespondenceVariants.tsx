import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanyDesignSummary } from '@shared/company-document-designs';
import { apiCall, apiErrorText } from '../apiCall';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';

/** Only server-admitted published variants are selectable; selection applies to this output. */
export function CompanyCorrespondenceVariants({ sequenceId, value, onChange }: { sequenceId: number; value: string; onChange: (value: string) => void }) {
  const [state, setState] = useState<{ owner: string; rows: CompanyDesignSummary[]; next: string | null; loading: boolean; error: string }>({ owner: '', rows: [], next: null, loading: false, error: '' });
  const [epoch, setEpoch] = useState(0), generation = useRef({ value: 0 });
  const owner = `${getJwtOrgId()}:${getAuthToken()}:${sequenceId}`;
  const fetchPage = useCallback(async (before?: string, ticket = generation.current.value) => {
    setState(previous => ({ ...previous, owner, loading: true, error: '' }));
    const result = await apiCall('GET', `/api/client-branding/company-documents/designs?state=published&sequenceId=${sequenceId}&limit=25${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    if (ticket !== generation.current.value) return;
    const data = result.body as { data?: CompanyDesignSummary[]; nextBefore?: string | null } | null;
    if (!result.ok || !Array.isArray(data?.data) || data.data.some(row => row.state !== 'published' || typeof row.id !== 'string' || typeof row.name !== 'string')) {
      setState(previous => ({ ...previous, loading: false, error: apiErrorText(result, 'Published stationery variants could not be read for this sequence.') })); return;
    }
    setState(previous => ({ owner, rows: before ? [...previous.rows, ...data.data!.filter(row => !previous.rows.some(prior => prior.id === row.id))] : data.data!,
      next: typeof data.nextBefore === 'string' ? data.nextBefore : null, loading: false, error: '' }));
  }, [owner, sequenceId]);
  useEffect(() => {
    const currentSession = generation.current;
    const ticket = ++currentSession.value; setState({ owner, rows: [], next: null, loading: true, error: '' });
    void fetchPage(undefined, ticket);
    return () => { currentSession.value++; };
  }, [owner, epoch, fetchPage]);
  const active = state.owner === owner;
  return <div className="company-register">
    <label className="company-field"><span>Correspondence stationery for this output</span><select value={value} disabled={!active || state.loading} onChange={event => onChange(event.target.value)}>
      <option value="">Saved organization presentation preference</option>{active && state.rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <p className="company-hint">An explicitly selected published variant applies to this correspondence only. Project, market, language and subsidiary restrictions are checked against the recorded filing. The organization default is unchanged.</p>
    {active && state.next && <button type="button" className="btn ghost small" disabled={state.loading} onClick={() => void fetchPage(state.next!)}>Load more published variants</button>}
    {active && state.loading && <p role="status">Reading published stationery…</p>}
    {active && state.error && <p role="alert">{state.error} <button type="button" className="btn ghost small" onClick={() => setEpoch(previous => previous + 1)}>Retry stationery variants</button></p>}
  </div>;
}
