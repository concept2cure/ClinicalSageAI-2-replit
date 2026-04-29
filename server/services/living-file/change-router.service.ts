/**
 * Living-File Change Router
 *
 * Single domain-level entrypoint that synthesizes the prior six commits.
 * When an upstream input changes (intended use, claim, evidence object,
 * predicate selection, standard withdrawal, risk vocab update), this router
 * fans the event out to every downstream artifact propagator that was built
 * in earlier turns AND to the platform-wide reactive-dependency-service.
 *
 * No new schema. Zero duplication: every call delegates to an existing
 * service. The router only knows the mapping table.
 *
 * Mapping (domain event → propagators):
 *   claim_changed              → defense-packet-staleness (data lineage)
 *                              + reactiveDependencyService (governed deps)
 *   claim_withdrawn            → same, with stronger reason code
 *   evidence_superseded        → defense-packet-staleness (evidence)
 *                              + standards_applicability conformance flip
 *                              + gspr_program_mappings primary-evidence flip
 *                              + reactiveDependencyService (governed deps)
 *   predicate_changed          → defense-packet-staleness (predicate)
 *   standard_withdrawn         → standards_applicability rows referencing it
 *                                marked needs_evidence
 *                              + reactiveDependencyService
 *   risk_vocab_updated         → defense-packet-staleness (risk_vocab)
 *   intended_use_changed       → reactiveDependencyService propagateChange
 *                                with broad trigger; downstream registrants
 *                                handle the specifics (defense packets,
 *                                CER paragraphs, post-market documents)
 *   device_profile_changed     → same as intended_use_changed; the freshness
 *                                report exposes the cascade for review
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { standardsApplicability } from '../../../shared/schema/regulatory-graph';
import {
  gsprProgramMappings,
} from '../../../shared/schema/gspr-postmarket';
import { reactiveDependencyService } from '../reactive-dependency-service';
import {
  propagateClaimChange,
  propagateEvidenceChange,
  propagatePredicateChange,
  propagateRiskVocabChange,
} from '../regulatory-graph/defense-packet-staleness.service';

// ─────────────────────────────────────────────────────────────────────────────
// Domain events
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryChangeEvent =
  | 'claim_changed'
  | 'claim_withdrawn'
  | 'claim_superseded'
  | 'evidence_changed'
  | 'evidence_superseded'
  | 'predicate_changed'
  | 'standard_withdrawn'
  | 'standard_superseded'
  | 'risk_vocab_updated'
  | 'risk_code_map_updated'
  | 'intended_use_changed'
  | 'device_profile_changed';

export interface RegulatoryChangeRequest {
  organizationId: number;
  /** UUID of the regulatory_programs row that scopes this change. */
  programId: string;
  /** Optional: legacy integer programs.id needed for evidence_claims-keyed
   *  propagators. When omitted, claim-changed events fall back to
   *  data-lineage-only propagation. */
  legacyProgramId?: number;
  event: RegulatoryChangeEvent;
  /** Domain object id the change is happening to. Type depends on event:
   *    claim_changed       → integer claim id (number, sent as string)
   *    evidence_*          → uuid of evidence_objects.id
   *    predicate_changed   → predicate k-number
   *    standard_*          → uuid of device_test_standards.id (cast)
   *    risk_vocab_updated  → new risk_vocab_hash
   *    intended_use_changed/device_profile_changed → programId (echo)
   */
  sourceId: string;
  sourceLabel?: string;
  reason?: string;
  userId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-event handlers
// ─────────────────────────────────────────────────────────────────────────────

interface HandlerOutcome {
  /** Free-form per-channel result so the route can return a digest. */
  channel: string;
  detail: unknown;
}

async function reactiveTrigger(req: RegulatoryChangeRequest): Promise<HandlerOutcome | null> {
  // The reactive-dependency-service expects (sourceType, sourceId, triggerType,
  // projectId). We map our domain event onto the service's TriggerType union.
  // For events that don't have a 1:1 trigger (e.g. risk_vocab_updated), we fall
  // back to 'artifact_locked' which yields impactState='requires_review'.
  const triggerByEvent: Record<RegulatoryChangeEvent, string> = {
    claim_changed: 'assumption_updated',
    claim_withdrawn: 'assumption_withdrawn',
    claim_superseded: 'assumption_superseded',
    evidence_changed: 'artifact_promoted',
    evidence_superseded: 'artifact_locked',
    predicate_changed: 'decision_superseded',
    standard_withdrawn: 'assumption_withdrawn',
    standard_superseded: 'assumption_superseded',
    risk_vocab_updated: 'artifact_locked',
    risk_code_map_updated: 'artifact_locked',
    intended_use_changed: 'decision_superseded',
    device_profile_changed: 'decision_superseded',
  };
  const sourceTypeByEvent: Record<RegulatoryChangeEvent, string> = {
    claim_changed: 'claim',
    claim_withdrawn: 'claim',
    claim_superseded: 'claim',
    evidence_changed: 'evidence_object',
    evidence_superseded: 'evidence_object',
    predicate_changed: 'predicate_device',
    standard_withdrawn: 'regulatory_standard',
    standard_superseded: 'regulatory_standard',
    risk_vocab_updated: 'risk_vocab',
    risk_code_map_updated: 'risk_code_map',
    intended_use_changed: 'program_intended_use',
    device_profile_changed: 'device_profile',
  };

  if (req.legacyProgramId === undefined) return null;

  try {
    const result = await reactiveDependencyService.propagateChange({
      organizationId: req.organizationId,
      projectId: req.legacyProgramId,
      triggerType: triggerByEvent[req.event] as any,
      sourceType: sourceTypeByEvent[req.event],
      sourceId: req.sourceId,
      sourceLabel: req.sourceLabel,
      reason: req.reason ?? `regulatory event ${req.event}`,
      triggeredBy: req.userId ?? 'system',
    });
    return { channel: 'reactive_dependency_service', detail: result };
  } catch (err: any) {
    return { channel: 'reactive_dependency_service', detail: { error: err?.message } };
  }
}

async function defensePacketTrigger(req: RegulatoryChangeRequest): Promise<HandlerOutcome | null> {
  switch (req.event) {
    case 'claim_changed':
    case 'claim_withdrawn':
    case 'claim_superseded': {
      const claimId = parseInt(req.sourceId, 10);
      if (!Number.isFinite(claimId)) return null;
      const reason =
        req.event === 'claim_withdrawn'
          ? 'claim_withdrawn'
          : req.event === 'claim_superseded'
          ? 'claim_superseded'
          : 'claim_changed';
      const out = await propagateClaimChange(claimId, reason, req.userId);
      return { channel: 'defense_packet.claim', detail: out };
    }
    case 'evidence_changed':
    case 'evidence_superseded': {
      const reason = req.event === 'evidence_superseded' ? 'evidence_superseded' : 'evidence_changed';
      const out = await propagateEvidenceChange(req.organizationId, req.sourceId, reason, req.userId);
      return { channel: 'defense_packet.evidence', detail: out };
    }
    case 'predicate_changed': {
      const out = await propagatePredicateChange(
        req.organizationId,
        req.programId,
        req.sourceId,
        req.userId
      );
      return { channel: 'defense_packet.predicate', detail: out };
    }
    case 'risk_vocab_updated': {
      const out = await propagateRiskVocabChange(req.organizationId, req.sourceId, req.userId);
      return { channel: 'defense_packet.risk_vocab', detail: out };
    }
    default:
      return null;
  }
}

async function standardsApplicabilityTrigger(
  req: RegulatoryChangeRequest
): Promise<HandlerOutcome | null> {
  // When a standard is withdrawn or superseded, every applicability row that
  // references it should be flipped to conformance_status='needs_evidence' so
  // the operator must re-attach evidence against the surviving standard.
  if (req.event !== 'standard_withdrawn' && req.event !== 'standard_superseded') return null;

  // standardId comes through as a uuid string; the table column is integer
  // (device_test_standards.id) — but standards_applicability.standardId is
  // also integer. Caller is expected to pass an integer-as-string.
  const id = parseInt(req.sourceId, 10);
  if (!Number.isFinite(id)) {
    return { channel: 'standards_applicability', detail: { skipped: 'standard id not numeric' } };
  }
  const updated = await db
    .update(standardsApplicability)
    .set({
      conformanceStatus: 'needs_evidence',
      gapDescription: `Referenced standard ${req.event === 'standard_withdrawn' ? 'withdrawn' : 'superseded'}; re-attach evidence.`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(standardsApplicability.organizationId, req.organizationId),
        eq(standardsApplicability.standardId, id)
      )
    )
    .returning({ id: standardsApplicability.id });
  return {
    channel: 'standards_applicability',
    detail: { affectedRows: updated.length, ids: updated.map(r => r.id) },
  };
}

async function gsprMappingTrigger(req: RegulatoryChangeRequest): Promise<HandlerOutcome | null> {
  // When evidence is superseded, GSPR mappings whose primary_evidence_id ==
  // the changed evidence flip to conformance_status='needs_evidence' so the
  // operator re-attaches evidence.
  if (req.event !== 'evidence_superseded' && req.event !== 'evidence_changed') return null;

  const updated = await db
    .update(gsprProgramMappings)
    .set({
      conformanceStatus: 'needs_evidence',
      gapDescription:
        req.event === 'evidence_superseded'
          ? `Primary evidence superseded; re-attach to maintain conformance.`
          : `Primary evidence updated; re-verify conformance.`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gsprProgramMappings.organizationId, req.organizationId),
        eq(gsprProgramMappings.primaryEvidenceId, req.sourceId)
      )
    )
    .returning({ id: gsprProgramMappings.id });
  return {
    channel: 'gspr_program_mappings',
    detail: { affectedRows: updated.length, ids: updated.map(r => r.id) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export interface PropagateRegulatoryChangeResult {
  event: RegulatoryChangeEvent;
  programId: string;
  sourceId: string;
  outcomes: HandlerOutcome[];
  totalAffected: number;
}

export async function propagateRegulatoryChange(
  req: RegulatoryChangeRequest
): Promise<PropagateRegulatoryChangeResult> {
  const outcomes: HandlerOutcome[] = [];
  for (const handler of [
    defensePacketTrigger,
    gsprMappingTrigger,
    standardsApplicabilityTrigger,
    reactiveTrigger,
  ]) {
    try {
      const out = await handler(req);
      if (out) outcomes.push(out);
    } catch (err: any) {
      outcomes.push({
        channel: handler.name,
        detail: { error: err?.message ?? 'unknown', stack: err?.stack },
      });
    }
  }

  // Best-effort total: sums any numeric "affectedRows" / "markedStaleCount".
  let total = 0;
  for (const o of outcomes) {
    const d = o.detail as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') continue;
    if (typeof d.affectedRows === 'number') total += d.affectedRows;
    if (typeof d.markedStaleCount === 'number') total += d.markedStaleCount;
    if (typeof d.downstreamImpacted === 'number') total += d.downstreamImpacted;
  }

  return {
    event: req.event,
    programId: req.programId,
    sourceId: req.sourceId,
    outcomes,
    totalAffected: total,
  };
}
