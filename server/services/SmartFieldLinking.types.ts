import type { FieldUpdate } from './SmartFieldLinking';

/**
 * Outcome types for SmartFieldLinking.
 *
 * Split out of SmartFieldLinking.ts so the service stays under the 500-line
 * limit: the types were added with the L173 fix and tipped it to 511.
 */

/** How many linked destinations a propagation had, and how many took the value. */
export interface PropagationCounts {
  targets: number;
  written: number;
}

/**
 * What actually happened to a field update.
 *
 * Both propagation paths end in `if (rows.length > 0) { …update… }` with no
 * else, so a value with no destination row is dropped in silence. This type
 * exists so that silence reaches the caller: `updateField` used to return
 * Promise<void>, and both callers therefore reported success unconditionally.
 * Full history in ledger L173.
 *
 *   applied        — at least one destination row took the value.
 *   not-linked     — no destination is configured for this field. Nothing was
 *                    supposed to happen, and nothing did.
 *   no-destination — destinations ARE configured but no row exists to hold the
 *                    value. THE WRITE WAS LOST; never report this as success.
 *   failed         — propagation threw; `reason` carries it.
 */
export type FieldUpdateOutcome =
  | { status: 'applied'; targets: number; written: number }
  | { status: 'not-linked'; targets: 0; written: 0 }
  | { status: 'no-destination'; targets: number; written: 0 }
  | { status: 'failed'; targets: 0; written: 0; reason: string };

/** A queued update plus the callback that reports its outcome to the caller. */
export interface QueuedFieldUpdate {
  update: FieldUpdate;
  settle: (outcome: FieldUpdateOutcome) => void;
}
