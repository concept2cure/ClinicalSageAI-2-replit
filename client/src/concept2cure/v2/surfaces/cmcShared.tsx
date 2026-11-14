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

import React from 'react';
import { serverMessage } from '@/lib/queryClient';
import { joinSentence } from './cmcSpec';

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

/**
 * The message shown when a write did not land. Always says nothing was saved.
 *
 * The server's reasons are sentences, so the full stop is added only when one
 * is missing ("…(HTTP 401).. Nothing was persisted." was on screen,
 * 2026-11-12). A refused signature's own sentence already says nothing was
 * signed, so it is not followed by a second sentence saying the same.
 */
export function cmcWriteFailed(subject: string, json: unknown, status: number): string {
  return cmcRefusal(`Couldn’t save the ${subject} — `, cmcWriteError(json, status));
}

/** A refusal's sentence after its lead, by the rule above: one full stop, and "Nothing was persisted." unless the reason already says nothing was signed. */
export function cmcRefusal(lead: string, why: string): string {
  return joinSentence(lead, why, /Nothing was signed\.$/.test(why) ? '' : 'Nothing was persisted.');
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
/**
 * The toast for an assessment that failed or was refused — not a write. The
 * Q1E shelf life and batch poolability compute evidence and save nothing, so
 * "Couldn't save the shelf-life estimate" misdescribed both a refusal (the
 * composition boundary's 409) and a failure.
 */
export function cmcAssessmentThrew(action: string, e: unknown): string {
  const known =
    typeof e === 'object' && e !== null &&
    (e as { name?: unknown }).name === 'ApiRequestError' &&
    typeof (e as { message?: unknown }).message === 'string' &&
    (e as { message: string }).message.trim();
  return known
    ? `Couldn’t ${action} — ${(e as { message: string }).message}`
    : `Couldn’t ${action}. Check your connection and try again.`;
}

/**
 * A thrown refusal after its lead, by the cmcRefusal rule: the request
 * helper's message (user copy by construction) ended once, or, for a
 * browser-native throw, that the request did not reach the server. Walked
 * 2026-11-12: "… A different, authorized user must sign.." — each catch
 * appended its own full stop.
 */
export function cmcThrownRefusal(lead: string, e: unknown): string {
  const known = typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'ApiRequestError'
    ? String((e as { message?: unknown }).message ?? '').trim() : '';
  return cmcRefusal(lead, known || 'the request did not reach the server. Check your connection and try again');
}

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

/* ── Raw states, as words ─────────────────────────────────────────────── */

/**
 * A record's state as a reader reads it.
 *
 * `approval_status` and the §3.2 section register store lower-case tokens, and
 * the chips rendered them raw: a reviewer saw "review" and "in_progress" on a
 * screen that files to an agency (§WA.4.2 rule 10 — no id, enum or snake_case
 * on screen). One map, in the module the CMC surfaces already share, so two
 * registers cannot spell the same state differently.
 *
 * An unknown token is NOT invented into a sentence: it is returned with its
 * separators opened out, so a state this map has not met shows as itself
 * rather than as some other state's word.
 */
const STATE_WORDS: Readonly<Record<string, string>> = {
  draft: 'Draft',
  review: 'In review',
  in_review: 'In review',
  in_progress: 'In progress',
  approved: 'Approved',
  reject: 'Rejected',
  rejected: 'Rejected',
  superseded: 'Superseded',
  retired: 'Retired',
  active: 'Active',
  closed: 'Closed',
  pending: 'Pending',
  completed: 'Completed',
  paused: 'Paused',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
  /* The process-capability engine's verdicts. */
  capable: 'Capable',
  marginal: 'Marginal',
  not_capable: 'Not capable',
};

/** @see STATE_WORDS */
export function cmcStateWord(state: string | null | undefined): string {
  if (!state) return '—';
  const key = state.trim().toLowerCase();
  if (STATE_WORDS[key]) return STATE_WORDS[key];
  const opened = key.replace(/[_-]+/g, ' ').trim();
  return opened ? opened.charAt(0).toUpperCase() + opened.slice(1) : '—';
}

/* ── The one view lead, and the one figure ─────────────────────────────── */

interface CmHeadProps {
  title: string;
  meta: string;
  actions?: React.ReactNode;
}

/* The view's lead, not a page header (D5 §A.4.4). The page has exactly one
   <h1>, written once by `CmcModule`; each tab opens with an <h2> and one grey
   line. What left this component:
   • the "CMC — Module 3 operating system" kicker — an uppercase eyebrow over
     every one of nine screens, saying what the rail's active item and the
     page title already say (ONE_DESIGN_PLAN §2);
   • the orange "Ask AnA" button — AnA's entry on a work area is the starter
     row below the header (§WA.3 "Actions"), not a button per screen;
   • the three suggestion tiles — the same prompts, now page-level and the
     same on every tab, so their position does not move as you switch tabs.
   `actions` stays: it is where a tab's own act lives, and in a tabbed work
   area the active tab's lead row is where the ONE primary may sit. */
export function CmHead({ title, meta, actions }: CmHeadProps) {
  return (
    <div className="pj-sec-h cm-lead">
      <h2>{title}</h2>
      <span className="sec-sub">{meta}</span>
      {actions && <div className="pj-sec-acts">{actions}</div>}
    </div>
  );
}

/* A figure first; `onClick` makes it a door as well. The interactive variant
   is a real <button> carrying the SAME class and children — the .c2c-v2 button
   reset (app-v2.css) zeroes the chrome and .reg-kpi supplies the identical
   shape — so a door reads the same as a plain figure, reads as a control to a
   screen reader, and gains the focus ring. A figure with nothing behind it
   stays a <div>: a clickable dead end is noise, not an affordance.
   These were stat tiles until D0 §4.2.7; the markup is unchanged and the
   stylesheet makes them a quiet line. */
export function Kpi({ l, v, s, tone, onClick, title }: { l: string; v: React.ReactNode; s?: string; tone?: string; onClick?: () => void; title?: string }) {
  const body = <><div className="reg-kpi-v">{v}</div><div className="reg-kpi-l">{l}{s ? ' — ' + s : ''}</div></>;
  if (onClick) return <button type="button" className="reg-kpi" data-tone={tone} title={title} onClick={onClick}>{body}</button>;
  return <div className="reg-kpi" data-tone={tone}>{body}</div>;
}

/**
 * A register header's figure, or what is true instead when no read has resolved.
 *
 * A card's header belongs in the same triage as its body. `RegisterCard` used to
 * render `meta(rows)` unconditionally, over the local working set, which is
 * seeded only once a read RESOLVES — so a FAILED read printed
 * "organization-wide — ICH Q2 — 0/0 validated" beside a body saying "Couldn't
 * load analytical methods": one card both refusing to show the register and
 * stating its contents. On that register the figure is the one that stops every
 * specification approval (ICH Q2 — a limit cannot be approved without a
 * validated method), so it is read as the fact that blocks the work. The
 * working agreement states the general rule: an error is never rendered as an
 * empty result.
 *
 * The figure shows whenever there is something to count it over — any row in
 * hand, so a failed REFETCH keeps its line exactly as the body keeps its table;
 * or a read that resolved, INCLUDING one that resolved empty, where zero is a
 * fact about that register and the body shows its empty state beside it.
 * Otherwise it says which of the two it is, rather than going silent: a header
 * that dropped its line would read as a register with nothing to say.
 *
 * The scope note is NOT a figure and is rendered either way by the caller: it
 * says where the register lives, which is true whether the read worked or not.
 *
 * Evidence: docs/evidence/S7/2026-11-09-register-header-honesty/.
 */
export function headerMeta<T>(
  /* Structural, so it takes a `ListState` without importing dataConnect into
     this module — and `error` is optional there, not `string | null`. */
  live: { loading: boolean; error?: string | null },
  rows: T[],
  /* A node, not a string: a register's meta line may carry markup (a tone span,
     a count the card colours), which is what `RegisterCardProps.meta` returns. */
  meta: (rows: T[]) => React.ReactNode,
): React.ReactNode {
  if (rows.length > 0 || (!live.loading && !live.error)) return meta(rows);
  return live.error ? 'Not loaded' : 'Loading…';
}

/**
 * A figure over a read, or what is true instead of a zero for "not read".
 *
 * The Approvals & audit tab printed "0 contradictions resolved · 0 still open"
 * over a contradictions read that had failed, directly above "Couldn't load
 * contradiction history" — and "still open" is the figure the export gate
 * refuses on. The same rule as `headerMeta`: a count is stated only over a
 * read that resolved.
 */
export function readCount(read: { loading: boolean; error?: string | null }, counted: string, what: string): string {
  if (read.loading) return `reading ${what}…`;
  if (read.error) return `${what} not read`;
  return counted;
}

/**
 * The audit chain's event count. The chain is read per section and joined, so
 * it has its own state; a chain with a section whose events could not be read
 * is a floor, not a total, and says so.
 */
export function chainCount(state: 'idle' | 'loading' | 'ready' | 'error', partial: boolean, events: number): string {
  if (state === 'error') return 'audit chain not read';
  if (state !== 'ready') return 'reading the audit chain…';
  return `${partial ? 'at least ' : ''}${events} governed ${events === 1 ? 'event' : 'events'}`;
}
