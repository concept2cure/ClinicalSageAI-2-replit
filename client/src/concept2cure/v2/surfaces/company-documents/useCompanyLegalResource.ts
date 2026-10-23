import { useEffect, useRef, useState } from 'react';
import type { CompanyDocumentsResponse } from '@shared/company-documents';
import { apiCall, apiErrorText } from '../../apiCall';
import { useCompanyLease, useCompanySession, type CompanySession } from './companySession';

export const COMPANY_LEGAL_PATH = '/api/client-branding/company-documents';
export const useCompanyLegalSession = useCompanySession;
export function companyLegalOwner(session: CompanySession, key: string) { return JSON.stringify([session.key, key]); }
export function companyLegalReceipt(value: unknown): value is CompanyDocumentsResponse {
  const body = value as CompanyDocumentsResponse | null;
  return Boolean(body && typeof body.canManage === 'boolean' && body.data?.version === 1 && Number.isSafeInteger(body.data.revision) && Array.isArray(body.data.legalDocuments));
}
export function useCompanyLegalResource<T>(path: string, token: string, key: string, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const session = useCompanySession(token);
  const lease = useCompanyLease(session, JSON.stringify([path, key, attempt, enabled]));
  const owner = lease.key;
  const current = useRef(owner); current.current = owner;
  const [state, setState] = useState<{ owner: string; data: T | null; loading: boolean; error: string }>({ owner, data: null, loading: enabled, error: '' });
  useEffect(() => {
    let active = true;
    setState({ owner, data: null, loading: enabled, error: '' });
    const isCurrent = () => active && lease.current() && current.current === owner;
    if (enabled && isCurrent()) void apiCall('GET', path, undefined, isCurrent).then(result => {
      if (!result || !isCurrent()) return;
      setState({ owner, data: result.ok ? result.body as T : null, loading: false,
        error: result.ok && result.body ? '' : apiErrorText(result, 'The legal workflow could not be verified. Retry to read the current record.') });
    });
    return () => { active = false; };
  }, [owner, path, enabled, lease]);
  return { ...(lease.current() && state.owner === owner ? state : { owner, data: null, loading: enabled, error: '' }), retry: () => { if (lease.current()) setAttempt(value => value + 1); } };
}
export function useCompanyLegalAction(token: string, key: string, onSaved: (result: CompanyDocumentsResponse) => void) {
  const session = useCompanySession(token);
  const lease = useCompanyLease(session, key);
  const owner = lease.key;
  const current = useRef(owner); current.current = owner;
  const pending = useRef('');
  const [state, setState] = useState({ owner, busy: false, notice: '', error: false });
  const run = async (method: 'POST' | 'PUT', path: string, body: unknown) => {
    const isCurrent = () => lease.current() && current.current === owner;
    if (!isCurrent() || pending.current === owner || (state.owner === owner && state.busy)) return false;
    pending.current = owner;
    setState({ owner, busy: true, notice: '', error: false });
    const result = await apiCall(method, path, body, isCurrent);
    if (pending.current === owner) pending.current = '';
    if (!result || !isCurrent()) return false;
    if (!result.ok || !companyLegalReceipt(result.body)) {
      const message = result.status === 409 && ['REVISION_CONFLICT', 'COMPANY_DOCUMENTS_CONFLICT'].includes(String((result.body as { error?: unknown } | null)?.error))
        ? 'The company library changed. Reload its saved state before applying this draft again.'
        : apiErrorText(result, 'The change was not confirmed. Reload the saved state before retrying if the connection was interrupted.');
      setState({ owner, busy: false, notice: message, error: true }); return false;
    }
    setState({ owner, busy: false, notice: `Legal workflow recorded at company revision ${result.body.data.revision}.`, error: false });
    onSaved(result.body); return true;
  };
  useEffect(() => () => { if (current.current === owner) current.current = ''; }, [owner]);
  return { ...(lease.current() && state.owner === owner ? state : { owner, busy: false, notice: '', error: false }), run, current: lease.current };
}
