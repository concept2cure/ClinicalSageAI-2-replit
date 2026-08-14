/**
 * Shared plumbing for the CMC surfaces.
 *
 * Three things were written per-file across the CMC module and are written once
 * here instead, because every one of them is a place a surface can quietly lie:
 *
 *   • the toast — the only channel a write has to report that it failed;
 *   • the project-in-context read — CMC records are per-project, and a surface
 *     that guesses the project writes a scientist's data onto the wrong one;
 *   • the write-error reader — a rejected field must be shown as the field it
 *     was, not as "something went wrong".
 */

import React from 'react';
import { I } from '../icons';

/* ── Toast ──────────────────────────────────────────────────────────────── */

export type ToastTone = 'ok' | 'error';

/**
 * The one channel a write has to report what happened.
 *
 * The tone is explicit rather than inferred from the text. `.de-toast .ico` is
 * styled green, so a failure announced with the default check mark reads as a
 * success at a glance — "Couldn't save the specification. Nothing was
 * persisted." under a green tick is precisely the wrong first impression in a
 * regulated record.
 */
export interface ToastState {
  msg: string;
  tone: ToastTone;
}

export function useToast(): [ToastState, (m: string, tone?: ToastTone) => void] {
  const [state, setState] = React.useState<ToastState>({ msg: '', tone: 'ok' });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const fire = React.useCallback((m: string, tone: ToastTone = 'ok') => {
    setState({ msg: m, tone });
    if (timer.current) clearTimeout(timer.current);
    // A failure matters more and is longer, so it is held longer than the
    // "saved" acknowledgement it replaces.
    timer.current = setTimeout(() => setState({ msg: '', tone }), tone === 'error' || m.length > 90 ? 7000 : 3200);
  }, []);
  return [state, fire];
}

export function C2CToast({ msg }: { msg: ToastState | string }) {
  const state: ToastState = typeof msg === 'string' ? { msg, tone: 'ok' } : msg;
  if (!state.msg) return null;
  return (
    <div
      className="de-toast"
      data-tone={state.tone}
      role="status"
      // An error must interrupt; an acknowledgement must not.
      aria-live={state.tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="ico">{state.tone === 'error' ? I.alertTriangle : I.checkCircle}</span>
      {state.msg}
    </div>
  );
}

/* ── Project in context ─────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The project the shell currently has open, as the shell publishes it
 * (`window.C2C_PROJECT` — the same read the Module 3 board, specifications and
 * batch records already use). Returns the raw id, which may be a numeric legacy
 * id; use `cmcProjectUuid` where the endpoint's `project_id` column is a UUID.
 */
export function cmcProjectId(): string | undefined {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || undefined;
  } catch {
    return undefined;
  }
}

/** The project in context, but only when it is a well-formed UUID. */
export function cmcProjectUuid(): string | undefined {
  const id = cmcProjectId();
  return id && UUID_RE.test(id) ? id : undefined;
}

/* ── Write errors ───────────────────────────────────────────────────────── */

interface ZodIssueLike {
  path?: Array<string | number>;
  message?: string;
}

/**
 * The honest, specific reason a CMC write failed.
 *
 * The CMC routes now answer a rejected body with
 * `400 { error: 'Invalid payload', details: ZodIssue[] }`. A validation failure
 * names its field, and naming it is the difference between "Couldn't save —
 * matrix: Required" (the scientist fixes it in the open drawer) and "Couldn't
 * save — HTTP 400" (the scientist files a bug).
 */
export function cmcWriteError(json: unknown, status: number): string {
  const j = json as
    | { error?: string; message?: string; details?: ZodIssueLike[] }
    | null;
  const details = Array.isArray(j?.details) ? j!.details! : [];
  if (details.length) {
    const named = details
      .slice(0, 3)
      .map((d) => {
        const field = Array.isArray(d.path) ? d.path.filter((p) => p !== '').join('.') : '';
        return field ? `${field}: ${d.message ?? 'invalid'}` : d.message ?? 'invalid';
      })
      .join('; ');
    const more = details.length > 3 ? ` (+${details.length - 3} more)` : '';
    return named + more;
  }
  return j?.error || j?.message || `HTTP ${status}`;
}

/** The message shown when a write did not land. Always says nothing was saved. */
export function cmcWriteFailed(subject: string, json: unknown, status: number): string {
  return `Couldn’t save the ${subject} — ${cmcWriteError(json, status)}. Nothing was persisted.`;
}

/** The message shown when a write threw before a response arrived. */
export function cmcWriteThrew(subject: string, e: unknown): string {
  return `Couldn’t save the ${subject} — ${e instanceof Error ? e.message : String(e)}.`;
}
