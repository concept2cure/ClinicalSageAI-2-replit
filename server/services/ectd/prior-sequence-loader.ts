/**
 * Prior-sequence loader — reads a stored sequence leaf manifest back into the
 * lifecycle operator's PriorLeaf shape, tenant-scoped.
 *
 * This is the read half of the sequence-manifest feature. Given an application
 * + a prior sequence number, it returns the state on file at the agency through
 * that sequence for the caller's organization, so a new sequence can be diffed
 * against exactly what shipped, without the caller hand-supplying every prior
 * href. Only sequences sent or acknowledged count, and each is read from what
 * its transmit recorded it sent (the leaf manifest the transmit guard stamps on
 * the transmittal row before the wire, submission-gateways/index.ts); a
 * sequence sent before the guard kept that is read from its compiles
 * (ectd_compilations.leaf_manifest), and labelled so. 2026-11-01 (F1, rows D7
 * and D2): it read compiles only, so a leaf only a draft preview carried read as
 * on file, and a sequence sent with no compile was missing.
 *
 * The pool is injected so the query is unit-testable with a stub; production
 * callers pass the app's pg pool. The organization filter is ALWAYS applied —
 * a prior sequence is never read across tenants.
 *
 * @module server/services/ectd/prior-sequence-loader
 */

import { manifestToPriorLeaves } from './sequence-manifest';
import type { PriorLeaf } from './lifecycle-operator';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';

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
 * Still finding the submission through a compile (2026-11-01, F1): a sequence
 * sent with no compile on record, which the fold now reads from its transmit,
 * is refused here. That fails closed; reading it is owed. The refusal says the
 * lookup found nothing, never that the sequence is not on file, which the
 * current view may show it is (F1 review).
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
    // True whether or not the agency holds it: this read cannot see a sequence
    // sent with no compile, which the filed state reads from its send (F1
    // review, 2026-11-01), so it never says the sequence is not on file.
    throw new PriorSequenceNotFoundError(
      `${named} could not be found by its number: that lookup goes through a compile of the sequence made for ` +
        'filing, and none of this organization was sent or acknowledged (a preview or rehearsal compile is not ' +
        'filed). Nothing was loaded. If it was sent with no compile, it can still be on file; read the prior state ' +
        'from the submission it belongs to instead.',
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
     only; if its sequence is later sent, what was sent is its transmit's
     record (or, before that record was kept, a separate compile). Without this
     predicate a sent sequence's rehearsal manifest was folded in as if the
     agency held it.
     WHAT WAS SENT, NOT WHAT WAS COMPILED (2026-11-01, F1, rows D7 and D2).
     Every compile of a sent sequence was folded, previews made while it was a
     draft included, so a leaf only a preview carried read as on file; and a
     sequence sent with no compile was missing, so the next one bound against
     an empty prior. Each sent sequence is now read from the leaf manifest its
     transmit recorded (readFiledManifestRows).
     NOTHING IS BOUND AGAINST A SENT SEQUENCE NO RECORD DESCRIBES (2026-11-01,
     F1 review). A sequence sent before the guard kept its record, and never
     compiled, has neither record. Leaving it out bound the next sequence against
     a partial state: every leaf it filed came back absent (so 'new', with no
     modified-file) or stale (a modified-file into a sequence it superseded), and
     compile, freeze, dispatch and transmit all went ahead. A partial view is not
     the view, so this refuses, naming it. The current view still lists it, as
     not included (loadFiledStateBySubmission). */
  const rows = await readFiledManifestRows(pool, organizationId, submissionId, currentSequence);
  const unrecorded = rows.filter((r) => r.basis === 'none').map((r) => r.sequence_number);
  if (unrecorded.length > 0) throw new Error(unrecordedRefusal(unrecorded));
  const { priorSequenceNumber, leaves } = foldManifestRows(rows);
  return { priorSequenceNumber, leaves };
}

/** Why nothing is bound against a filed history with a sent sequence no record describes. */
function unrecordedRefusal(sequences: string[]): string {
  const one = sequences.length === 1;
  const named = one
    ? `Sequence ${sequences[0]} was`
    : `Sequences ${sequences.slice(0, -1).join(', ')} and ${sequences[sequences.length - 1]} were`;
  return (
    `${named} sent to the agency, but nothing on record says what ${one ? 'it' : 'they'} carried: ` +
    'no record of the send, and no compile. What is on file cannot be read, so nothing was bound against it.'
  );
}

/**
 * Where a filed sequence's record of what it put on file comes from:
 * 'transmit', the leaf manifest its transmit recorded it sent; 'compiles', its
 * compiles, for a sequence sent before the transmit guard kept that record.
 */
export type FiledRecordBasis = 'transmit' | 'compiles';

/** One row of the filed record: a sequence, the manifest it filed, and where that came from. */
interface FiledRecordRow {
  sequence_number: string;
  /** Null only for basis 'none'. */
  leaf_manifest: unknown;
  /** 'none': sent, with neither a record of the send nor a compile; it adds no leaves. */
  basis: FiledRecordBasis | 'none';
}

/**
 * The filed record of a submission, oldest sequence first: for each sequence
 * the agency holds (above), strictly before `before` when it is given, what it
 * sent. The one read both the lifecycle diff and the current view fold; each
 * row names its `basis`.
 *
 * What a sequence sent is the transmittal its own transmit attempt wrote: a row
 * of this organization whose `metadata.dispatchBinding` names the sequence's
 * `transmit_attempt_id`, its id and its `transmit_signature_action_id`, and
 * which the sequence's own agency's gateway wrote (the row's `region` is the
 * sequence's region, compared through canonicalRegionOf, the one resolver
 * across the two vocabularies). The transmit guard stamps the binding and
 * `metadata.leafManifest` before the wire, server-side, from the package it
 * hands the gateway (submission-gateways/index.ts, 2026-11-01, F1).
 * transmitSequence sends a sequence only through its region's gateway
 * (transmitRouteFor), so a row of another agency binding it is not its send.
 * A resend after a rejection takes a new attempt id, so the rejected send is
 * not read.
 *
 * Why the agency and the signature (2026-11-01, F1 review). Before the guard
 * stamped these keys, the EMA gateways stored a caller's metadata verbatim
 * (`POST /api/mdx/gateways/:region/:gateway/transmit` takes any record), so a
 * row written then can carry a binding and a manifest nobody sent. The one
 * gateway that already set the binding itself, FDA ESG, wrote no manifest. So
 * every row binding the attempt counts, with or without a manifest:
 *   - exactly one, carrying a manifest: the sequence contributes it, and none
 *     of its compiles (`basis: 'transmit'`);
 *   - more than one: two records of one send cannot both be what was sent, and
 *     choosing one is guessing what the agency holds. It throws, naming the
 *     sequence, as an unreadable stored manifest does: a partial view is not
 *     the view;
 *   - none, or one with no manifest (sent before the guard kept the record):
 *     the sequence keeps the earlier read, every non-rehearsal compile of it,
 *     each row `basis: 'compiles'`. That read includes previews made while it
 *     was a draft; nothing better is on record for it, and the view says so;
 *   - and with no compile either, one row `basis: 'none'`, with no manifest:
 *     sent, and nothing on record says what it carried. It adds no leaves; the
 *     lifecycle read refuses it and the view lists it as not included.
 *
 * ectd_compilations.leaf_manifest is json and the transmittal's metadata is
 * jsonb, so both sides are cast to json for the union.
 */
async function readFiledManifestRows(
  pool: PoolLike,
  organizationId: number,
  submissionId: number,
  before: string | null,
): Promise<FiledRecordRow[]> {
  const res = await pool.query(
    `WITH filed AS (
       SELECT s.id, s.sequence_number, s.region, s.transmit_attempt_id, s.transmit_signature_action_id
         FROM ectd_sequences s
        WHERE s.organization_id = $1
          AND s.submission_id = $2
          AND s.deleted_at IS NULL
          AND s.dispatch_status IN ('sent', 'acknowledged')
          AND ($3::text IS NULL OR s.sequence_number < $3)
     )
     SELECT f.sequence_number, 'sequence' AS kind, f.region AS sequence_region, NULL::text AS transmittal_region,
            NULL::json AS leaf_manifest, NULL::integer AS transmittal_id, NULL::timestamptz AS compiled_at, NULL::integer AS compilation_id
       FROM filed f
     UNION ALL
     SELECT f.sequence_number, 'transmittal', f.region, t.region,
            CASE WHEN jsonb_typeof(t.metadata -> 'leafManifest') = 'array' THEN (t.metadata -> 'leafManifest')::json END,
            t.id, NULL::timestamptz, NULL::integer
       FROM filed f
       JOIN submission_transmittals t
         ON t.organization_id = $1
        AND lower(t.metadata -> 'dispatchBinding' ->> 'attemptId') = f.transmit_attempt_id::text
        AND t.metadata -> 'dispatchBinding' ->> 'sequenceId' = f.id::text
        AND t.metadata -> 'dispatchBinding' ->> 'signatureActionId' = f.transmit_signature_action_id
     UNION ALL
     SELECT c.sequence_number, 'compile', f.region, NULL::text, c.leaf_manifest::json, NULL::integer, c.compiled_at::timestamptz, c.id
       FROM filed f
       JOIN ectd_compilations c
         ON c.organization_id = $1
        AND c.submission_id = $2
        AND c.sequence_number = f.sequence_number
      WHERE c.leaf_manifest IS NOT NULL
        AND c.compilation_type IS DISTINCT FROM 'rehearsal'
      ORDER BY sequence_number ASC, compiled_at ASC NULLS FIRST, compilation_id ASC NULLS FIRST, transmittal_id ASC NULLS FIRST`,
    [organizationId, submissionId, before],
  );
  type Read = { region: unknown; sent: Array<Record<string, unknown>>; compiles: Array<Record<string, unknown>> };
  const bySequence = new Map<string, Read>(); // ascending: the rows are
  for (const row of res?.rows ?? []) {
    const seq = String(row.sequence_number ?? '');
    const read = bySequence.get(seq) ?? { region: row.sequence_region, sent: [], compiles: [] };
    bySequence.set(seq, read);
    if (row.kind === 'compile') read.compiles.push(row);
    // Its own agency's gateway wrote it; an unknown region is never a match.
    else if (row.kind === 'transmittal' && sameAgency(read.region, row.transmittal_region)) read.sent.push(row);
  }
  const rows: FiledRecordRow[] = [];
  for (const [seq, read] of bySequence) {
    if (read.sent.length > 1) {
      throw new Error(
        `Sequence ${seq} is bound to more than one transmittal of what it sent (${read.sent.map((t) => t.transmittal_id).join(', ')}); ` +
          'what is on file cannot be read, so none of it was.',
      );
    }
    const record = read.sent[0]?.leaf_manifest;
    if (record != null) rows.push({ sequence_number: seq, leaf_manifest: record, basis: 'transmit' });
    else if (read.compiles.length > 0) {
      for (const c of read.compiles) rows.push({ sequence_number: seq, leaf_manifest: c.leaf_manifest, basis: 'compiles' });
    } else rows.push({ sequence_number: seq, leaf_manifest: null, basis: 'none' });
  }
  return rows;
}

/** Whether a sequence's region and a transmittal's gateway region name one agency ('fda'/'fda', 'eu'/'ema'). */
function sameAgency(sequenceRegion: unknown, transmittalRegion: unknown): boolean {
  const ours = canonicalRegionOf(typeof sequenceRegion === 'string' ? sequenceRegion : null);
  return ours !== undefined && ours === canonicalRegionOf(typeof transmittalRegion === 'string' ? transmittalRegion : null);
}

/** A sequence of the submission, and whether the agency holds it. */
export interface SubmissionSequenceState {
  sequenceNumber: string;
  /** 'sent' or 'acknowledged' when filed; otherwise what it is (pending, transmitting, rejected, or none). */
  dispatchStatus: string | null;
  /** True when the fold read a record of what it sent (either basis). */
  filed: boolean;
  /** Where that record came from (readFiledManifestRows); null when not filed. */
  basis: FiledRecordBasis | null;
}

/**
 * What the agency holds for a submission NOW: every filed sequence folded,
 * exactly as compile and transmit fold the prior state (gap 6.1,
 * docs/design/VEEVA_GAP_2026-10-22.md) — with no upper bound, and each leaf
 * naming the sequence that holds it and the act that put it there. Beside it,
 * every sequence of the submission, whether it is filed, and what its record
 * is read from (`basis`), so a reader is told which sequences the view does not
 * include and which are read from compiles rather than from what was sent.
 *
 * Organization-scoped. A stored manifest that cannot be read throws, as it
 * does for compile: a partial current view is not the current view.
 */
export async function loadFiledStateBySubmission(
  pool: PoolLike,
  args: { organizationId: number; submissionId: number },
): Promise<{ throughSequence: string | null; leaves: Array<PriorLeaf & { history: FiledAct[] }>; sequences: SubmissionSequenceState[] }> {
  const { organizationId, submissionId } = args;
  if (!organizationId || !submissionId) {
    throw new Error('Cannot read what is on file without the organization and the submission; nothing was read.');
  }
  // One after the other: the caller may pass a single request client.
  const rows = await readFiledManifestRows(pool, organizationId, submissionId, null);
  const seqs = await pool.query(
    `SELECT sequence_number, dispatch_status FROM ectd_sequences
      WHERE organization_id = $1 AND submission_id = $2 AND deleted_at IS NULL
      ORDER BY sequence_number ASC`,
    [organizationId, submissionId],
  );
  // A sent sequence no record describes adds no leaves and is not filed here;
  // it is listed below as not included.
  const recorded = rows.filter((r) => r.basis !== 'none');
  const { priorSequenceNumber, leaves: onFile, history } = foldManifestRows(recorded);
  const leaves = onFile.map((leaf) => ({ ...leaf, history: history.get(leaf) ?? [] }));
  // A sequence's rows share one basis (readFiledManifestRows reads its
  // compiles only when it has no transmit record).
  const basisOf = new Map<string, FiledRecordBasis>();
  for (const r of recorded) basisOf.set(r.sequence_number, r.basis === 'transmit' ? 'transmit' : 'compiles');
  const sequences = (seqs?.rows ?? []).map((r) => {
    const sequenceNumber = String(r.sequence_number ?? '');
    const dispatchStatus = r.dispatch_status == null ? null : String(r.dispatch_status);
    const basis = basisOf.get(sequenceNumber) ?? null;
    return { sequenceNumber, dispatchStatus, filed: basis !== null, basis };
  });
  return { throughSequence: priorSequenceNumber || null, leaves, sequences };
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
 *
 * Each leaf on file also keeps the acts that put it there, oldest first
 * (`history`, gap 6.2): its own earlier filings under the same identity, and,
 * through a replace that names another leaf, that leaf's acts too. Compile and
 * transmit read `leaves` only; the history is for the current view.
 */
function foldManifestRows(
  rows: ReadonlyArray<{ sequence_number?: unknown; leaf_manifest?: unknown }>,
): { priorSequenceNumber: string; leaves: PriorLeaf[]; history: Map<PriorLeaf, FiledAct[]> } {
  const effective = new Map<string, PriorLeaf>();
  const acts = new Map<string, FiledAct[]>();
  let priorSequenceNumber = '';
  for (const row of rows) {
    const seq = String(row.sequence_number ?? '');
    if (seq) priorSequenceNumber = seq; // rows are ascending: the last is the newest
    for (const leaf of manifestToPriorLeaves(row.leaf_manifest, seq || undefined)) {
      // Same identity the lifecycle diff uses (leafKey, else section + filename).
      const key = leaf.leafKey ?? `${leaf.ctdSection}/${leaf.fileName}`;
      const operation = (leaf.operation ?? '').trim().toLowerCase();
      const heldUnderKey = effective.has(key);
      const takenOff = operation === 'replace' || operation === 'delete' ? dropNamedLeaf(effective, leaf.modifiedFile) : [];
      recordFiledAct(acts, key, { sequenceNumber: seq, operation: operation || 'new', fileName: leaf.fileName, md5: leaf.md5 },
        heldUnderKey ? [...takenOff, key] : takenOff);
      if (operation === 'delete') {
        effective.delete(key); // withdrawn — no longer on file
        continue;
      }
      const onFile: PriorLeaf = { ...leaf, sequenceNumber: seq };
      delete onFile.modifiedFile; // what this leaf's act named, not part of what is on file
      effective.set(key, onFile);
    }
  }
  const history = new Map<PriorLeaf, FiledAct[]>();
  for (const [key, leaf] of effective) history.set(leaf, acts.get(key) ?? []);
  return { priorSequenceNumber, leaves: [...effective.values()], history };
}

/** One filed act on a leaf: the sequence it was in, what it did, and the file it carried. */
export interface FiledAct {
  sequenceNumber: string;
  operation: string;
  fileName: string;
  md5: string;
}

/**
 * Add one filed act to the history it belongs to. `affected` names the leaves
 * on file the act touches (those a replace or delete took off file, and its own
 * when it was on file). A withdrawal is the withdrawn document's act: filed
 * again later, its history says so. A replace under a new name takes the acts
 * of what it took off file with it; the old name, filed again later, starts
 * its own.
 */
function recordFiledAct(acts: Map<string, FiledAct[]>, key: string, act: FiledAct, affected: string[]): void {
  if (act.operation === 'delete') {
    for (const k of new Set(affected)) acts.set(k, [...(acts.get(k) ?? []), act]);
    return;
  }
  const others = affected.filter((k) => k !== key);
  const carried = others.flatMap((k) => acts.get(k) ?? []);
  for (const k of others) acts.delete(k);
  acts.set(key, [...carried, ...(acts.get(key) ?? []), act]);
}

/** Take off file the one leaf a modified-file pointer names, if it is on file; the keys taken off. */
function dropNamedLeaf(effective: Map<string, PriorLeaf>, modifiedFile: string | undefined): string[] {
  const named = MODIFIED_FILE.exec(modifiedFile ?? '');
  if (!named) return [];
  const [, sequence, backbone, leafId] = named;
  const dropped: string[] = [];
  for (const [key, leaf] of effective) {
    if (leaf.sequenceNumber === sequence && leaf.backbone === backbone && leaf.leafId === leafId) {
      effective.delete(key);
      dropped.push(key);
    }
  }
  return dropped;
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
  const { priorSequenceNumber, leaves } = foldManifestRows(rows);
  return { priorSequenceNumber, leaves, unfiledSequences };
}
