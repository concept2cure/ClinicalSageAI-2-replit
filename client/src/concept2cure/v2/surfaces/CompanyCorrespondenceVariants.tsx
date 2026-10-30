import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanyDesignSummary } from '@shared/company-document-designs';
import { apiCall, apiErrorText } from '../apiCall';
import { companySetter, useCompanyLease, useCompanySession, type CompanySession } from './company-documents/companySession';

interface VariantProps { sequenceId: number; value: string; onChange: (value: string) => void; current?: () => boolean }
interface VariantState { owner: string; rows: CompanyDesignSummary[]; next: string | null; loading: boolean; error: string }
interface VariantPage { data: CompanyDesignSummary[]; nextBefore?: string | null }
function validPage(value: unknown): value is VariantPage {
  const page = value as Partial<VariantPage> | null;
  return Array.isArray(page?.data) && page.data.every(row => row && row.state === 'published' && typeof row.id === 'string' && typeof row.name === 'string');
}
function useVariants(props: VariantProps & { owner: CompanySession }) {
  const { sequenceId, owner } = props;
  const [epoch, setEpoch] = useState(0);
  const latest = useRef(props); latest.current = props;
  const enabled = owner.current() && props.current?.() !== false;
  const lease = useCompanyLease(owner, JSON.stringify([epoch, enabled]));
  const [state, setState] = useState<VariantState>({ owner: lease.key, rows: [], next: null, loading: true, error: '' });
  const operation = useRef<{ owner: string; pending: boolean } | null>(null);
  const current = () => lease.current() && props.current?.() !== false && latest.current.current?.() !== false;
  const admission = useRef(current); admission.current = current;
  const fetchPage = useCallback(async (before: string | undefined, admitted: () => boolean) => {
    if (!admitted() || (operation.current?.owner === lease.key && operation.current.pending)) return;
    const request = { owner: lease.key, pending: true }; operation.current = request;
    const isCurrent = () => lease.current() && admitted() && operation.current === request;
    const project = companySetter(isCurrent, setState);
    project(previous => ({ ...previous, owner: lease.key, rows: before ? previous.rows : [], next: before ? previous.next : null, loading: true, error: '' }));
    try {
      const result = await apiCall('GET', `/api/client-branding/company-documents/designs?state=published&sequenceId=${sequenceId}&limit=25${before ? `&before=${encodeURIComponent(before)}` : ''}`, undefined, isCurrent);
      if (!result || !isCurrent()) return;
      if (!result.ok || !validPage(result.body)) {
        project(previous => ({ ...previous, loading: false, error: apiErrorText(result, 'Published stationery variants could not be read for this sequence.') })); return;
      }
      const page = result.body;
      project(previous => ({ owner: lease.key, rows: before ? [...previous.rows, ...page.data.filter(row => !previous.rows.some(prior => prior.id === row.id))] : page.data,
        next: typeof page.nextBefore === 'string' ? page.nextBefore : null, loading: false, error: '' }));
    } finally {
      if (operation.current === request) { request.pending = false; project(previous => ({ ...previous, loading: false })); }
    }
  }, [lease, sequenceId]);
  useEffect(() => { if (enabled) void fetchPage(undefined, admission.current); }, [enabled, fetchPage]);
  const active = current() && state.owner === lease.key;
  const select = (value: string) => {
    if (!active || !current() || (operation.current?.owner === lease.key && operation.current.pending) || (value !== '' && !state.rows.some(row => row.id === value && row.state === 'published'))) return;
    props.onChange(value);
  };
  return { state, active, select, loadMore: () => { if (active && state.next) void fetchPage(state.next, current); },
    retry: () => companySetter(current, setEpoch)(previous => previous + 1) };
}
function VariantSelector(props: VariantProps & { owner: CompanySession }) {
  const { state, active, select, loadMore, retry } = useVariants(props);
  return <div className="company-register">
    <label className="company-field"><span>Correspondence stationery for this output</span><select value={active ? props.value : ''} disabled={!active || state.loading} onChange={event => select(event.target.value)}>
      <option value="">Saved organization presentation preference</option>{active && state.rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <p className="company-hint">An explicitly selected published variant applies to this correspondence only. Project, market, language and subsidiary restrictions are checked against the recorded filing. The organization default is unchanged.</p>
    {active && state.next && <button type="button" className="btn ghost small" disabled={state.loading} onClick={loadMore}>Load more published variants</button>}
    {active && state.loading && <p role="status">Reading published stationery…</p>}
    {active && state.error && <p role="alert">{state.error} <button type="button" className="btn ghost small" onClick={retry}>Retry stationery variants</button></p>}
  </div>;
}

/** Only server-admitted published variants are selectable; selection applies to this output. */
export function CompanyCorrespondenceVariants(props: VariantProps) {
  const session = useCompanySession();
  const owner = useCompanyLease(session, JSON.stringify(props.sequenceId));
  return <VariantSelector key={owner.key} {...props} owner={owner} />;
}
