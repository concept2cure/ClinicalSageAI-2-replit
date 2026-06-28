/**
 * Program model — the generator that turns a selected filing into a grounded
 * regulatory program: its client segment, its axes of variance, and its claim
 * spine (the evidence → claim → dossier graph).
 *
 * This is the capstone the other registries hang off:
 *   - document registry  → the projection target (where evidence lands)
 *   - app registry       → the evidence generators (which app supports which claim)
 *   - client-segments    → the axis preset (who, and what counts as evidence)
 *   - claim-spine        → the argument structure
 *   - region-identity    → the projection format (downstream)
 *
 * The four client types are not enumerated journeys; they (and CDx, biosimilars,
 * combination products) GENERATE from axes + claim-spine. Pure, no DB.
 *
 * @module shared/regulatory/program-model
 */

import { resolveToRegistryEntry } from './submission-type-bridge.js';
import type { RegulatoryApplicationType, ProductClass } from './document-taxonomy.js';
import {
  type ClientSegmentId,
  type ClientSegment,
  type EvidenceModel,
  getSegment,
  segmentForProductClasses,
  resolveEvidenceModel,
} from './client-segments.js';
import { getClaimSpine, type ClaimSpine } from './claim-spine.js';

export interface ProgramAxes {
  evidenceModel: EvidenceModel;
  cmcModel: ClientSegment['cmcModel'];
  riskModel: ClientSegment['riskModel'];
  lifecycleModel: ClientSegment['lifecycleModel'];
}

export interface ProgramModel {
  /** The raw selection. */
  need: string;
  known: boolean;
  /** Resolved filing identity. */
  filing: { id: string; displayName: string } | null;
  /** The client segment this program belongs to (null for cross-cutting selections). */
  segment: ClientSegment | null;
  /** The axes of variance for this concrete program (evidence model refined by pathway). */
  axes: ProgramAxes | null;
  /** The argument structure: claims, their evidence-generating apps, and section projections. */
  claimSpine: ClaimSpine | null;
}

/**
 * Generate the grounded program model for a selected need (submission type or
 * document type). Returns nulls (not throws) when the selection has no concrete
 * product segment — e.g. a cross-cutting ICH module or an unknown id.
 */
export function resolveProgramModel(need: string): ProgramModel {
  const key = (need ?? '').trim();
  const entry: RegulatoryApplicationType | null = resolveToRegistryEntry(key);

  if (!entry) {
    return { need: key, known: false, filing: null, segment: null, axes: null, claimSpine: null };
  }

  const productClasses: ProductClass[] = entry.productClass ?? [];
  const segmentId: ClientSegmentId | undefined = segmentForProductClasses(productClasses);

  if (!segmentId) {
    // Known filing, but no concrete product segment (e.g. a shared ICH module).
    return {
      need: key,
      known: true,
      filing: { id: entry.id, displayName: entry.displayName },
      segment: null,
      axes: null,
      claimSpine: null,
    };
  }

  const segment = getSegment(segmentId);
  const evidenceModel = resolveEvidenceModel(segmentId, entry.applicationFamily, productClasses);

  const axes: ProgramAxes = {
    evidenceModel,
    cmcModel: segment.cmcModel,
    riskModel: segment.riskModel,
    lifecycleModel: segment.lifecycleModel,
  };

  return {
    need: key,
    known: true,
    filing: { id: entry.id, displayName: entry.displayName },
    segment,
    axes,
    claimSpine: getClaimSpine(evidenceModel),
  };
}

export default { resolveProgramModel };
