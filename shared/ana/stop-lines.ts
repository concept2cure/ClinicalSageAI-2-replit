/**
 * Why an AnA turn stopped, in the person's words — the one table.
 *
 * It lived in the client (client/src/concept2cure/v2/anaWorkModel.ts) until
 * AnA detach slice DT3, when the server began to say the same lines in the
 * in-app notification a detached turn sends when it ends ("AnA stopped: …",
 * docs/design/ANA_DETACH_2026-10-08.md §5.5). Two copies of one table is two
 * places for a stop to be described two ways, so it moved here and both read
 * it. Every line is fixed copy: no model writes one.
 *
 * Each line says the stop and then its cause, so none can be read as good
 * news, and none is "Finished". `cancelled` (a person's Stop) has none: its
 * own branch says it wherever it is shown.
 *
 * @module shared/ana/stop-lines
 */

/**
 * What ended a step that was in flight, for a stop the person did not make,
 * as the clause after "was ended because" (server/services/ana/step-presentation.ts
 * stepMessage). A step the reaper, a shutdown, the session's end, an admin or
 * the unattended limit ended must never read "You stopped …" (5d8e60f3e: a
 * stop is never credited to a person who did not make it). The run row's
 * "Stopped: …" lines below are built from the same clauses, so a step and its
 * turn give one cause in one wording.
 */
export const STOP_CAUSE: Readonly<Record<string, string>> = {
  unattended_limit: 'nobody was watching for 15 minutes',
  // True for every cause it covers (DT3 review, DP-83): a sign-out, a
  // credential that expired, a removal, an organisation suspended or gone
  // read-only. What it was is in the record (sessionEndCauseWarning).
  session_ended: 'the sign-in or access that started this turn ended',
  server_shutdown: 'the server restarted for an update',
  orphaned: 'the server handling this turn stopped responding',
  admin_cancelled: 'an administrator stopped the turn',
  budget_exhausted: 'the turn reached its time limit',
  client_disconnected: 'this page lost its connection',
};

/** The clause for a run-row stop reason, or undefined for a person's Stop (`cancelled`) and any other. */
export function stopCause(reason: string | null | undefined): string | undefined {
  return reason && Object.prototype.hasOwnProperty.call(STOP_CAUSE, reason) ? STOP_CAUSE[reason] : undefined;
}

export const STOP_LINE_TEXT: Readonly<Record<string, string>> = {
  max_rounds: 'Stopped at the round limit',
  duplicate_thrash: 'Stopped: repeating a step',
  // The answer she was writing was cut off (the length limit, or a stream that
  // stalled mid-answer; D2, a6d82f624).
  answer_cut_off: 'Stopped: answer cut off',
  // The run policy's (row 74, S4).
  budget_exhausted: 'Stopped at the time limit',
  approval_timeout: 'Stopped: an approval was not answered',
  hold_expired: 'Stopped waiting for you',
  hold_unavailable: 'Stopped: Manual was unavailable',
  // A locked phone or a closed tab ended the run (ANA-SUMMARY S4). From DT3
  // only a turn that cannot detach (no run row, no person, or no conversation) still ends so.
  client_disconnected: `Stopped: ${STOP_CAUSE.client_disconnected}`,
  // The run row's reasons (AnA detach §2.10, §5.3), written by the server
  // from DT3.
  unattended_limit: `Stopped: ${STOP_CAUSE.unattended_limit}`,
  session_ended: `Stopped: ${STOP_CAUSE.session_ended}`,
  server_shutdown: `Stopped: ${STOP_CAUSE.server_shutdown}`,
  orphaned: `Stopped: ${STOP_CAUSE.orphaned}`,
  error: 'Stopped: the turn ended with an error',
  // The admin-cancel variant of `cancelled` (§2.5): the run row's
  // stopped_reason when an organisation admin or owner stopped the turn.
  admin_cancelled: 'Stopped by an administrator',
};

/**
 * The stop line for a reason, as a sentence ("Stopped: this page lost its
 * connection."). Null for a reason with none — she finished, or the person's
 * own Stop, which its own branch says.
 */
export function stopLineText(reason: string | null | undefined): string | null {
  const line = reason && Object.prototype.hasOwnProperty.call(STOP_LINE_TEXT, reason) ? STOP_LINE_TEXT[reason] : undefined;
  return line ? `${line}.` : null;
}

/**
 * A screen action a Live Drive turn asked for after its page closed (D-7,
 * decided 2026-10-22): refused, never queued and never run, and listed as a
 * step that did not run with this line. The rest of the turn goes on.
 */
export const SCREEN_GONE_LINE = 'Not run: the page was closed, so AnA stopped driving the screen.';

/**
 * "{n} step(s) were not authorised and did not run." (§2.7, §5.3), counted
 * from the timeline's own `heldBack` steps; null when there were none. The
 * closing row and the "finished" notification both say it.
 */
export function notAuthorisedLine(n: number): string | null {
  if (!Number.isFinite(n) || n < 1) return null;
  return n === 1 ? '1 step was not authorised and did not run.' : `${n} steps were not authorised and did not run.`;
}

/**
 * What ended the session or the organisation that a `session_ended` stop
 * names (AnA detach §2.9; DT3 review, the session-end cause). Written on the
 * run row with who did it (ana_runs.stopped_detail, run-control.ts
 * stopRunsFor), and into the turn's record, so an inspector reading a stopped
 * turn can see which act stopped it: the person's own sign-out, a password
 * change, a deprovisioning, an administrator's removal or suspension. Never a
 * control event: nobody decided to stop AnA.
 */
export const SESSION_END_CAUSES = [
  'sign_out',
  'sign_out_everywhere',
  'password_change',
  'password_reset',
  'deprovisioned',
  'member_removed',
  'account_deactivated',
  'org_suspended',
  'deletion_requested',
  'purge',
  // What the round-boundary re-check found (run-control.ts runStanding; DT3
  // review, DP-83): the turn's own credential, the membership, the
  // organisation's posture, or a check that could not be made.
  'credential_ended',
  'membership_ended',
  'org_unavailable',
  'standing_unreadable',
] as const;

export type SessionEndCause = (typeof SESSION_END_CAUSES)[number];

/** A `session_ended` stop's cause and, when a person did it, who. */
export interface SessionEndDetail {
  cause: SessionEndCause;
  /** The account that did it: the person themself for a sign-out, an administrator for a removal. Null for SCIM or the platform. */
  byUserId?: number | null;
}

/** The record's words for each cause, completing "The session ended because …". Fixed copy. */
const SESSION_END_CAUSE_TEXT: Readonly<Record<SessionEndCause, string>> = {
  sign_out: 'the person signed out of the session that started this turn',
  sign_out_everywhere: 'the person signed out of every session',
  password_change: "the account's password was changed, which ended every session",
  password_reset: "the account's password was reset, which ended every session",
  deprovisioned: 'the identity provider deprovisioned the account (SCIM)',
  member_removed: 'the person was removed from the organisation',
  account_deactivated: 'a platform administrator suspended or deactivated the account',
  org_suspended: 'the organisation was suspended or deactivated',
  deletion_requested: "the organisation's deletion was requested",
  purge: "the organisation's data was purged",
  credential_ended:
    'the sign-in this turn was started with is no longer valid (it expired, was signed out or revoked, or the session went idle)',
  membership_ended: 'the person is no longer a member of the organisation',
  org_unavailable:
    'the organisation can no longer run work in the background (it is suspended, read-only or being deleted)',
  standing_unreadable: "the sign-in and the organisation's standing could not be checked, so the turn was stopped",
};

/** Whether a value read back from the row is a cause this table names. */
export function isSessionEndCause(value: unknown): value is SessionEndCause {
  return typeof value === 'string' && (SESSION_END_CAUSES as readonly string[]).includes(value);
}

/** A detail read back from the row (jsonb), or null when it is not one. */
export function sessionEndDetailOf(value: unknown): SessionEndDetail | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { cause?: unknown; byUserId?: unknown };
  if (!isSessionEndCause(v.cause)) return null;
  const by = typeof v.byUserId === 'number' && Number.isInteger(v.byUserId) && v.byUserId > 0 ? v.byUserId : null;
  return { cause: v.cause, byUserId: by };
}

/**
 * The record's warning that names what ended the session, for example
 * "What ended the session: an administrator (user 11) removed …". Null for no
 * detail. The person is named by account id: the record is read by an
 * inspector beside the audit trail, which resolves it.
 */
export function sessionEndCauseWarning(detail: SessionEndDetail | null | undefined): string | null {
  if (!detail) return null;
  const by = detail.byUserId ? ` (by user ${detail.byUserId})` : '';
  return `The session ended because ${SESSION_END_CAUSE_TEXT[detail.cause]}${by}.`;
}
