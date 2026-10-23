import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { apiCall, apiErrorText, isApiRequestError } from '../../apiCall';
import { useCompanyLease, useCompanySession } from './companySession';

async function readCompanyFile(target: string, body: unknown, current: () => boolean): Promise<{ blob: Blob | null; error: string } | null> {
  if (!current()) return null;
  try {
    const response = await apiRequest('POST', target, body);
    if (!current()) return null;
    if (response.ok) { const blob = await response.blob(); return current() ? { blob, error: '' } : null; }
    const error = await response.json().catch(() => null);
    return current() ? { blob: null, error: apiErrorText({ ok: false, status: response.status, body: error, networkError: false }, 'The document download was refused.') } : null;
  } catch (error) {
    if (!current()) return null;
    return { blob: null, error: isApiRequestError(error) ? apiErrorText({ ok: false, status: error.status, body: error.payload, networkError: false }, 'The document download was refused.') : 'The document download did not reach the server.' };
  }
}

/** Small read/mutation boundary shared by company settings panels, scoped to the current browser session. */
export function useCompanyResource<T>(path: string | null, parse: (value: unknown) => T | null, version: number | string = '') {
  const [attempt, setAttempt] = useState(0);
  const session = useCompanySession();
  const lease = useCompanyLease(session, JSON.stringify([path, attempt, version]));
  const owner = lease.key;
  const pending = useRef({ generation: 0, owner });
  const parser = useRef(parse); parser.current = parse;
  pending.current.owner = owner;
  const [state, setState] = useState<{ owner: string; loading: boolean; data: T | null; error: string }>({ owner, loading: Boolean(path), data: null, error: '' });
  useEffect(() => {
    const guard = pending.current; const ticket = ++guard.generation;
    setState({ owner, loading: Boolean(path), data: null, error: '' });
    const current = () => lease.current() && ticket === guard.generation && guard.owner === owner;
    if (path && current()) void apiCall('GET', path, undefined, current).then(result => {
      if (!result || !current()) return;
      const data = result.ok ? parser.current(result.body) : null;
      setState({ owner, loading: false, data, error: data ? '' : apiErrorText(result, 'This company-document record could not be verified.') });
    });
    return () => { guard.generation++; };
  }, [path, owner, lease]);
  const call = async (method: 'POST' | 'PUT' | 'DELETE', target: string, body: unknown) => {
    const guard = pending.current; const ticket = guard.generation;
    const current = () => lease.current() && ticket === guard.generation && guard.owner === owner;
    return current() ? apiCall(method, target, body, current) : null;
  };
  const file = async (target: string, body: unknown) => {
    const guard = pending.current; const ticket = guard.generation;
    const current = () => lease.current() && ticket === guard.generation && guard.owner === owner;
    return current() ? readCompanyFile(target, body, current) : null;
  };
  const current = lease.current() && state.owner === owner ? state : { owner, loading: Boolean(path), data: null, error: '' };
  return { ...current, call, file, reload: () => { if (lease.current()) setAttempt(value => value + 1); } };
}
