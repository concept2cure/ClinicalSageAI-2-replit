/**
 * Ending a person's sessions, and the AnA runs those sessions started (AnA
 * detach §2.9). Split from run-control.ts (2026-11-08) when the two functions
 * left account-standing.ts: there they made every reader of account standing
 * reach AnA's run machinery, and through it a model call, at file level
 * (ci:step-presentation, the engine tools behind part11's signer
 * re-verification). Callers: routes/auth.ts, routes/scim.ts,
 * routes/tenant-users.ts.
 */
import type { SessionEndDetail } from '@shared/ana/stop-lines';
import { endingStampOf } from '../account-standing.js';
import { stopRunsFor } from './run-control.js';

/**
 * End every session the account holds: stamp `users.sessions_ended_at` with
 * the first whole second after `at` (endingStampOf), never moving it backwards
 * (a write that did would revive a session an earlier one ended). Every
 * authenticator then refuses, at its next request, each session that began
 * before the stamp, access and refresh token alike (sessionEndedByStanding).
 * `at` is the server's clock, the clock that stamps a session's start (`sst`).
 * In the caller's database scope; throws when the write fails, and returns
 * whether the account was there to stamp. A caller answering a person waits
 * for the stamp first (untilStampHasBegun).
 */
export async function endEverySessionOf(
  userId: number,
  at: Date = new Date(),
  cause: SessionEndDetail = { cause: 'sign_out_everywhere', byUserId: userId },
): Promise<boolean> {
  const { pool } = await import('../../db.js');
  // tenant-isolation-safe: the account's own row, by the id its live session established.
  const result = await pool.query(
    `UPDATE users
        SET sessions_ended_at = GREATEST(COALESCE(sessions_ended_at, '-infinity'::timestamptz), $2::timestamptz)
      WHERE id = $1`,
    [userId, endingStampOf(at.getTime()).toISOString()],
  );
  const stamped = (result.rowCount ?? 0) === 1;
  // Every session ended, so every AnA turn those sessions started stops too,
  // on every device (AnA detach §2.9, session_ended). Never throws.
  if (stamped) await stopPersonsRuns(userId, cause);
  return stamped;
}

/**
 * Stop a person's live AnA runs, because the session that started them ended
 * (AnA detach §2.9): sign-out everywhere, a password change or reset, a
 * deprovisioning, a member's removal (with `organizationId`, that
 * organisation's only) or one session's sign-out (with `sessionId`, that
 * session's only — a sign-out on the desktop does not stop the phone's turn).
 * `detail` says what ended it and who, for the run row, the record and the
 * audit row (stopRunsFor). Never throws — the run's round-boundary re-check
 * is the backstop. Returns the runs it stopped. Moved here from
 * account-standing.ts on 2026-11-08 (see the note there).
 */
export async function stopPersonsRuns(
  userId: number,
  detail: SessionEndDetail,
  scope: { organizationId?: number; sessionId?: string } = {},
): Promise<string[]> {
  try {
    const { pool } = await import('../../db.js');
    return await stopRunsFor(
      pool,
      { userId, organizationId: scope.organizationId ?? null, sessionId: scope.sessionId ?? null },
      detail,
    );
  } catch {
    /* stopRunsFor logs its own failure; a database that cannot load leaves the round check */
    return [];
  }
}
