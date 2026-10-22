/**
 * The AnA work a graceful shutdown waits for (AnA detach DT3,
 * docs/design/ANA_DETACH_2026-10-08.md §7).
 *
 * The HTTP drain waits only for open connections. A detached turn has none:
 * its page closed and it went on. So without this, shutdown ended the pool
 * under a turn that was still writing its stopped answer and its record. Each
 * turn's handler and its post-processing (which files the record after the
 * handler released the run) are held here, and the drain waits for them —
 * bounded by the drain's own window — after run-control.ts
 * settleOwnedRunsForShutdown has ended every owned run as `server_shutdown`.
 *
 * Its own module, with no I/O, so the stream and the tests that replace
 * run-control.ts with a stand-in both reach it.
 *
 * @module server/services/ana/shutdown-hold
 */

const settling = new Set<Promise<unknown>>();

/** Hold the shutdown drain for this work. Never throws; returns the work. */
export function holdShutdownFor<T>(work: Promise<T>): Promise<T> {
  const tracked = work.then(
    () => undefined,
    () => undefined,
  );
  settling.add(tracked);
  void tracked.finally(() => settling.delete(tracked));
  return work;
}

/** How much held work is still running. */
export function heldWorkCount(): number {
  return settling.size;
}

/**
 * Wait, at most `timeoutMs`, for every held turn to settle. True when all of
 * it did in time.
 */
export async function ownedWorkSettled(timeoutMs: number): Promise<boolean> {
  if (settling.size === 0) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([Promise.all([...settling]).then(() => true as const), timedOut]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
