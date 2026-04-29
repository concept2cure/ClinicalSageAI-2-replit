/**
 * Defense Packet Staleness Propagation
 *
 * Push-based bridge that flips `defense_packets.status='STALE'` when an
 * upstream input changes (claim text/status, predicate selection, supporting
 * evidence object). Pull-based staleness checks already exist via the Shadow
 * Service endpoint `POST /predicate/device/defense-packet/:id/staleness-check`;
 * this module is the complementary push side that does not require a manual
 * per-packet round trip.
 *
 * Composes on existing infrastructure (no new tables):
 *   - data_lineage_records   stores packet→source dependencies
 *   - defense_packets        already has status + staleness_reason columns
 *   - data-lineage-service   provides recordLineageBatch, traceDownstream
 *   - audit/auditLogger      provides Part 11 audit events
 *
 * Dependencies are registered AFTER a packet is built (the build flow proxies
 * to Shadow and we do not modify it). Callers should invoke
 * `registerPacketDependencies(packetId)` once the packet row is RENDERED.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import { defensePackets } from '../../../shared/schema/defense-packets';
import { evidenceClaims } from '../../../shared/schema';
import {
  recordLineageBatch,
  traceDownstream,
} from '../data-lineage-service';
import { logAuditEvent } from '../audit/auditLogger';

// ─────────────────────────────────────────────────────────────────────────────
// Source-object types stored in data_lineage_records as `sourceObjectType`
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCE_TYPE_PREDICATE = 'predicate_device';
export const SOURCE_TYPE_EVIDENCE = 'evidence_object';
export const SOURCE_TYPE_CLAIM = 'evidence_claim';
export const SOURCE_TYPE_RISK_VOCAB = 'risk_vocab';
export const SOURCE_TYPE_RISK_CODE_MAP = 'risk_code_map';
export const TARGET_TYPE_DEFENSE_PACKET = 'defense_packet';

// ─────────────────────────────────────────────────────────────────────────────
// Dependency extraction
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractedDependencies {
  evidenceObjectIds: Set<string>;
  predicateKNumbers: Set<string>;
  riskVocabHash: string | null;
  riskCodeMapVersion: string | null;
}

/**
 * Extract the set of upstream dependencies a packet was built from. Reads
 * `tasks` and `se_payload` JSONB and the columns `predicate_k_number`,
 * `risk_vocab_hash`, `risk_code_map_version`.
 *
 * Defensive: tolerates missing fields (older packets, partial Shadow output).
 */
function extractDependencies(packet: {
  predicateKNumber: string;
  riskVocabHash: string;
  riskCodeMapVersion: string;
  tasks: unknown;
  sePayload: unknown;
}): ExtractedDependencies {
  const evidence = new Set<string>();

  // Walk se_payload.comparison_rows[*].subject_evidence_ids and predicate_evidence_ids
  const sep = packet.sePayload as
    | { comparison_rows?: Array<Record<string, unknown>> }
    | undefined;
  const rows = Array.isArray(sep?.comparison_rows) ? sep!.comparison_rows : [];
  for (const row of rows) {
    const subj = row.subject_evidence_ids;
    if (Array.isArray(subj)) for (const id of subj) if (typeof id === 'string') evidence.add(id);
    const pred = row.predicate_evidence_ids;
    if (Array.isArray(pred)) for (const id of pred) if (typeof id === 'string') evidence.add(id);
  }

  // tasks[*].mapping.evidence_ids — if the task seed carries them
  const tasks = Array.isArray(packet.tasks) ? (packet.tasks as Array<Record<string, unknown>>) : [];
  for (const t of tasks) {
    const mapping = t.mapping as Record<string, unknown> | undefined;
    const ids = mapping?.evidence_ids;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') evidence.add(id);
  }

  return {
    evidenceObjectIds: evidence,
    predicateKNumbers: new Set([packet.predicateKNumber].filter(Boolean)),
    riskVocabHash: packet.riskVocabHash || null,
    riskCodeMapVersion: packet.riskCodeMapVersion || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Register dependencies after a packet is built / rendered
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterResult {
  packetId: string;
  recordedCount: number;
  evidenceCount: number;
  predicateCount: number;
  vocabRecorded: boolean;
}

export async function registerPacketDependencies(
  packetId: string,
  opts: { createdById?: number } = {}
): Promise<RegisterResult | null> {
  const [packet] = await db
    .select()
    .from(defensePackets)
    .where(eq(defensePackets.id, packetId))
    .limit(1);
  if (!packet) return null;

  const deps = extractDependencies(packet as any);

  const entries: Parameters<typeof recordLineageBatch>[0] = [];
  const common = {
    organizationId: packet.organizationId,
    targetObjectType: TARGET_TYPE_DEFENSE_PACKET,
    targetObjectId: packetId,
    targetTitle: `defense_packet manifest=${packet.manifestHash.slice(0, 12)}`,
    linkageType: 'derived_from',
    transformationType: 'extraction',
    confidenceBasis: 'rules_based',
    createdById: opts.createdById,
  };

  for (const evId of deps.evidenceObjectIds) {
    entries.push({
      ...common,
      sourceObjectType: SOURCE_TYPE_EVIDENCE,
      sourceObjectId: evId,
    });
  }
  for (const k of deps.predicateKNumbers) {
    entries.push({
      ...common,
      sourceObjectType: SOURCE_TYPE_PREDICATE,
      sourceObjectId: k,
    });
  }
  if (deps.riskVocabHash) {
    entries.push({
      ...common,
      sourceObjectType: SOURCE_TYPE_RISK_VOCAB,
      sourceObjectId: deps.riskVocabHash,
    });
  }
  if (deps.riskCodeMapVersion) {
    entries.push({
      ...common,
      sourceObjectType: SOURCE_TYPE_RISK_CODE_MAP,
      sourceObjectId: deps.riskCodeMapVersion,
    });
  }

  const recordedCount = entries.length ? await recordLineageBatch(entries) : 0;

  return {
    packetId,
    recordedCount,
    evidenceCount: deps.evidenceObjectIds.size,
    predicateCount: deps.predicateKNumbers.size,
    vocabRecorded: !!deps.riskVocabHash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Propagation
// ─────────────────────────────────────────────────────────────────────────────

export type StalenessReasonCode =
  | 'evidence_changed'
  | 'evidence_superseded'
  | 'claim_changed'
  | 'claim_withdrawn'
  | 'claim_superseded'
  | 'predicate_changed'
  | 'risk_vocab_updated'
  | 'risk_code_map_updated'
  | 'manual';

export interface PropagationResult {
  affectedPacketIds: string[];
  markedStaleCount: number;
  alreadyStaleCount: number;
  notRenderedCount: number;
  reason: StalenessReasonCode;
}

async function findDownstreamPacketIds(
  organizationId: number,
  sourceType: string,
  sourceId: string
): Promise<string[]> {
  const graph = await traceDownstream(organizationId, sourceType, sourceId, 2);
  return graph.nodes
    .filter(n => n.objectType === TARGET_TYPE_DEFENSE_PACKET)
    .map(n => n.objectId);
}

async function markPacketsStale(
  packetIds: string[],
  reason: StalenessReasonCode,
  detail: string,
  ctx: { organizationId: number; userId?: string }
): Promise<PropagationResult> {
  if (!packetIds.length) {
    return {
      affectedPacketIds: [],
      markedStaleCount: 0,
      alreadyStaleCount: 0,
      notRenderedCount: 0,
      reason,
    };
  }

  const rows = await db
    .select({
      id: defensePackets.id,
      status: defensePackets.status,
      organizationId: defensePackets.organizationId,
    })
    .from(defensePackets)
    .where(
      and(
        inArray(defensePackets.id, packetIds),
        eq(defensePackets.organizationId, ctx.organizationId)
      )
    );

  const toMark = rows.filter(r => r.status === 'RENDERED').map(r => r.id);
  const alreadyStale = rows.filter(r => r.status === 'STALE').length;
  const notRendered = rows.filter(r => !['RENDERED', 'STALE'].includes(r.status)).length;

  if (toMark.length) {
    await db
      .update(defensePackets)
      .set({
        status: 'STALE',
        stalenessReason: `${reason}: ${detail}`,
        updatedAt: new Date(),
      })
      .where(inArray(defensePackets.id, toMark));

    // Best-effort audit per packet (Part 11)
    for (const id of toMark) {
      try {
        await logAuditEvent({
          category: 'document',
          severity: 'warning',
          action: 'DEFENSE_PACKET_STALE_DETECTED',
          userId: ctx.userId ?? 'system',
          organizationId: String(ctx.organizationId),
          resourceType: 'defense_packet',
          resourceId: id,
          success: true,
          metadata: { reason, detail, propagation: 'push' },
        });
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    affectedPacketIds: rows.map(r => r.id),
    markedStaleCount: toMark.length,
    alreadyStaleCount: alreadyStale,
    notRenderedCount: notRendered,
    reason,
  };
}

/** Caller hook: an evidence object was updated/superseded. */
export async function propagateEvidenceChange(
  organizationId: number,
  evidenceObjectId: string,
  reason: StalenessReasonCode = 'evidence_changed',
  userId?: string
): Promise<PropagationResult> {
  const ids = await findDownstreamPacketIds(organizationId, SOURCE_TYPE_EVIDENCE, evidenceObjectId);
  return markPacketsStale(ids, reason, `evidence=${evidenceObjectId}`, { organizationId, userId });
}

/** Caller hook: a claim's text or status changed. */
export async function propagateClaimChange(
  claimId: number,
  reason: StalenessReasonCode = 'claim_changed',
  userId?: string
): Promise<PropagationResult> {
  // 1. Fetch the claim to learn organizationId + programId
  const [claim] = await db
    .select({
      id: evidenceClaims.id,
      organizationId: evidenceClaims.organizationId,
      programId: evidenceClaims.programId,
    })
    .from(evidenceClaims)
    .where(eq(evidenceClaims.id, claimId))
    .limit(1);
  if (!claim) {
    return {
      affectedPacketIds: [],
      markedStaleCount: 0,
      alreadyStaleCount: 0,
      notRenderedCount: 0,
      reason,
    };
  }

  // 2. Direct lineage: claim → packets (if any caller registered it explicitly)
  const directIds = await findDownstreamPacketIds(
    claim.organizationId,
    SOURCE_TYPE_CLAIM,
    String(claimId)
  );

  // 3. Coarse fallback: any RENDERED packet whose program_id matches.
  //    defense_packets.programId is uuid; evidence_claims.programId is integer
  //    (legacy programs namespace). They are not directly joinable, so the
  //    coarse fallback only fires when the caller knows the uuid program id
  //    via overrides — we leave this to a follow-up (see TODO below).
  // TODO: bridge integer programs.id ↔ uuid regulatory_programs.id when
  // that mapping is finalized. For now, only direct lineage is propagated.
  return markPacketsStale(directIds, reason, `claim=${claimId}`, {
    organizationId: claim.organizationId,
    userId,
  });
}

/** Caller hook: the predicate selection changed for a program. */
export async function propagatePredicateChange(
  organizationId: number,
  programId: string,
  predicateKNumber: string,
  userId?: string
): Promise<PropagationResult> {
  // Find packets in this program with this predicate
  const rows = await db
    .select({ id: defensePackets.id })
    .from(defensePackets)
    .where(
      and(
        eq(defensePackets.organizationId, organizationId),
        eq(defensePackets.programId, programId),
        eq(defensePackets.predicateKNumber, predicateKNumber),
        eq(defensePackets.status, 'RENDERED')
      )
    );
  return markPacketsStale(
    rows.map(r => r.id),
    'predicate_changed',
    `predicate=${predicateKNumber}`,
    { organizationId, userId }
  );
}

/** Caller hook: risk vocab hash or risk code map version was updated. */
export async function propagateRiskVocabChange(
  organizationId: number,
  newVocabHash: string,
  userId?: string
): Promise<PropagationResult> {
  // Any RENDERED packet with a different vocab hash is stale
  const rows = await db
    .select({ id: defensePackets.id, hash: defensePackets.riskVocabHash })
    .from(defensePackets)
    .where(
      and(
        eq(defensePackets.organizationId, organizationId),
        eq(defensePackets.status, 'RENDERED')
      )
    );
  const stale = rows.filter(r => r.hash !== newVocabHash).map(r => r.id);
  return markPacketsStale(stale, 'risk_vocab_updated', `new_hash=${newVocabHash}`, {
    organizationId,
    userId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-back
// ─────────────────────────────────────────────────────────────────────────────

export interface PacketDependencyView {
  evidenceObjectIds: string[];
  predicateKNumbers: string[];
  riskVocabHashes: string[];
  riskCodeMapVersions: string[];
  totalEdges: number;
}

export async function getPacketDependencies(
  organizationId: number,
  packetId: string
): Promise<PacketDependencyView> {
  // Use the existing upstream tracer rather than re-reading lineage records.
  const { traceUpstream } = await import('../data-lineage-service');
  const graph = await traceUpstream(organizationId, TARGET_TYPE_DEFENSE_PACKET, packetId, 2);
  const view: PacketDependencyView = {
    evidenceObjectIds: [],
    predicateKNumbers: [],
    riskVocabHashes: [],
    riskCodeMapVersions: [],
    totalEdges: graph.edges.length,
  };
  for (const node of graph.nodes) {
    if (node.objectType === SOURCE_TYPE_EVIDENCE) view.evidenceObjectIds.push(node.objectId);
    else if (node.objectType === SOURCE_TYPE_PREDICATE) view.predicateKNumbers.push(node.objectId);
    else if (node.objectType === SOURCE_TYPE_RISK_VOCAB) view.riskVocabHashes.push(node.objectId);
    else if (node.objectType === SOURCE_TYPE_RISK_CODE_MAP)
      view.riskCodeMapVersions.push(node.objectId);
  }
  return view;
}
