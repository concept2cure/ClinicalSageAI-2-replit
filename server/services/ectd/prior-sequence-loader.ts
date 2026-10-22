/**
 * Prior-sequence loader — reads a stored sequence leaf manifest back into the
 * lifecycle operator's PriorLeaf shape, tenant-scoped.
 *
 * This is the read half of the sequence-manifest feature (compile paths that
 * persist a leaf manifest onto ectd_compilations are the write half). Given an
 * application + a prior sequence number, it returns the state on file at the
 * agency through that sequence for the caller's organization — only compiles
 * that were sent or acknowledged — so a new sequence can be diffed against
 * exactly what shipped, without the caller hand-supplying every prior href.
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
 * A prior sequence named for lifecycle diffing that is not on file at the agency
 * for this organization and application. Nothing can be diffed against it: an
 * empty prior would make every leaf `new`, telling the agency it was never filed.
 */
export class PriorSequenceNotFoundError extends Error {
  readonly code = 'PRIOR_SEQUENCE_NOT_FOUND';
  constructor(detail: string) {
    super(`PRIOR_SEQUENCE_NOT_FOUND: ${detail}`);
    this.name = 'PriorSequenceNotFoundError';
  }
}

/**
 * The state on file at the agency after a NAMED prior sequence, as PriorLeaf[]
 * for lifecycle diffing: the filed history of the submission that filed it, up
 * to and including it, folded by loadLatestPriorManifestBySubmission (each leaf
 * carries the sequence that holds it). The application number finds that
 * submission through the named sequence's filed compile.
 *
 * Throws when an identifier is missing, and PriorSequenceNotFoundError when the
 * named sequence is not on file (never compiled, compiled but never sent or
 * acknowledged, or only rehearsed). 2026-10-15: this read the newest compile of
 * that one sequence (a never-sent preview counted as on file; leaves filed in
 * earlier sequences were missing) and answered [] when nothing matched, which
 * the AnA tool reported as every leaf `new`. loadLatestPriorManifest, its
 * application-number sibling with the same read and no production caller, was
 * removed with it; loadLatestPriorManifestBySubmission is the canonical read.
 */
export async function loadPriorSequenceManifest(
  pool: PoolLike,
  args: LoadPriorSequenceArgs,
): Promise<PriorLeaf[]> {
  const { organizationId, applicationNumber, priorSequenceNumber } = args;
  if (!organizationId || !applicationNumber || !priorSequenceNumber) {
    const missing = [
      !organizationId && 'organization',
      !applicationNumber && 'application number',
      !priorSequenceNumber && 'prior sequence number',
    ].filter(Boolean);
    throw new Error(`Cannot load a prior sequence without its ${missing.join(' and ')}; nothing was read.`);
  }
  if (!/^\d{4}$/.test(priorSequenceNumber) || priorSequenceNumber === '9999') {
    throw new Error(`Prior sequence "${priorSequenceNumber}" is not a four-digit eCTD sequence that another can follow.`);
  }

  const filed = await pool.query(
    `SELECT DISTINCT c.submission_id
       FROM ectd_compilations c
       JOIN ectd_sequences s
         ON s.submission_id = c.submission_id
        AND s.sequence_number = c.sequence_number
        AND s.organization_id = c.organization_id
        AND s.deleted_at IS NULL
      WHERE c.organization_id = $1
        AND c.application_number = $2
        AND c.sequence_number = $3
        AND c.leaf_manifest IS NOT NULL
        AND c.compilation_type IS DISTINCT FROM 'rehearsal'
        AND s.dispatch_status IN ('sent', 'acknowledged')`,
    [organizationId, applicationNumber, priorSequenceNumber],
  );
  const submissionIds = (filed?.rows ?? []).map((r) => Number(r.submission_id)).filter(Number.isInteger);
  const named = `sequence ${priorSequenceNumber} of application ${applicationNumber}`;
  if (submissionIds.length === 0) {
    throw new PriorSequenceNotFoundError(
      `${named} is not on file for this organization: no compile of it with a leaf manifest was sent or ` +
        'acknowledged (a preview or rehearsal compile is not filed).',
    );
  }
  if (submissionIds.length > 1) {
    throw new Error(
      `${named} was filed under more than one submission (${submissionIds.join(', ')}); the prior state is ambiguous, so none was loaded.`,
    );
  }

  // The fold reads strictly before its bound, so the bound is the next sequence.
  const fold = await loadLatestPriorManifestBySubmission(pool, {
    organizationId,
    submissionId: submissionIds[0],
    currentSequence: String(Number(priorSequenceNumber) + 1).padStart(4, '0'),
  });
  if (fold.priorSequenceNumber !== priorSequenceNumber) {
    throw new PriorSequenceNotFoundError(`${named} is not in the filed history of submission ${submissionIds[0]}.`);
  }
  return fold.leaves;
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
  /* ONLY WHAT THE AGENCY ACTUALLY HOLDS.
     This read was organization + submission + sequence_number < current +
     leaf_manifest IS NOT NULL, with no join to `ectd_sequences` and no look at
     dispatch state. But `ectd_compilations` rows are written by an ordinary
     PREVIEW compile (POST /api/ectd/:projectIdent/compile), which stores a full
     leaf_manifest for a sequence still in `status='draft'`, possibly reporting
     submissionReady:false with blockers, and transmitted to nobody.

     The consumer treats what this returns as the complete state on file — "a
     prior leaf this sequence does not mention is still on file, unchanged"
     (package-from-core.ts). So a local draft compile of 0001 made sequence 0002
     believe the agency already held those documents: every leaf came back
     `unchanged` and the package shipped with NO FILES, audited as a success
     with leafCount 0. Where a leaf did differ, its `modified-file` pointed into
     ../0001/, a folder the agency never received.

     The rule is already stated in the sibling package model: "A bundle that was
     assembled and never transmitted is not on file at the agency and must not
     appear in the prior state, so the history is appended at successful
     transmit, never at assembly" (package-sequence-lifecycle.ts). This is the
     core path held to it.

     'sent' and 'acknowledged' are the two dispatch states that mean the agency
     has it. 'pending' does NOT: `status='dispatched'` sets dispatch_status
     'pending', which is queued for transmit, not filed. A compilation with no
     matching sequence row is dropped for the same reason — we cannot establish
     that it was filed, and assuming it was is the direction that ships an empty
     package. Assuming it was not merely re-files a document the agency already
     holds, which a reviewer can see; the other way round, nobody can. */
  /* A REHEARSAL compile is never filed state (2026-09-23, W5/D7). It binds a
     sequence against earlier sequences that were never sent, for validation
     only; if its sequence is later sent, what was sent is a separate compile.
     Without this predicate a sent sequence's rehearsal manifest was folded in
     as if the agency held it. */
  const res = await pool.query(
    `SELECT c.sequence_number, c.leaf_manifest
       FROM ectd_compilations c
       JOIN ectd_sequences s
         ON s.submission_id = c.submission_id
        AND s.sequence_number = c.sequence_number
        AND s.organization_id = c.organization_id
        AND s.deleted_at IS NULL
      WHERE c.organization_id = $1
        AND c.submission_id = $2
        AND c.sequence_number < $3
        AND c.leaf_manifest IS NOT NULL
        AND c.compilation_type IS DISTINCT FROM 'rehearsal'
        AND s.dispatch_status IN ('sent', 'acknowledged')
      ORDER BY c.sequence_number ASC, c.compiled_at ASC NULLS FIRST, c.id ASC`,
    [organizationId, submissionId, currentSequence],
  );
  return foldManifestRows(res?.rows ?? []);
}

/** The filed leaf a `modified-file` pointer names: its sequence, backbone and ID. */
const MODIFIED_FILE = /^(?:\.\.\/)+([0-9A-Za-z._-]+)\/((?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.xml)#([A-Za-z_][A-Za-z0-9._-]*)$/;

/**
 * Fold stored manifests, oldest sequence first, into the state they leave on
 * file: a later filing of a leaf supersedes an earlier one, a leaf whose last
 * operation is a delete drops out, and each surviving leaf remembers the
 * sequence that holds it (its modified-file pointer traverses there).
 *
 * A `replace` or `delete` also takes off file the leaf its modified-file names,
 * matched by the sequence, backbone and ID recorded for it — the act's own
 * statement of what it superseded. Matching by name alone kept a version on
 * file after a later version replaced it under its own name (P-42, 2026-10-22).
 * An `append` adds to the leaf it names; both stay on file.
 */
function foldManifestRows(
  rows: Array<Record<string, unknown>>,
): { priorSequenceNumber: string; leaves: PriorLeaf[] } {
  const effective = new Map<string, PriorLeaf>();
  let priorSequenceNumber = '';
  for (const row of rows) {
    const seq = String(row.sequence_number ?? '');
    if (seq) priorSequenceNumber = seq; // rows are ascending: the last is the newest
    for (const leaf of manifestToPriorLeaves(row.leaf_manifest, seq || undefined)) {
      // Same identity the lifecycle diff uses (leafKey, else section + filename).
      const key = leaf.leafKey ?? `${leaf.ctdSection}/${leaf.fileName}`;
      const operation = (leaf.operation ?? '').trim().toLowerCase();
      if (operation === 'replace' || operation === 'delete') dropNamedLeaf(effective, leaf.modifiedFile);
      if (operation === 'delete') {
        effective.delete(key); // withdrawn — no longer on file
        continue;
      }
      const onFile: PriorLeaf = { ...leaf, sequenceNumber: seq };
      delete onFile.modifiedFile; // what this leaf's act named, not part of what is on file
      effective.set(key, onFile);
    }
  }
  return { priorSequenceNumber, leaves: [...effective.values()] };
}

/** Take off file the one leaf a modified-file pointer names, if it is on file. */
function dropNamedLeaf(effective: Map<string, PriorLeaf>, modifiedFile: string | undefined): void {
  const named = MODIFIED_FILE.exec(modifiedFile ?? '');
  if (!named) return;
  const [, sequence, backbone, leafId] = named;
  for (const [key, leaf] of effective) {
    if (leaf.sequenceNumber === sequence && leaf.backbone === backbone && leaf.leafId === leafId) effective.delete(key);
  }
}

/**
 * The REHEARSAL prior state of a submission as of `currentSequence`: the
 * LATEST recorded compile of each earlier sequence, whether or not it was ever
 * sent, folded exactly as the filed state is — and the sequences among them
 * that were not filed, so every caller can say so. 2026-09-23 (W5/D7; JM's
 * decision for WO-9 Click 6).
 *
 * For validation only. Nothing built on it is filed state: the filed loader
 * above never reads a rehearsal compile, and transmit assembles against the
 * filed state. One compile per sequence (the latest), because a rehearsal asks
 * what that sequence holds now — not every draft of it. Organization-scoped.
 */
export async function loadRehearsalPriorManifestBySubmission(
  pool: PoolLike,
  args: { organizationId: number; submissionId: number; currentSequence: string },
): Promise<{ priorSequenceNumber: string; leaves: PriorLeaf[]; unfiledSequences: string[] }> {
  const { organizationId, submissionId, currentSequence } = args;
  if (!organizationId || !submissionId || !currentSequence) {
    return { priorSequenceNumber: '', leaves: [], unfiledSequences: [] };
  }
  const res = await pool.query(
    `SELECT DISTINCT ON (c.sequence_number)
            c.sequence_number, c.leaf_manifest, s.dispatch_status
       FROM ectd_compilations c
       JOIN ectd_sequences s
         ON s.submission_id = c.submission_id
        AND s.sequence_number = c.sequence_number
        AND s.organization_id = c.organization_id
        AND s.deleted_at IS NULL
      WHERE c.organization_id = $1
        AND c.submission_id = $2
        AND c.sequence_number < $3
        AND c.leaf_manifest IS NOT NULL
      ORDER BY c.sequence_number ASC, c.compiled_at DESC NULLS LAST, c.id DESC`,
    [organizationId, submissionId, currentSequence],
  );
  const rows = res?.rows ?? [];
  const unfiledSequences = rows
    .filter((r) => !['sent', 'acknowledged'].includes(String(r.dispatch_status ?? '')))
    .map((r) => String(r.sequence_number ?? ''));
  return { ...foldManifestRows(rows), unfiledSequences };
}
