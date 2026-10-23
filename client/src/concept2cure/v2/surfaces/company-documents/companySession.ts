/** Company workflows reuse the canonical account owner; a bearer is not a session. */
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { useAuthoringReadSession } from '../../editor/authoringCurrentRead';

export interface CompanySession { key: string; current: () => boolean }

/** The optional bearer admits existing legal-form props once. Its rotation
 * cannot retire that admitted account, and stale props cannot admit a new one. */
export function useCompanySession(presentedBearer?: string): CompanySession {
  const owner = useAuthoringReadSession(authService.getUser());
  const admitted = useRef<{ bearer: string; owner: typeof owner } | null>(null);
  if (presentedBearer && presentedBearer === getAuthToken() && authService.captureSessionReadGuard(presentedBearer).current()
    && admitted.current?.bearer !== presentedBearer) {
    admitted.current = { bearer: presentedBearer, owner };
  }
  const source = presentedBearer === undefined ? owner : admitted.current?.bearer === presentedBearer ? admitted.current.owner : undefined;
  const authorized = source === owner;
  const visit = useRef({ owner, authorized, generation: 1 });
  if (visit.current.owner !== owner || visit.current.authorized !== authorized) {
    visit.current = { owner, authorized, generation: visit.current.generation + 1 };
  }
  const captured = visit.current;
  return useMemo(() => ({ key: JSON.stringify([owner.actor, owner.key, captured.generation]),
    current: () => {
      const bearer = getAuthToken();
      return visit.current === captured && captured.authorized && Boolean(authService.getUser()) && owner.sameRevision()
        && Boolean(bearer) && authService.captureSessionReadGuard(bearer ?? undefined).current();
    },
  }), [owner, captured]);
}

/** Retire old path/version visits synchronously, including A → B → A.
 * A retained callback cannot acquire a fresh lease after unmount. */
export function useCompanyLease(session: CompanySession, scope: string): CompanySession {
  const source = JSON.stringify([session.key, scope]);
  const ref = useRef({ source, visit: 1, active: true });
  if (ref.current.source !== source) {
    ref.current.active = false;
    ref.current = { source, visit: ref.current.visit + 1, active: true };
  }
  const lease = ref.current;
  const key = JSON.stringify([source, lease.visit]);
  useEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  return useMemo(() => ({ key, current: () => lease.active && ref.current === lease && session.current() }), [key, lease, session]);
}

export function companySetter<T>(current: () => boolean, set: Dispatch<SetStateAction<T>>): Dispatch<SetStateAction<T>> {
  return value => {
    if (current()) set(previous => current() ? typeof value === 'function'
      ? (value as (previous: T) => T)(previous) : value : previous);
  };
}
