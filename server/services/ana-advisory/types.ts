/**
 * AnA device & global-market advisory — shared types.
 *
 * A NEW, self-contained advisory layer AnA ("AnA 1.0 RI") can call to give
 * grounded device/IVD + global-market guidance. It produces plain-language-ready,
 * structured advisories by composing existing, honest building blocks:
 *   - pathway-engines/device-assembly/assemble-device-submission (eSTAR readiness)
 *   - pathway-engines/estar/estar-mapper                          (section gaps)
 *   - global-markets/*                                            (market registry + readiness)
 *
 * HONEST BY CONSTRUCTION:
 *   - No LLM calls, no fabrication. Every finding is derived from the registries /
 *     readiness scorers above.
 *   - `canTransmit` is carried from the registry — true for 12 markets with a
 *     live gateway, false for TW/SA/ZA/MDSAP.
 *   - When a submission is not producible, the advisory says so and why.
 *
 * PURE + DETERMINISTIC: static composition + pure shaping. No DB, no network.
 *
 * @module server/services/ana-advisory/types
 */

import type { EstarType, EstarInputLeaf, DeviceFlags } from '../pathway-engines/estar/estar-mapper';
import type { EstarTemplateVariant } from '../pathway-engines/estar/estar-template-registry';
import type { MarketId, ReadinessBand } from '../global-markets/types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared advisory primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Severity of a recommended action — drives ordering and presentation. */
export type ActionPriority = 'critical' | 'recommended' | 'optional';

/** A single, plain-language-ready recommended next step. */
export interface RecommendedAction {
  /** Stable, machine-readable action id. */
  id: string;
  /** How urgent / important this action is. */
  priority: ActionPriority;
  /** Plain-language instruction the assistant can surface verbatim. */
  text: string;
}

/** A labelled, plain-language finding with a stable key. */
export interface AdvisoryFinding {
  /** Stable, machine-readable finding key. */
  key: string;
  /** Short label for the finding. */
  label: string;
  /** Plain-language value / detail. */
  detail: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// adviseDeviceReadiness
// ─────────────────────────────────────────────────────────────────────────────

/** Input to {@link adviseDeviceReadiness}. */
export interface DeviceReadinessAdviceInput {
  /** FDA eSTAR pathway. */
  pathway: EstarType;
  /** Device vs IVD — selects the official eSTAR template variant. */
  variant: EstarTemplateVariant;
  /** Canonical content leaves available to project onto the eSTAR section tree. */
  leaves: EstarInputLeaf[];
  /**
   * The device's properties deciding conditional-section applicability
   * (sterile, software, cyber, …). Unanswered ⇒ those sections are undetermined,
   * which blocks a submittable-eSTAR claim; never read as not applicable.
   */
  deviceFlags?: DeviceFlags;
  /** Official eSTAR template filenames present in the drop-point (optional). */
  presentTemplates?: string[];
  /** Optional target market for a readiness overlay. */
  market?: MarketId;
  /** Artifact ids available, for the market-readiness overlay. */
  availableArtifacts?: string[];
  /** Build environment — production gates the official-template requirement. */
  environment?: 'staging' | 'production';
  /** Override the ESTAR_REQUIRE_TEMPLATE flag. */
  requireTemplate?: boolean;
}

/** What kind of device artifact can honestly be produced right now. */
export type DeviceArtifactKind = 'official-estar' | 'content-package-draft' | 'none';

/** Structured result of {@link adviseDeviceReadiness}. */
export interface DeviceReadinessAdvice {
  /** Short, plain-language headline summarising the situation. */
  headline: string;
  /** FDA eSTAR pathway assessed. */
  pathway: EstarType;
  /** Device / IVD variant assessed. */
  variant: EstarTemplateVariant;
  /** Honest verdict: can the platform produce an official, submittable eSTAR? */
  canProduceOfficialEstar: boolean;
  /** The producible artifact kind (honest about draft-only vs submittable). */
  artifactKind: DeviceArtifactKind;
  /** eSTAR section completeness 0..100 (percentage of required sections present). */
  estarSectionScore: number;
  /** Banded interpretation of the section score. */
  estarSectionBand: ReadinessBand;
  /** Required eSTAR section ids still missing. */
  missingRequiredSections: string[];
  /** Structured, labelled findings. */
  findings: AdvisoryFinding[];
  /** Explicit blockers preventing a submittable official eSTAR (de-duplicated). */
  blockers: string[];
  /** Ordered, plain-language recommended next steps. */
  recommendedActions: RecommendedAction[];
  /** Provenance — which modules produced the underlying assessment. */
  provenance: { generatedAt: string; modules: string[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// adviseGlobalMarketStrategy
// ─────────────────────────────────────────────────────────────────────────────

/** A device profile for the global-market strategy advisory. */
export interface DeviceProfile {
  /** Whether the product is an in-vitro diagnostic. */
  isIvd: boolean;
  /** Artifact element ids the manufacturer has produced. */
  availableArtifacts: string[];
}

/** Input to {@link adviseGlobalMarketStrategy}. */
export interface GlobalMarketAdviceInput {
  /** The device / IVD profile. */
  profile: DeviceProfile;
  /**
   * Candidate market ids to rank. If omitted, every market in the registry is
   * considered. Unknown ids are reported in `unknownMarkets`, not silently dropped.
   */
  candidateMarkets?: string[];
}

/** One ranked market in the global-market strategy advisory. */
export interface RankedMarketAdvice {
  /** Stable market id. */
  marketId: MarketId;
  /** Authority short code, for display. */
  authority: string;
  /** Human-readable market name. */
  marketName: string;
  /** Readiness score 0..100 against the market's required dossier elements. */
  score: number;
  /** Banded interpretation of the score. */
  band: ReadinessBand;
  /** Whether every required dossier element is present. */
  complete: boolean;
  /** HONEST: whether the platform can assemble a dossier for this market. */
  canAssemble: boolean;
  /** Whether this market has a live submission gateway. */
  canTransmit: boolean;
  /** Whether a local in-country representative is required. */
  localRepresentativeRequired: boolean;
  /** Required dossier element ids that are missing. */
  missingElements: string[];
  /** Honest blockers carried from the readiness scorer. */
  blockers: string[];
  /** Plain-language one-liner summarising this market's standing. */
  summary: string;
}

/** Structured result of {@link adviseGlobalMarketStrategy}. */
export interface GlobalMarketAdvice {
  /** Short, plain-language headline summarising the ranking. */
  headline: string;
  /** Whether the profile was assessed as an IVD. */
  isIvd: boolean;
  /** Markets ranked most-ready first. */
  rankedMarkets: RankedMarketAdvice[];
  /** Market ids the platform can assemble a dossier for (honest subset). */
  assembleCapableMarkets: MarketId[];
  /** Markets that require a local in-country representative. */
  marketsNeedingLocalRep: MarketId[];
  /**
   * HONEST INVARIANT: always empty. The platform has no transmission capability
   * to any authority.
   */
  transmitCapableMarkets: MarketId[];
  /** Candidate ids that were not recognised as markets. */
  unknownMarkets: string[];
  /** Structured, labelled findings. */
  findings: AdvisoryFinding[];
  /** Explicit, cross-market blockers. */
  blockers: string[];
  /** Ordered, plain-language recommended next steps. */
  recommendedActions: RecommendedAction[];
  /** Provenance — which modules produced the underlying assessment. */
  provenance: { generatedAt: string; modules: string[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool-spec descriptors (data only — matches AnaTool shape from ai-gateway/types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tool-definition descriptor mirroring the `AnaTool` convention used in
 * server/services/ana/AnaToolDefinitions.ts (name + description + JSON-schema
 * `input_schema`). Exported as DATA so a future change can register these tools
 * with AnA without reworking the advisory module. Nothing here wires them in.
 */
export interface AnaAdvisoryToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
