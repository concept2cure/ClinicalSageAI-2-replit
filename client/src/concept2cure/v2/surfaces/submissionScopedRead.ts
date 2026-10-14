/** Request-owned reads for the existing SubmissionCenter selectors and coverage pane. */
import { useEffect, useReducer, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { isPendingStore, unwrapList, type ShapeGuard, type ListState } from '../dataConnect';

type ReadGuard = ReturnType<typeof authService.captureSessionReadGuard>;
export interface SubmissionReadSession {
  key: string;
  organizationId: number | null;
  sameRevision: () => boolean;
}
interface SessionSnapshot extends SubmissionReadSession { actor: string; serial: number; guard: ReadGuard }

/** Existing auth events trigger a render; the canonical guard owns revision identity. */
export function useSubmissionReadSession(): SubmissionReadSession {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const snapshot = useRef<SessionSnapshot | null>(null);
  const user = authService.getUser();
  const actor = `${user?.organizationId ?? ''}:${user?.id ?? ''}`;
  if (!snapshot.current || snapshot.current.actor !== actor || !snapshot.current.guard.sameRevision()) {
    const guard = authService.captureSessionReadGuard();
    const serial = (snapshot.current?.serial ?? 0) + 1;
    const organizationId = user?.organizationId ? Number(user.organizationId) : null;
    snapshot.current = { actor, serial, guard, key: `${actor}:${serial}`, organizationId, sameRevision: guard.sameRevision };
  }
  useEffect(() => {
    const stop = ['login', 'logout', 'session_expired', 'user_updated', 'token_refresh'].map(event =>
      authService.on(event as 'login' | 'logout' | 'session_expired' | 'user_updated' | 'token_refresh', refresh));
    return () => { stop.forEach(unsubscribe => unsubscribe()); };
  }, []);
  return snapshot.current;
}

export interface SubmissionScopedRead<T> {
  data: T | null;
  loading: boolean;
  error?: string;
  status?: number;
  meta?: Record<string, unknown>;
  loadedScope: string | null;
  isCurrent: () => boolean;
}
interface OwnedRead<T> extends Omit<SubmissionScopedRead<T>, 'isCurrent'> { revision: () => boolean; generation: number }
interface ParsedRead<T> { data: T | null; error?: string; status: number; meta?: Record<string, unknown> }
const unavailable = 'This read could not be completed. Retry the current selection.';
const NO_SCOPED_ROWS: readonly never[] = Object.freeze([]);

function parsedPayload(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { payload: body, meta: undefined };
  const object = body as Record<string, unknown>;
  const meta = object.meta && typeof object.meta === 'object' && !Array.isArray(object.meta) ? object.meta as Record<string, unknown> : undefined;
  const envelope = 'data' in object && ('success' in object || 'meta' in object || Object.keys(object).length === 1);
  return { payload: envelope ? object.data : body, meta };
}

async function readOwned<T>(path: string, guard: ShapeGuard<T>, current: () => boolean): Promise<ParsedRead<T> | null> {
  try {
    const response = await apiRequest('GET', path);
    if (!current()) return null;
    const body: unknown = await response.json();
    if (!current()) return null;
    if (!response.ok) return { data: null, status: response.status, error: serverMessage(body) ?? unavailable };
    const { payload, meta } = parsedPayload(body);
    if (isPendingStore({ meta }) || !guard(payload)) return { data: null, status: response.status, meta, error: 'The current records could not be verified. Retry this read.' };
    return { data: payload, status: response.status, meta };
  } catch (error) {
    if (!current()) return null;
    const failure = error as { status?: number; payload?: unknown; message?: string } | null;
    return { data: null, status: failure?.status ?? 0, error: serverMessage(failure?.payload) ?? redactInternals(failure?.message ?? unavailable, unavailable) };
  }
}

/** Scope masks render synchronously; obsolete response/catch paths publish nothing. */
export function useSubmissionScopedRead<T>(path: string | null, context: string, bump: number, session: SubmissionReadSession, guard: ShapeGuard<T>): SubmissionScopedRead<T> {
  const key = JSON.stringify([session.key, context, path, bump]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const generation = useRef(0);
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const [state, setState] = useState<OwnedRead<T>>({ data: null, loading: Boolean(path), loadedScope: null, revision: () => false, generation: 0 });
  useEffect(() => {
    const request = ++generation.current;
    let alive = true;
    if (!path || !session.sameRevision()) return () => { alive = false; generation.current += 1; };
    const revision = authService.captureSessionReadGuard().sameRevision;
    const current = () => alive && request === generation.current && currentKey.current === key && session.sameRevision() && revision();
    const shape = guardRef.current;
    setState({ data: null, loading: true, loadedScope: key, revision, generation: request });
    void readOwned(path, shape, current).then(result => {
      if (result && current()) setState({ ...result, loading: false, loadedScope: key, revision, generation: request });
    });
    return () => { alive = false; generation.current += 1; };
  }, [key, path, session]);
  const isCurrent = () => currentKey.current === key && state.loadedScope === key && state.generation === generation.current && state.revision() && session.sameRevision();
  if (!path) return { data: null, loading: false, loadedScope: null, isCurrent: () => false };
  if (!isCurrent()) return { data: null, loading: true, loadedScope: null, isCurrent };
  return { ...state, isCurrent };
}

export function useSubmissionScopedRows<T>(path: string | null, context: string, bump: number, session: SubmissionReadSession, guard: ShapeGuard<T[]>): ListState<T> & { loadedScope: string | null; isCurrent: () => boolean } {
  const read = useSubmissionScopedRead<unknown>(path, context, bump, session, (value): value is unknown => guard(unwrapList(value)));
  const rows = read.data == null ? NO_SCOPED_ROWS as unknown as T[] : unwrapList(read.data) as T[];
  return { rows, loading: read.loading, error: read.error, status: read.status, meta: read.meta, loadedScope: read.loadedScope, isCurrent: read.isCurrent, empty: !read.loading && !read.error && rows.length === 0 };
}
