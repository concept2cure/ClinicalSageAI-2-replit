import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import type { CompanyDocumentsResponse } from '@shared/company-documents';
import { apiCall, apiErrorText } from '../../apiCall';

export const COMPANY_LEGAL_PATH = '/api/client-branding/company-documents';
export function companyLegalSessionCurrent(sessionToken: string): boolean { return [getAuthToken()].includes(sessionToken); }
export function companyLegalOwner(token: string, key: string) { return `${getJwtOrgId()}:${token}:${key}`; }
export function companyLegalReceipt(value: unknown): value is CompanyDocumentsResponse {
  const body = value as CompanyDocumentsResponse | null;
  return Boolean(body && typeof body.canManage === 'boolean' && body.data?.version === 1 && Number.isSafeInteger(body.data.revision) && Array.isArray(body.data.legalDocuments));
}
export function useCompanyLegalResource<T>(path: string, token: string, key: string, enabled = true) {
  const owner = companyLegalOwner(token, key);
  const [attempt, setAttempt] = useState(0);
  const current = useRef(owner); current.current = owner;
  const [state, setState] = useState<{ owner: string; data: T | null; loading: boolean; error: string }>({ owner, data: null, loading: enabled, error: '' });
  useEffect(() => {
    let active = true;
    setState({ owner, data: null, loading: enabled, error: '' });
    if (enabled && token && token === getAuthToken()) void apiCall('GET', path).then(result => {
      if (!active || current.current !== owner || token !== getAuthToken()) return;
      setState({ owner, data: result.ok ? result.body as T : null, loading: false,
        error: result.ok && result.body ? '' : apiErrorText(result, 'The legal workflow could not be verified. Retry to read the current record.') });
    });
    return () => { active = false; };
  }, [owner, path, enabled, attempt, token]);
  return { ...(state.owner === owner ? state : { owner, data: null, loading: enabled, error: '' }), retry: () => setAttempt(value => value + 1) };
}
export function useCompanyLegalAction(token: string, key: string, onSaved: (result: CompanyDocumentsResponse) => void) {
  const owner = companyLegalOwner(token, key);
  const current = useRef(owner); current.current = owner;
  const [state, setState] = useState({ owner, busy: false, notice: '', error: false });
  const run = async (method: 'POST' | 'PUT', path: string, body: unknown) => {
    if (!token || token !== getAuthToken() || (state.owner === owner && state.busy)) return false;
    setState({ owner, busy: true, notice: '', error: false });
    const result = await apiCall(method, path, body);
    if (current.current !== owner || token !== getAuthToken()) return false;
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
  return { ...(state.owner === owner ? state : { owner, busy: false, notice: '', error: false }), run };
}
