/**
 * RBM write layer — the single path every mutation in the v2 RBM surfaces
 * takes to the server.
 *
 * The rule these helpers exist to enforce: a control that looks like it changed
 * something MUST have changed something on the server. No surface holds an
 * optimistic copy of the board and edits it locally; each action performs the
 * real POST/PATCH against /api/mdx/rbm-*, and on success asks the shell to
 * re-fetch the board so what is rendered is server truth. On failure the error
 * is surfaced verbatim and nothing on screen moves — an operator must never be
 * shown a signal as "triaged" or a QTL breach as "documented" when the write
 * did not land.
 *
 * @module concept2cure/v2/surfaces/rbmWrites
 */
import React, { useCallback, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { useLiveRows } from '../dataConnect';

/** Base for the granular RBM CRUD/compute routes (server/routes/mdx-rbm.ts). */
const RBM_API = '/api/mdx';

/** The verbs the RBM write layer uses. Declared here rather than imported from
 *  queryClient because the ambient `declare module '@/lib/queryClient'` in
 *  client/src/types/api.d.ts shadows that module's real type exports. */
type RbmWriteMethod = 'POST' | 'PATCH' | 'DELETE';

/**
 * Perform one RBM write and unwrap the `{ data } | { error }` envelope.
 * Throws with the server's own message on failure — the caller shows it as-is
 * rather than inventing a friendlier (and less accurate) one.
 */
export async function rbmWrite<T>(
  method: RbmWriteMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await apiRequest(method, `${RBM_API}${path}`, body);
  const payload = await res.json().catch(() => null) as
    | { data?: unknown; error?: unknown; meta?: unknown }
    | null;
  if (!res.ok) {
    const raw = payload?.error;
    const msg = typeof raw === 'string'
      ? raw
      : (raw && typeof raw === 'object' && typeof (raw as { message?: unknown }).message === 'string')
        ? (raw as { message: string }).message
        : null;
    throw new Error(msg || `The change was not saved (HTTP ${res.status}).`);
  }
  return (payload?.data ?? payload) as T;
}

/** Same as rbmWrite but returns the response `meta` envelope alongside the data. */
export async function rbmWriteWithMeta<T>(
  method: RbmWriteMethod,
  path: string,
  body?: unknown,
): Promise<{ data: T; meta: Record<string, unknown> }> {
  const res = await apiRequest(method, `${RBM_API}${path}`, body);
  const payload = await res.json().catch(() => null) as
    | { data?: unknown; error?: unknown; meta?: unknown }
    | null;
  if (!res.ok) {
    const raw = payload?.error;
    const msg = typeof raw === 'string' ? raw : null;
    throw new Error(msg || `The change was not saved (HTTP ${res.status}).`);
  }
  const meta = (payload?.meta && typeof payload.meta === 'object')
    ? payload.meta as Record<string, unknown>
    : {};
  return { data: (payload?.data ?? payload) as T, meta };
}

export interface RbmMutation {
  /** True while a write is in flight — controls are disabled so a slow save
   *  can't be double-submitted. */
  busy: boolean;
  /** The server's failure message, or null. Rendered by <RbmWriteError>. */
  error: string | null;
  clearError: () => void;
  /** Last successful write's confirmation line, for surfaces that report what
   *  a compute run actually returned (e.g. "3 signals raised"). */
  note: string | null;
  /**
   * Run a write. On success the board is re-fetched (so the surface re-derives
   * from server truth) and `note` is set from the returned confirmation; on
   * failure `error` is set and the caller leaves the UI untouched.
   * Resolves true when the write landed.
   */
  run: (fn: () => Promise<string | void>) => Promise<boolean>;
}

/**
 * Wrap the RBM write/reload cycle. `onReload` is the shell's board re-fetch —
 * without it a successful write would leave stale numbers on screen.
 */
export function useRbmMutation(onReload?: () => void): RbmMutation {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    try {
      const confirmation = await fn();
      setNote(typeof confirmation === 'string' ? confirmation : null);
      onReload?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [onReload]);

  return { busy, error, clearError: () => setError(null), note, run };
}

/** The honest failure banner: what the server said, and that nothing changed. */
export function RbmWriteError({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div className="rbm-run" data-tone="err" role="alert">
      <div className="rbm-run-h">{I.shieldAlert}The change was not saved</div>
      <div className="rbm-run-m">
        {error}
        {onDismiss ? <button className="rbm-linkbtn" onClick={onDismiss} style={{ marginLeft: 8 }}>Dismiss</button> : null}
      </div>
    </div>
  );
}

/** The confirmation line for a completed server-side run. */
export function RbmWriteNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <div className="rbm-run" role="status">
      <div className="rbm-run-h">{I.check}Done</div>
      <div className="rbm-run-m">{note}</div>
    </div>
  );
}

/** An assignable org member (GET /api/task-management/assignees). */
interface OwnerOption { id: string; name: string }

/**
 * The org's assignable members, shaped for an RbmFormModal select. Monitoring
 * actions store `owner` as a real user id, so the picker offers real users —
 * a free-text name would not resolve to anything the server could persist.
 * Falls back to an unassigned-only list when the roster is unavailable.
 */
export function useRbmOwners(): { options: string[]; labels: Record<string, string> } {
  const roster = useLiveRows<OwnerOption>('/api/task-management/assignees');
  const options = ['', ...roster.rows.map(r => String(r.id))];
  const labels: Record<string, string> = { '': 'Unassigned' };
  for (const r of roster.rows) labels[String(r.id)] = r.name;
  return { options, labels };
}

/** Parse an owner select value into the `owner` user id the API expects. */
export function ownerId(v: string | undefined): number | null {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize a date field to the YYYY-MM-DD the action API requires, or null. */
export function dueDate(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
