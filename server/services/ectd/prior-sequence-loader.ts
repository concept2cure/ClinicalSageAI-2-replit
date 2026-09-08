/**
 * Prior-sequence loader — reads a stored sequence leaf manifest back into the
 * lifecycle operator's PriorLeaf shape, tenant-scoped.
 *
 * This is the read half of the sequence-manifest feature (compile paths that
 * persist a leaf manifest onto ectd_compilations are the write half). Given an application + a prior sequence number, it fetches
 * that sequence's compilation row for the caller's organization and returns its
 * published leaves, so a new sequence can be diffed against exactly what shipped
 * — without the caller hand-supplying every prior href.
 *
 * The pool is injected so the query is unit-testable with a stub; production
 * callers pass the app's pg pool. The organization filter is ALWAYS applied —
 * a prior sequence is never read across tenants.
 *
 * @module server/services/ectd/prior-sequence-loader
 */

import { manifestToPriorLeaves } from './sequence-manifest';
import type { PriorLeaf } from './lifecycle-operator';

/** Minimal pg-pool surface this loader needs. */
export interface PoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface LoadPriorSequenceArgs {
  organizationId: number;
  applicationNumber: string;
  priorSequenceNumber: string;
}

/**
 * Load the published leaves of a prior sequence as PriorLeaf[] for lifecycle
 * diffing. Returns an empty array when any identifier is missing or no matching
 * compilation with a manifest exists (a first sequence legitimately has no
 * prior). The newest matching compilation wins.
 */
export async function loadPriorSequenceManifest(
  pool: PoolLike,
  args: LoadPriorSequenceArgs,
): Promise<PriorLeaf[]> {
  const { organizationId, applicationNumber, priorSequenceNumber } = args;
  if (!organizationId || !applicationNumber || !priorSequenceNumber) return [];

  const res = await pool.query(
    `SELECT leaf_manifest
       FROM ectd_compilations
      WHERE organization_id = $1
        AND application_number = $2
        AND sequence_number = $3
        AND leaf_manifest IS NOT NULL
      ORDER BY compiled_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [organizationId, applicationNumber, priorSequenceNumber],
  );

  if (!res?.rows?.length) return [];
  return manifestToPriorLeaves(res.rows[0].leaf_manifest);
}

/**
 * Load the manifest of the MOST RECENT sequence strictly before `currentSequence`
 * for this application — the natural prior when exporting a new sequence without
 * naming the predecessor. Sequence numbers are zero-padded 4-digit strings, so
 * lexical `<` ordering is correct. Returns the prior sequence number alongside
 * its leaves (empty leaves + empty number when there is no prior). Always
 * organization-scoped.
 */
export async function loadLatestPriorManifest(
  pool: PoolLike,
  args: { organizationId: number; applicationNumber: string; currentSequence: string },
): Promise<{ priorSequenceNumber: string; leaves: PriorLeaf[] }> {
  const { organizationId, applicationNumber, currentSequence } = args;
  if (!organizationId || !applicationNumber || !currentSequence) {
    return { priorSequenceNumber: '', leaves: [] };
  }
  const res = await pool.query(
    `SELECT sequence_number, leaf_manifest
       FROM ectd_compilations
      WHERE organization_id = $1
        AND application_number = $2
        AND sequence_number < $3
        AND leaf_manifest IS NOT NULL
      ORDER BY sequence_number DESC, compiled_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [organizationId, applicationNumber, currentSequence],
  );
  if (!res?.rows?.length) return { priorSequenceNumber: '', leaves: [] };
  return {
    priorSequenceNumber: String(res.rows[0].sequence_number ?? ''),
    leaves: manifestToPriorLeaves(res.rows[0].leaf_manifest),
  };
}

/**
 * Load the EFFECTIVE prior state of this SUBMISSION as of `currentSequence` —
 * keyed on the stable `submission_id` (submissions.id) rather than the fragile
 * `application_number`, which some compile paths set to a sequence-specific
 * fallback that could never align across sequences. This is the canonical
 * lifecycle lookup. Organization-scoped; empty when there is no prior sequence.
 *
 * Each stored `leaf_manifest` is a PER-SEQUENCE DELTA: the packager snapshots
 * only the leaves that sequence actually shipped, and `computeLifecycleOperations`
 * deliberately omits unchanged leaves. But its consumer treats what this function
 * returns as the COMPLETE state of the application on file at the agency ("a
 * prior leaf the new sequence does not mention is still on file, unchanged").
 *
 * Reading only the single most recent prior manifest broke that invariant from
 * sequence 0002 onward: a leaf filed in 0000 and not re-filed in 0001 was absent
 * from the prior state, so the diff saw no predecessor and emitted
 * `operation="new"` with no `modified-file` — telling the agency the document had
 * never been filed under this application, while the version it was meant to
 * supersede stayed current. So fold EVERY preceding sequence, oldest to newest:
 * a later filing of the same leaf supersedes an earlier one, and a leaf whose
 * last operation was `delete` is off file and drops out. Each surviving leaf
 * carries the sequence it was actually last published in, so its `modified-file`
 * pointer traverses to the folder that really holds it.
 *
 * Folding at READ time (rather than persisting a cumulative snapshot at write
 * time) also repairs manifests already stored as deltas, needs no backfill, and
 * avoids a read-modify-write race between concurrent compiles.
 *
 * Sequence numbers are zero-padded fixed-width strings, so the SQL `<` filter and
 * the ascending sort are both lexical — the same assumption the sibling loaders
 * document and rely on.
 */
export async function loadLatestPriorManifestBySubmission(
  pool: PoolLike,
  args: { organizationId: number; submissionId: number; currentSequence: string },
): Promise<{ priorSequenceNumber: string; leaves: PriorLeaf[] }> {
  const { organizationId, submissionId, currentSequence } = args;
  if (!organizationId || !submissionId || !currentSequence) {
    return { priorSequenceNumber: '', leaves: [] };
  }
  const res = await pool.query(
    `SELECT sequence_number, leaf_manifest
       FROM ectd_compilations
      WHERE organization_id = $1
        AND submission_id = $2
        AND sequence_number < $3
        AND leaf_manifest IS NOT NULL
      ORDER BY sequence_number ASC, compiled_at ASC NULLS FIRST, id ASC`,
    [organizationId, submissionId, currentSequence],
  );
  const rows = res?.rows ?? [];
  if (!rows.length) return { priorSequenceNumber: '', leaves: [] };

  const effective = new Map<string, PriorLeaf>();
  let priorSequenceNumber = '';
  for (const row of rows) {
    const seq = String(row.sequence_number ?? '');
    if (seq) priorSequenceNumber = seq; // rows are ascending: the last is the newest
    for (const leaf of manifestToPriorLeaves(row.leaf_manifest)) {
      // Same identity the lifecycle diff uses (leafKey, else section + filename).
      const key = leaf.leafKey ?? `${leaf.ctdSection}/${leaf.fileName}`;
      if ((leaf.operation ?? '').trim().toLowerCase() === 'delete') {
        effective.delete(key); // withdrawn at the agency — no longer on file
        continue;
      }
      effective.set(key, { ...leaf, sequenceNumber: seq });
    }
  }

  return { priorSequenceNumber, leaves: [...effective.values()] };
}
