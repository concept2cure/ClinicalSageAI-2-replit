/**
 * Why a run's owner was aborted, carried on the abort itself (AnA detach DT3,
 * docs/design/ANA_DETACH_2026-10-08.md §2.4):
 * `controller.abort(new RunStopped(reason))` in run-control.ts.
 *
 * An Error named `AbortError`, never a string. Abort consumers that throw
 * `signal.reason` keep receiving an Error named AbortError — Semaphore.acquire
 * rejects with it (ai-gateway/concurrency.ts), and the gateway maps any error
 * on an aborted signal to GatewayAbortedError — so failover and the circuit
 * breaker see a cancel, as they always did. The stream reads `stoppedReason`
 * off it (runStopReasonOf), so the stopped answer, the `end` event and the
 * record say what the run row says: the row's reason wins.
 *
 * Its own module, with no I/O, so the stream and the tests that replace
 * run-control.ts with a stand-in both read the one class.
 *
 * @module server/services/ana/run-stopped
 */

import type { SessionEndDetail } from '@shared/ana/stop-lines';
import type { RunStoppedReason } from './run-status.js';

export class RunStopped extends Error {
  /**
   * @param detail For a `session_ended` stop, what ended the session and who
   *   (ana_runs.stopped_detail), so the record can name it.
   */
  constructor(
    readonly stoppedReason: RunStoppedReason,
    readonly detail: SessionEndDetail | null = null,
  ) {
    super(`AnA run stopped (${stoppedReason})`);
    this.name = 'AbortError';
  }
}

/** What ended the session, for a signal aborted by a `session_ended` stop that named it; else null. */
export function runStopDetailOf(signal: AbortSignal | null | undefined): SessionEndDetail | null {
  if (!signal?.aborted) return null;
  const reason = signal.reason as unknown;
  return reason instanceof RunStopped ? reason.detail : null;
}

/** The run row's reason a signal was aborted with, or null for any other abort (or none). */
export function runStopReasonOf(signal: AbortSignal | null | undefined): RunStoppedReason | null {
  if (!signal?.aborted) return null;
  const reason = signal.reason as unknown;
  return reason instanceof RunStopped ? reason.stoppedReason : null;
}
