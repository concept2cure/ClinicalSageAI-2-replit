/**
 * Shared plumbing for the CMC surfaces.
 *
 * Two things were written per-file across the CMC module and are written once
 * here instead, because both are a place a surface can quietly lie:
 *
 *   • the project-in-context read — CMC records are per-project, and a surface
 *     that guesses the project writes a scientist's data onto the wrong one;
 *   • the write-error reader — a rejected field must be shown as the field it
 *     was, not as "something went wrong".
 *
 * The toast used to be a third. It moved to `../toast` when the other
 * twenty-two surfaces that needed it turned out not to be CMC surfaces, and it
 * is deliberately NOT re-exported from here — a re-export would leave two names
 * for one component, which is the shape the move exists to remove.
 */

import { serverMessage } from '@/lib/queryClient';

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

/* `openProgramAction` was defined here and is now `../programAction`.
 *
 * It was written against the one channel a CMC surface has — its own `nav`
 * prop — and so returned `undefined` for any caller without one. That branch is
 * unreachable from a CMC surface and is the ONLY branch reachable from the MDX
 * lane, where the empty state is rendered by `<DataGate>`: a leaf with no `nav`
 * and nothing to thread one through. All 33 MDX panels would have taken it, and
 * the passive instruction the contract retires would have survived in the lane
 * that reported it. The canonical version reaches the shell by event when it has
 * no prop, so it is always a real action.
 *
 * Deliberately NOT re-exported. Two names for one function is the shape this
 * file's header objects to, and it is how the second copy got written. */

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
  // Delegated: `j?.error || j?.message` preferred an enum token over the real
  // sentence beside it, so a CMC write refused with `{ error: 'PENDING_STORE',
  // message: '…' }` told the scientist "PENDING_STORE". `serverMessage` is the
  // one place that decides whether a string is copy, and it also keeps SQL,
  // relation names and routes out of this line.
  return serverMessage(json) ?? `The server did not accept the change (HTTP ${status}).`;
}

/** The message shown when a write did not land. Always says nothing was saved. */
export function cmcWriteFailed(subject: string, json: unknown, status: number): string {
  return `Couldn’t save the ${subject} — ${cmcWriteError(json, status)}. Nothing was persisted.`;
}

/**
 * The message shown when a write threw before a response arrived.
 *
 * Only an `ApiRequestError` message is rendered — that one has been through
 * `extractApiError` and is user copy by construction. Anything else here is a
 * browser-native throw: `fetch` rejecting offline gives a TypeError reading
 * "Failed to fetch" / "Load failed", and `String(e)` on a non-Error gives
 * "[object Object]". Both were being shown to scientists as the reason their
 * regulated record did not save.
 */
export function cmcWriteThrew(subject: string, e: unknown): string {
  const known =
    typeof e === 'object' && e !== null &&
    (e as { name?: unknown }).name === 'ApiRequestError' &&
    typeof (e as { message?: unknown }).message === 'string' &&
    (e as { message: string }).message.trim();
  return known
    ? `Couldn’t save the ${subject} — ${(e as { message: string }).message}`
    : `Couldn’t save the ${subject}. Check your connection and try again. Nothing was persisted.`;
}
