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
 * Load the manifest of the MOST RECENT sequence strictly before `currentSequence`
 * for this SUBMISSION — keyed on the stable `submission_id` (submissions.id)
 * rather than the fragile `application_number`, which some compile paths set to a
 * sequence-specific fallback that could never align across sequences. This is the
 * canonical lifecycle lookup: given the submission being compiled and the sequence
 * number about to ship, it returns the exact leaves the predecessor published.
 * Organization-scoped; empty when there is no prior sequence.
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
      ORDER BY sequence_number DESC, compiled_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [organizationId, submissionId, currentSequence],
  );
  if (!res?.rows?.length) return { priorSequenceNumber: '', leaves: [] };
  return {
    priorSequenceNumber: String(res.rows[0].sequence_number ?? ''),
    leaves: manifestToPriorLeaves(res.rows[0].leaf_manifest),
  };
}
