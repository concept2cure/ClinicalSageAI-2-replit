/** In-memory attempts belong to the existing reporting canvas account owner. */
import React, { useEffect, useRef, useState } from 'react';
import { useLiveData, type DataResult, type ShapeGuard } from '../dataConnect';
import { apiCall } from '../apiCall';
import type { CreateSubscriptionBody, WriteOutcome } from './insightsLibraryModel';
import { isRowList, readFailureOf, rowsOf } from './insightsLibraryShared';

type Section = 'schedules' | 'bundles';
type Payload = { kind: 'schedule-create'; body: CreateSubscriptionBody }
  | { kind: 'schedule-enable'; id: number; enabled: boolean }
  | { kind: 'bundle-create'; name: string; runIds: number[] };
interface Attempt {
  id: number;
  context: string;
  key: string;
  section: Section;
  phase: 'pending' | 'unconfirmed' | 'confirmed';
  payload: Payload;
  message?: string;
}

export function useLibraryActions() {
  const attempts = useRef(new Map<string, Attempt>());
  const sequence = useRef(0);
  const [, rerender] = useState(0);
  const mounted = useLibraryMounted();
  const notify = () => { if (mounted.current) rerender(value => value + 1); };
  const list = (context: string, section: Section) => [...attempts.current.values()].filter(item => item.context === context && item.section === section);
  return {
    list,
    get: (context: string, key: string) => attempts.current.get(JSON.stringify([context, key])),
    start(context: string, key: string, section: Section, payload: Payload): Attempt | null {
      const slot = JSON.stringify([context, key]);
      if (attempts.current.has(slot) || list(context, section).some(item => item.phase === 'unconfirmed')) return null;
      const item: Attempt = { id: ++sequence.current, context, key, section, phase: 'pending', payload };
      attempts.current.set(slot, item); notify(); return item;
    },
    settle(item: Attempt, outcome: WriteOutcome, retainConfirmation = false) {
      const slot = JSON.stringify([item.context, item.key]);
      if (attempts.current.get(slot)?.id !== item.id) return;
      if (outcome.unconfirmed) attempts.current.set(slot, { ...item, phase: 'unconfirmed', message: outcome.message });
      else if (outcome.ok && retainConfirmation) attempts.current.set(slot, { ...item, phase: 'confirmed' });
      else attempts.current.delete(slot);
      notify();
    },
    consume(item: Attempt) {
      const slot = JSON.stringify([item.context, item.key]);
      if (attempts.current.get(slot)?.id !== item.id || item.phase !== 'confirmed') return false;
      attempts.current.delete(slot); notify(); return true;
    },
    review(context: string, section: Section, ids: number[]) {
      const current = list(context, section);
      if (current.some(item => item.phase === 'pending') || current.some(item => !ids.includes(item.id))) return false;
      current.forEach(item => attempts.current.delete(JSON.stringify([context, item.key])));
      notify(); return true;
    },
  };
}
export type LibraryActions = ReturnType<typeof useLibraryActions>;
/** Keep the checked register visible during review; ordinary refresh clears it. */
export function useLibraryRegister<T>(path: string, label: string) {
  const [attempt, setAttempt] = useState(0);
  const read = useLiveData<unknown>(path, [path, attempt], isRowList);
  const [checked, setChecked] = useState<DataResult<T[]> | null>(null);
  return {
    rows: rowsOf<T>(checked ? checked.data : read.data),
    loading: !checked && read.loading,
    failure: !checked && read.error ? readFailureOf(read, label) : null,
    meta: checked ? checked.meta : read.meta,
    onChecked: setChecked,
    retry: () => setAttempt(value => value + 1),
    refresh: () => { setChecked(null); setAttempt(value => value + 1); },
  };
}
/** Dispatch is guarded synchronously; only a mounted current panel adopts its receipt. */
export function useLibraryMutation(actions: LibraryActions, context: string, current: () => boolean) {
  const mounted = useLibraryMounted();
  return async (key: string, section: Section, payload: Payload, request: () => Promise<WriteOutcome>, adopt: (outcome: WriteOutcome) => void) => {
    if (!current()) return;
    const token = actions.start(context, key, section, payload);
    if (!token) return;
    const outcome = await request();
    const adoptable = mounted.current && current();
    actions.settle(token, outcome, !adoptable);
    if (adoptable) adopt(outcome);
  };
}
export function useLibraryConfirmed(actions: LibraryActions, context: string, section: Section, current: () => boolean, adopt: (attempt: Attempt) => void) {
  useEffect(() => {
    if (!current()) return;
    actions.list(context, section).forEach(item => { if (item.phase === 'confirmed' && actions.consume(item)) adopt(item); });
  }, [actions, context, section, current, adopt]);
}
export function useLibraryMounted() {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return mounted;
}

function recoveryReceipt<T>(body: unknown, guard: ShapeGuard<T>): { data: T; meta?: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const envelope = body as Record<string, unknown>;
  if ((envelope.success !== undefined && envelope.success !== true) || envelope.error != null || envelope.code != null || envelope.pendingStore != null) return null;
  const meta = envelope.meta && typeof envelope.meta === 'object' && !Array.isArray(envelope.meta) ? envelope.meta as Record<string, unknown> : undefined;
  return meta?.pendingStore == null && guard(envelope.data) ? { data: envelope.data, meta } : null;
}

/** A successful read permits review, never an automatic repeat of a write. */
export function LibraryRecovery<T>({ actions, context, section, current, path, guard, onChecked }: {
  actions: LibraryActions; context: string; section: Section; current: () => boolean;
  path: string; guard: ShapeGuard<T>; onChecked: (result: DataResult<T>) => void;
}) {
  const held = actions.list(context, section);
  const unknown = held.filter(item => item.phase === 'unconfirmed');
  const mounted = useLibraryMounted();
  const busy = useRef(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<number[] | null>(null);
  const eligible = useRef<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!unknown.length) return null;
  const check = async () => {
    if (busy.current || !current() || held.some(item => item.phase === 'pending')) return;
    busy.current = true; eligible.current = null; setChecking(true); setChecked(null); setError(null);
    const ids = unknown.map(item => item.id);
    const result = await apiCall<unknown>('GET', path);
    busy.current = false;
    if (!mounted.current || !current()) return;
    setChecking(false);
    const receipt = recoveryReceipt(result.body, guard);
    if (!result.ok || result.status !== 200 || !receipt) {
      setError(`Current ${section} could not be checked. Keep this request on hold and check again.`); return;
    }
    onChecked({ ...receipt, status: result.status }); eligible.current = ids; setChecked(ids);
  };
  const reviewable = checked && unknown.every(item => checked.includes(item.id)) && !held.some(item => item.phase === 'pending');
  return <div className="ro-dash-note" role="status" data-testid={`rl-${section}-recovery`}>
    <div>
    <div>{unknown[0].message}</div>
    {unknown.map(item => item.payload.kind === 'schedule-enable' ? <div key={item.id}>Schedule #{item.payload.id}: {item.payload.enabled ? 'resume' : 'pause'} requested.</div> : null)}
    <p className="rl-sub">A read, an absent record or a bounded list does not prove that the earlier write failed. Review current {section} before deliberately allowing a new request.</p>
    {error && <p role="alert">{error}</p>}
    <div className="rl-head-acts">
      <button type="button" className="btn ghost" disabled={checking || held.some(item => item.phase === 'pending')} onClick={() => void check()}>{checking ? `Checking ${section}…` : `Check ${section}`}</button>
      {reviewable && <button type="button" className="btn primary" style={{ whiteSpace: 'normal', height: 'auto', minHeight: 32 }} onClick={() => { if (!busy.current && eligible.current && current() && actions.review(context, section, eligible.current)) { eligible.current = null; setChecked(null); } }}>Reviewed {section} — allow another request</button>}
    </div>
    </div>
  </div>;
}
