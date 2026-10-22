/**
 * The ceiling on AnA turns that go on after their page closed, per process
 * and per organisation (AnA detach DT3 review, INF-40).
 *
 * A detached turn holds its request's pinned, tenant-scoped database
 * connection until the turn and its post-processing end
 * (db/requestDbLease.ts) — for up to the 40-minute cap — and the production
 * pool is 40 connections (db/runtime.ts). Attached turns hold one too, but
 * only while a socket is open; detaching removes that cost to the caller, and
 * the only other bound was three live runs per person. So a task's detached
 * turns are capped well under the pool, and one organisation's well under
 * that, so it cannot take every slot from the others.
 *
 * Past either ceiling a closing page's turn does not detach: it stops as it
 * did before DT3 (`client_disconnected`, continuable), and its record says
 * why (stream.ts). In-process only, like the runs it counts: a turn lives and
 * dies with its owner process (P-10).
 *
 * @module server/services/ana/detach-slots
 */

/** Detached turns one process holds at most: well under the 40-connection pool. */
export const MAX_DETACHED_PER_PROCESS = 16;

/** …and one organisation at most, so it cannot take every slot from the others. */
export const MAX_DETACHED_PER_ORGANISATION = 8;

const byOrganisation = new Map<number, number>();
let total = 0;

/**
 * Take a slot for a turn of this organisation that is about to detach. The
 * function it returns gives the slot back, once (the turn ended); null when
 * either ceiling is reached and the turn must not detach.
 */
export function claimDetachSlot(organizationId: number): (() => void) | null {
  const held = byOrganisation.get(organizationId) ?? 0;
  if (total >= MAX_DETACHED_PER_PROCESS || held >= MAX_DETACHED_PER_ORGANISATION) return null;
  byOrganisation.set(organizationId, held + 1);
  total += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    total -= 1;
    const held = byOrganisation.get(organizationId);
    const left = (held === undefined ? 1 : held) - 1;
    if (left > 0) byOrganisation.set(organizationId, left);
    else byOrganisation.delete(organizationId);
  };
}

/** How many detached turns this process holds now. */
export function detachedCount(): number {
  return total;
}

/** For a test only: forget every slot. */
export function _resetDetachSlotsForTest(): void {
  byOrganisation.clear();
  total = 0;
}

/** The record's words for a turn that stopped because the ceiling was reached. Fixed copy. */
export function detachRefusedWarning(atIso: string): string {
  return (
    `The page closed at ${atIso.replace(/\.\d{3}Z$/, 'Z')} and the turn could not go on without it: this server is already running ` +
    `${MAX_DETACHED_PER_PROCESS} turns (or ${MAX_DETACHED_PER_ORGANISATION} for this organisation) that continue after their page closes. ` +
    'It stopped as a lost connection, and Continue picks it up.'
  );
}
