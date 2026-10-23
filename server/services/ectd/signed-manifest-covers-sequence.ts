/**
 * @fileoverview Does an orchestrator release signature cover the sequence that would be transmitted?
 * @module server/services/ectd/signed-manifest-covers-sequence
 *
 * ## Why this exists
 *
 * The dispatch path transmits the SUBMISSIONS spine: `ectd_sequences` and that
 * sequence's ordered `submission_leaves` (see `assess-dispatch-readiness`,
 * which computes every other gate from exactly those rows).
 *
 * The orchestrator release signature is taken over a DIFFERENT artifact. A run
 * composes its own leaf manifest in memory and freezes it into the signed
 * snapshot; `submission-package-orchestrator.ts` contains no write to
 * `submission_leaves` at all. `resolveSignedPackageForExport` then verifies
 * that signature by recomputing the bound digest **from the frozen snapshot** —
 * which catches an edit to the snapshot and, by construction, cannot notice
 * that the sequence's live leaves have since become something else.
 * `signed-package-export.ts` says as much in its own header: a caller that
 * wants bytes "must re-render deterministic leaves and check each one against
 * `descriptor.leaves[i].checksum` before shipping". The dispatch gate is such a
 * caller, and it did not.
 *
 * So a release signed over run R's package cleared the dispatch gate for the
 * sequence R named, no matter what that sequence's leaves held by the time the
 * dispatch happened — including leaves placed, replaced or withdrawn after
 * signing. The signature did not bind what would ship, which is the one thing
 * 21 CFR Part 11 §11.70 asks a release signature to do.
 *
 * ## What is compared, and what that claim is worth
 *
 * Every leaf on both sides, by **normalized section code** and **lifecycle
 * operation**, plus the **eCTD index-md5 checksum** wherever both sides carry
 * one for the same leaf. The two checksums are the same contract — `ECTDLeaf`
 * documents its as "MD5 per eCTD spec" and `submission_leaves.checksum` as
 * "MD5 of the leaf's RENDERED bytes — the eCTD index-md5 contract" — so they
 * are comparable, and a difference is a real difference in the bytes that
 * would ship.
 *
 * A leaf that carries no checksum on one side (the column is nullable) is
 * compared on its identity alone, and the result SAYS so: correspondence is
 * reported as `corroboratedLeaves` out of `leafCount`, never as a blanket
 * "verified". This module's job is to catch a signature that demonstrably does
 * not cover the sequence — not to re-establish the sequence's integrity, which
 * is the sequence spine's own digest over the full leaf rows
 * (`BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST`).
 *
 * Known-region coverage also requires the versioned applicant identity frozen
 * into the signed package to equal the current recorded application and sponsor.
 * FDA additionally binds DUNS and regulatory contact. An older intact snapshot without this proof
 * cannot establish coverage; it is not evidence of snapshot tampering.
 *
 * ## Why divergence is not `invalid`
 *
 * The orchestrator's signature is intact over the package it was taken on.
 * What is false is the claim that it covers THIS sequence — so the honest
 * verdict is the one that means "no release signature covers this sequence",
 * and that verdict is the only one `resolveReleaseSignatureStatus` falls
 * through to the sequence spine on. That matters: the sequence spine's
 * signature DOES bind the live leaf rows, so the remedy — sign the sequence
 * that is about to be transmitted — stays one governed click away
 * (`signingNowResolvesRelease`). Reporting `invalid` would both accuse an
 * intact signature of tampering and leave the operator nothing to do.
 *
 * A live-leaf read that cannot run returns `unknown`, which the caller reports
 * as `undetermined`. A failed read is not evidence of correspondence.
 */

import type { Pool } from 'pg';

import { pool as defaultPool } from '../../db.js';
import type { ECTDLeaf } from './ectd4-validator.js';
import { createScopedLogger } from '../../utils/logger.js';
import { canonicalRegionOf, type CanonicalRegion } from '../../../shared/regulatory/region-identity.js';
import {
  packageIdentityRefusal,
  readSubmissionPackageIdentity,
  recordedPackageIdentitySnapshot,
  sameRecordedPackageIdentitySnapshot,
  type RecordedPackageIdentitySnapshot,
} from './package-identity.js';

const log = createScopedLogger('signed-manifest-covers-sequence');

/** The minimum of a leaf that both spines state the same way. */
export interface ComparableLeaf {
  /** eCTD section code, in either spine's spelling. */
  sectionCode: string;
  /** new | replace | append | delete. */
  operation: string;
  /** eCTD index-md5 of the rendered bytes, when the row carries one. */
  checksum: string | null;
}

export type ManifestCoverage =
  | {
      covers: true;
      /** How many leaves the two manifests agree on. */
      leafCount: number;
      /** Of those, how many were also matched on their index-md5. */
      corroboratedLeaves: number;
    }
  | { covers: false; detail: string }
  | { unknown: true; detail: string };

/**
 * One spelling for a section code, so the two spines' vocabularies compare.
 *
 * The orchestrator composes `m3.2.S.1`; `submission_leaves.section_code` holds
 * `3.2.S.4.2` and also `m1.us.cover`. The rule is applied to BOTH sides
 * identically: lower-cased, and a single leading `m` dropped when a digit
 * follows it. Nothing else is rewritten — a code this does not recognise is
 * compared as it stands rather than guessed at.
 */
export function normalizeSectionCode(code: string | null | undefined): string {
  const trimmed = String(code ?? '').trim().toLowerCase();
  return /^m\d/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

/** `new` when a row leaves it unstated — the column's own default. */
function normalizeOperation(op: string | null | undefined): string {
  const trimmed = String(op ?? '').trim().toLowerCase();
  return trimmed === '' ? 'new' : trimmed;
}

function normalizeChecksum(sum: string | null | undefined): string | null {
  const trimmed = String(sum ?? '').trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

/** The identity half of a leaf: what it is, and what this sequence does with it. */
function identityOf(leaf: ComparableLeaf): string {
  return `${normalizeSectionCode(leaf.sectionCode)}|${normalizeOperation(leaf.operation)}`;
}

/** The signed snapshot's leaves, in the shape this module compares. */
export function comparableFromSignedLeaves(leaves: readonly ECTDLeaf[]): ComparableLeaf[] {
  return leaves.map(l => ({
    sectionCode: l.sectionCode,
    operation: l.operation,
    checksum: normalizeChecksum(l.checksum),
  }));
}

function countIdentities(leaves: readonly ComparableLeaf[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const leaf of leaves) {
    const key = identityOf(leaf);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The checksums recorded against one identity, as a multiset. */
function checksumsByIdentity(leaves: readonly ComparableLeaf[]): Map<string, string[]> {
  const sums = new Map<string, string[]>();
  for (const leaf of leaves) {
    const checksum = normalizeChecksum(leaf.checksum);
    if (checksum === null) continue;
    const key = identityOf(leaf);
    const list = sums.get(key);
    if (list) list.push(checksum);
    else sums.set(key, [checksum]);
  }
  return sums;
}

/** At most this many section codes are named in a detail string. */
const NAMED_IN_DETAIL = 4;

function nameSome(keys: readonly string[]): string {
  const sections = keys.map(k => k.split('|')[0]);
  const head = sections.slice(0, NAMED_IN_DETAIL).join(', ');
  const rest = sections.length - NAMED_IN_DETAIL;
  return rest > 0 ? `${head} and ${rest} more` : head;
}

/** Which leaf identities are on one side and not the other, counting duplicates. */
function diffIdentities(
  signed: readonly ComparableLeaf[],
  live: readonly ComparableLeaf[],
): { onlySigned: string[]; onlyLive: string[] } {
  const signedCounts = countIdentities(signed);
  const liveCounts = countIdentities(live);
  const onlySigned: string[] = [];
  const onlyLive: string[] = [];
  for (const [key, n] of signedCounts) {
    const m = liveCounts.get(key) ?? 0;
    for (let i = 0; i < n - m; i++) onlySigned.push(key);
  }
  for (const [key, m] of liveCounts) {
    const n = signedCounts.get(key) ?? 0;
    for (let i = 0; i < m - n; i++) onlyLive.push(key);
  }
  return { onlySigned, onlyLive };
}

/**
 * For the identities both sides fingerprinted: how many index-md5 matched, and
 * which identities carry a signed checksum the live side does not.
 *
 * An identity only one side recorded a checksum for is neither corroborated
 * nor changed — it is simply not evidence about the bytes.
 */
function diffChecksums(
  signed: readonly ComparableLeaf[],
  live: readonly ComparableLeaf[],
): { corroborated: number; changed: string[] } {
  const liveSums = checksumsByIdentity(live);
  let corroborated = 0;
  const changed: string[] = [];
  for (const [key, signedList] of checksumsByIdentity(signed)) {
    const liveList = liveSums.get(key);
    if (!liveList) continue;
    const remaining = [...liveList];
    for (const sum of signedList) {
      const at = remaining.indexOf(sum);
      if (at < 0) continue;
      remaining.splice(at, 1);
      corroborated++;
    }
    if (remaining.length > 0) changed.push(key);
  }
  return { corroborated, changed };
}

/** The sentence for a manifest whose leaves are not this sequence's. */
function manifestDiffersDetail(onlySigned: string[], onlyLive: string[]): string {
  const parts: string[] = [];
  if (onlyLive.length > 0) {
    parts.push(`${onlyLive.length} leaf/leaves the sequence now holds were not signed (${nameSome(onlyLive)})`);
  }
  if (onlySigned.length > 0) {
    parts.push(`${onlySigned.length} signed leaf/leaves are no longer in the sequence (${nameSome(onlySigned)})`);
  }
  return `the signed package's leaf manifest is not this sequence's: ${parts.join('; ')}`;
}

/**
 * Does the signed leaf manifest correspond to the sequence's current leaves?
 *
 * Pure. The two arrays are compared as multisets of (section code, lifecycle
 * operation), and then — for the identities both sides carry a checksum on —
 * as multisets of index-md5. The first difference found is the one reported,
 * in the order an operator would want to hear it: a leaf that is only on one
 * side before a leaf whose bytes differ.
 */
export function signedManifestCoversLeaves(
  signed: readonly ComparableLeaf[],
  live: readonly ComparableLeaf[],
): ManifestCoverage {
  const { onlySigned, onlyLive } = diffIdentities(signed, live);
  if (onlySigned.length > 0 || onlyLive.length > 0) {
    return { covers: false, detail: manifestDiffersDetail(onlySigned, onlyLive) };
  }

  // Same leaves. Now the bytes.
  const { corroborated, changed } = diffChecksums(signed, live);
  if (changed.length > 0) {
    return {
      covers: false,
      detail:
        `the content under ${changed.length} signed leaf/leaves changed after signing ` +
        `(eCTD index-md5 differs for ${nameSome(changed)})`,
    };
  }

  return { covers: true, leafCount: live.length, corroboratedLeaves: corroborated };
}

/**
 * Read the sequence's CURRENT leaves, tenant-scoped, in the comparable shape.
 *
 * The same rows, filter and order the sequence spine's own digest is taken over
 * (`deriveGovernedTargetBinding`, `ectd-sequence:<id>`): live rows only, every
 * lifecycle operation included — a `delete` leaf is part of what ships.
 *
 * Returns `null` on a read that cannot run, which the caller must report as
 * undetermined rather than as an empty sequence.
 */
export async function readSequenceLeavesForComparison(params: {
  sequenceId: number;
  organizationId: number;
  pool?: Pick<Pool, 'query'>;
}): Promise<ComparableLeaf[] | null> {
  const { sequenceId, organizationId } = params;
  const db = params.pool ?? (defaultPool as unknown as Pick<Pool, 'query'>);
  try {
    const { rows } = await db.query(
      `SELECT section_code, lifecycle_op, checksum
         FROM submission_leaves
        WHERE sequence_id = $1::int AND organization_id = $2 AND deleted_at IS NULL
        ORDER BY section_code, id`,
      [sequenceId, organizationId],
    );
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      sectionCode: r.section_code == null ? '' : String(r.section_code),
      operation: r.lifecycle_op == null ? '' : String(r.lifecycle_op),
      checksum: normalizeChecksum(r.checksum == null ? null : String(r.checksum)),
    }));
  } catch (err) {
    log.warn('sequence leaf read failed; coverage cannot be determined', {
      err: err instanceof Error ? err.message : String(err),
      sequenceId,
      organizationId,
    });
    return null;
  }
}

interface SequenceCoverageParams {
  signedLeaves: readonly ECTDLeaf[];
  sequenceId: number;
  /** The submission the caller resolved this sequence from. */
  submissionId?: number;
  organizationId: number;
  region?: string | null;
  recordedPackageIdentity?: RecordedPackageIdentitySnapshot;
  pool?: Pick<Pool, 'query'>;
}

/**
 * Does this signed snapshot cover the sequence that would be transmitted?
 *
 * The one entry point the dispatch gate uses. `unknown` on an unreadable
 * sequence; `covers: false` with a reason an operator can act on otherwise.
 */
export async function signedManifestCoversSequence(params: SequenceCoverageParams): Promise<ManifestCoverage> {
  const live = await readSequenceLeavesForComparison({
    sequenceId: params.sequenceId,
    organizationId: params.organizationId,
    pool: params.pool,
  });
  if (live === null) {
    return {
      unknown: true,
      detail:
        `this sequence's leaves could not be read, so whether the signed package still covers ` +
        `them cannot be determined`,
    };
  }
  const leaves = signedManifestCoversLeaves(comparableFromSignedLeaves(params.signedLeaves), live);
  if (!('covers' in leaves) || !leaves.covers) return leaves;
  return recordedApplicantCoverage(params, leaves);
}

/** Extend leaf correspondence with the actual sequence's recorded regional facts. */
async function recordedApplicantCoverage(
  params: SequenceCoverageParams,
  leaves: Extract<ManifestCoverage, { covers: true }>,
): Promise<ManifestCoverage> {
  const region = canonicalRegionOf(params.region);
  if (!region) return { unknown: true, detail: 'the signed package region is not recognized, so current applicant identity coverage cannot be determined' };
  if (!Number.isInteger(params.submissionId) || Number(params.submissionId) <= 0) {
    return { unknown: true, detail: 'the submission was not resolved, so current applicant identity coverage cannot be determined' };
  }
  const db = params.pool ?? (defaultPool as unknown as Pick<Pool, 'query'>);
  try {
    // Resolve the sequence's actual parent before reading its applicant. A
    // caller's duplicate submission key cannot lend another program's facts
    // to a sequence with coincidentally identical leaves.
    const sequence = await db.query(
      `SELECT submission_id, region FROM ectd_sequences
        WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [params.sequenceId, params.organizationId],
    );
    const context = sequenceIdentityCoverageContext(params, region, sequence.rows[0]);
    if ('detail' in context) return context;
    // Historical records retain their original integrity recipe, but absent or
    // malformed proof cannot authorize the current sequence in any region.
    if (!sameRecordedPackageIdentitySnapshot(params.recordedPackageIdentity, params.recordedPackageIdentity)) {
      return { covers: false, detail: 'the signed package has no intact recorded applicant identity snapshot; sign this sequence over its current applicant facts' };
    }
    const identity = await readSubmissionPackageIdentity(
      { query: (text, values) => db.query(text, values) },
      params.organizationId,
      context.submissionId,
      { region: context.region },
    );
    const refusal = packageIdentityRefusal(identity, 'No release covers these incomplete applicant facts.', { fda: region === 'US' });
    if (refusal) return { covers: false, detail: refusal.message };
    if (!sameRecordedPackageIdentitySnapshot(params.recordedPackageIdentity, recordedPackageIdentitySnapshot(identity, { region }))) {
      return { covers: false, detail: 'the signed package applicant identity differs from the current recorded application, sponsor or regulatory contact; sign this sequence over the current facts' };
    }
    return leaves;
  } catch (err) {
    log.warn('recorded applicant read failed; coverage cannot be determined', {
      err: err instanceof Error ? err.message : String(err),
      sequenceId: params.sequenceId,
      organizationId: params.organizationId,
    });
    return { unknown: true, detail: 'the current recorded applicant identity could not be read, so signed package coverage cannot be determined' };
  }
}

/** A caller's parent/region can only corroborate the sequence's actual row. */
function sequenceIdentityCoverageContext(
  params: SequenceCoverageParams,
  signedRegion: CanonicalRegion,
  sequence: { submission_id?: unknown; region?: unknown } | undefined,
): { submissionId: number; region: string } | Exclude<ManifestCoverage, { covers: true }> {
  const submissionId = Number(sequence?.submission_id);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    return { unknown: true, detail: 'the sequence parent could not be resolved, so current applicant identity coverage cannot be determined' };
  }
  if (submissionId !== params.submissionId) {
    return { covers: false, detail: 'the signed run and current sequence name different submissions; applicant facts from another submission cannot establish coverage' };
  }
  const region = typeof sequence?.region === 'string' ? sequence.region : null;
  const actualRegion = canonicalRegionOf(region);
  if (!actualRegion) {
    return { unknown: true, detail: 'the actual sequence region is not recognized, so current applicant identity coverage cannot be determined' };
  }
  if (actualRegion !== signedRegion) {
    return { covers: false, detail: 'the signed package and actual sequence name different regions; applicant facts from another region cannot establish coverage' };
  }
  return { submissionId, region: region! };
}

export default {
  signedManifestCoversSequence,
  signedManifestCoversLeaves,
  readSequenceLeavesForComparison,
  normalizeSectionCode,
};
