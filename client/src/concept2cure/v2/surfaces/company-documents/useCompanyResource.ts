import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import { apiRequest } from '@/lib/queryClient';
import { apiCall, apiErrorText, isApiRequestError } from '../../apiCall';
const currentCompanyContext = () => `${getJwtOrgId()}:${getAuthToken()}`;

async function readCompanyFile(target: string, body: unknown): Promise<{ blob: Blob | null; error: string }> {
  try {
    const response = await apiRequest('POST', target, body);
    if (response.ok) return { blob: await response.blob(), error: '' };
    return { blob: null, error: apiErrorText({ ok: false, status: response.status, body: await response.json().catch(() => null), networkError: false }, 'The document download was refused.') };
  } catch (error) {
    return { blob: null, error: isApiRequestError(error) ? apiErrorText({ ok: false, status: error.status, body: error.payload, networkError: false }, 'The document download was refused.') : 'The document download did not reach the server.' };
  }
}

/** Small read/mutation boundary shared by company settings panels, scoped to the current browser session. */
export function useCompanyResource<T>(path: string | null, parse: (value: unknown) => T | null, version: number | string = '') {
  const [attempt, setAttempt] = useState(0);
  const context = currentCompanyContext();
  const owner = `${context}:${path}:${attempt}:${version}`;
  const pending = useRef({ generation: 0, owner });
  const parser = useRef(parse); parser.current = parse;
  pending.current.owner = owner;
  const [state, setState] = useState<{ owner: string; loading: boolean; data: T | null; error: string }>({ owner, loading: Boolean(path), data: null, error: '' });
  useEffect(() => {
    const guard = pending.current; const ticket = ++guard.generation;
    setState({ owner, loading: Boolean(path), data: null, error: '' });
    if (path) void apiCall('GET', path).then(result => {
      if (ticket !== guard.generation || guard.owner !== owner || context !== currentCompanyContext()) return;
      const data = result.ok ? parser.current(result.body) : null;
      setState({ owner, loading: false, data, error: data ? '' : apiErrorText(result, 'This company-document record could not be verified.') });
    });
    return () => { guard.generation++; };
  }, [path, owner, context]);
  const call = async (method: 'POST' | 'PUT' | 'DELETE', target: string, body: unknown) => {
    const guard = pending.current; const ticket = guard.generation;
    const result = await apiCall(method, target, body);
    return ticket === guard.generation && guard.owner === owner && context === currentCompanyContext() ? result : null;
  };
  const file = async (target: string, body: unknown) => {
    const guard = pending.current; const ticket = guard.generation;
    const result = await readCompanyFile(target, body);
    return ticket === guard.generation && guard.owner === owner && context === currentCompanyContext() ? result : null;
  };
  const current = state.owner === owner ? state : { owner, loading: Boolean(path), data: null, error: '' };
  return { ...current, call, file, reload: () => setAttempt(value => value + 1) };
}
