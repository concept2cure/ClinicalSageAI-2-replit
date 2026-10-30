/** The existing risk file's current project/account visit and selected detail. */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuthUser } from '@/services/portal/authService';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { captureShellProjectGuard, useShellProject } from '../shellProject';
import { useLiveData, type DataReadOwner } from '../dataConnect';
import { readRefusalOf } from '../../mdx/hooks/useFetchJson';
import { signedContentFacetOf, UNAVAILABLE_FACET, type SignedRecordRead } from '../SignedContentState';
import type { RiskControl } from '../fixtures/risk-data';
import { useToast, type FireToast } from '../toast';

export function riskItemPath(id: number, programId?: string | null, suffix = ''): string {
  return `/api/mdx/risk-items/${id}${suffix}` + (programId ? `?program_id=${encodeURIComponent(programId)}` : '');
}

export function riskRowsBelongToProject(rows: unknown[], programId: string | null): boolean {
  return !programId || rows.every(row => Boolean(row && typeof row === 'object'
    && (row as { program_id?: unknown }).program_id === programId));
}

/** Bearer refresh keeps the account owner; A → B → A retires the earlier visit. */
export function useRiskReadOwner(programId: string | null): DataReadOwner {
  const session = useAuthoringReadSession(useAuthUser());
  useShellProject();
  const source = JSON.stringify([session.actor, session.key, programId]);
  const visit = useRef({ source, generation: 1, projectCurrent: captureShellProjectGuard(), active: true });
  if (visit.current.source !== source || (programId && !visit.current.projectCurrent())) {
    visit.current.active = false;
    visit.current = { source, generation: visit.current.generation + 1, projectCurrent: captureShellProjectGuard(), active: true };
  }
  const captured = visit.current;
  useEffect(() => { captured.active = true; return () => { captured.active = false; }; }, [captured]);
  return useMemo(() => ({ key: `${source}:${captured.generation}`, current: () => captured.active
    && visit.current === captured && session.sameRevision() && (!programId || captured.projectCurrent()),
  }), [source, captured, session, programId]);
}

/** Local rows, selection and forms reset before a replacement owner can draw them. */
export function useRiskOwnedState<T>(owner: DataReadOwner, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState({ key: owner.key, value: initial });
  if (state.key !== owner.key) setState({ key: owner.key, value: initial });
  const set = useMemo<Dispatch<SetStateAction<T>>>(() => value => {
    if (!owner.current()) return;
    setState(previous => {
      if (!owner.current()) return previous;
      const old = previous.key === owner.key ? previous.value : initial;
      return { key: owner.key, value: typeof value === 'function' ? (value as (v: T) => T)(old) : value };
    });
  }, [owner, initial]);
  return [state.key === owner.key && owner.current() ? state.value : initial, set];
}

export function useRiskToast(owner: DataReadOwner) {
  const [raw, publish] = useToast();
  const source = useRef(owner.key);
  const fire: FireToast = (message, tone) => { if (owner.current()) { source.current = owner.key; publish(message, tone); } };
  return { toast: source.current === owner.key && owner.current() ? raw : { msg: '', tone: 'ok' as const }, fire };
}

interface Detail extends Record<string, unknown> { id: number; program_id: string | null; controls: Record<string, unknown>[] }
const EMPTY_CONTROLS: RiskControl[] = [];

/** One detail read supplies both persisted controls and the acceptance signature. */
export function useRiskRecordRead(id: number | null, programId: string | null, owner: DataReadOwner, revision: string) {
  const path = id === null ? null : riskItemPath(id, programId);
  const [retryTick, retry] = useState(0);
  const read = useLiveData<Detail>(path, [path, revision, retryTick], (value): value is Detail => {
    const r = value as Detail | null;
    return Boolean(r && r.id === id && (programId === null || r.program_id === programId) && Array.isArray(r.controls)
      && r.controls.every(c => c && typeof c === 'object' && typeof c.id === 'number'
        && typeof c.description === 'string' && typeof c.control_type === 'string' && typeof c.status === 'string'
        && (c.risk_item_id === undefined || c.risk_item_id === id)));
  }, owner);
  const matched = Boolean(path && read.data?.id === id && (programId === null || read.data?.program_id === programId));
  const ready = matched && owner.current() && !read.loading && !read.error;
  const controls = useMemo<RiskControl[]>(() => ready ? read.data!.controls.map(c => ({ id: String(c.id),
    desc: String(c.description), type: String(c.control_type), status: String(c.status) })) : EMPTY_CONTROLS, [ready, read.data]);
  const signature: SignedRecordRead = useMemo(() => ({ reading: Boolean(path && read.loading),
    facet: ready ? signedContentFacetOf(read.data!.signedContent) : UNAVAILABLE_FACET,
    record: ready ? read.data! : null,
  }), [path, read.loading, ready, read.data]);
  return { controls, signature, ready, loading: Boolean(path && read.loading),
    error: read.error || (path && !read.loading && !matched ? 'The risk control record was not returned.' : undefined),
    refusal: readRefusalOf(read), retry: () => retry(n => n + 1) };
}

export type RiskRecordRead = ReturnType<typeof useRiskRecordRead>;

export function riskControlsForAna(read: RiskRecordRead, added: RiskControl[]) {
  return { state: read.loading ? 'loading' : read.refusal ? 'refused' : read.error ? 'unavailable' : read.ready ? 'ready' : 'idle',
    count: read.ready ? new Set([...read.controls, ...added].map(c => c.id)).size : null };
}
