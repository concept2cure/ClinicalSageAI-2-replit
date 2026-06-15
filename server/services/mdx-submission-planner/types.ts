/**
 * MDX global submission planner — shared types.
 *
 * A NEW, self-contained planner that, for a device/IVD profile and a set of
 * target markets, produces a per-market submission PLAN: dossier standard, the
 * device-or-IVD pathway, classification note, market readiness, HONEST platform
 * capability flags, blockers, and a prioritized next-actions list.
 *
 * It composes (and never modifies) the global-markets registry + readiness
 * scorer and mirrors the honesty discipline of the device-assembly contract:
 *   - readiness via global-markets/market-readiness.assessMarketReadiness
 *   - descriptors + capability flags via global-markets/market-registry
 *
 * HONEST BY CONSTRUCTION:
 *   - `canTransmit` is FALSE for every market (registry invariant) — every
 *     market plan therefore carries the standing cannot-transmit blocker.
 *   - `canAssemble` is reported straight from the registry, never invented.
 *   - The planner never claims an assemble/transmit capability that the
 *     underlying registry does not assert.
 *
 * PURE + DETERMINISTIC: static composition + pure functions. No DB, no network,
 * no LLM.
 *
 * @module server/services/mdx-submission-planner/types
 */

import type {
  DossierStandard,
  MarketId,
  MarketReadinessResult,
  ReadinessBand,
} from '../global-markets/types';

/**
 * The minimal device/IVD profile a planner needs. `availableArtifacts` are the
 * stable dossier-element ids the manufacturer has already produced; they are
 * scored against each market's required elements.
 */
export interface DeviceProfile {
  /** Device / IVD product name (display only). */
  name: string;
  /** True for in-vitro diagnostics — selects the IVD pathway per market. */
  isIvd: boolean;
  /** Optional risk-tier hint (free text, e.g. "Class II", "IVDR Class C"). */
  riskTier?: string;
  /** Optional intended-use statement (display only). */
  intendedUse?: string;
  /** Dossier-element ids already produced (scored against each market). */
  availableArtifacts: string[];
}

/** Which kind of pathway was selected for a market plan. */
export type PathwayKind = 'device' | 'ivd';

/** A single prioritized next action for a market. */
export interface NextAction {
  /** 1-based priority rank within the market (1 = do first). */
  priority: number;
  /** The missing dossier-element id this action produces. */
  element: string;
  /** Human-readable instruction. */
  action: string;
}

/** A complete submission plan for one target market. */
export interface MarketPlan {
  /** Stable market id. */
  marketId: MarketId;
  /** Market display name. */
  marketName: string;
  /** Regulatory authority full name. */
  authority: string;
  /** Authority short code (FDA, EU-NB, ...). */
  authorityShort: string;
  /** Dossier standard / format enum for this market. */
  dossierStandard: DossierStandard;
  /** Human-readable dossier format name. */
  dossierFormatName: string;
  /** Whether the device or IVD pathway set was selected. */
  pathwayKind: PathwayKind;
  /** The selected pathway name(s) (IVD set when profile.isIvd). */
  pathways: string[];
  /** Classification scheme note for this market. */
  classificationScheme: string;
  /** Market readiness (scored against profile.availableArtifacts). */
  readiness: MarketReadinessResult;
  /** HONEST: whether the platform can assemble a dossier for this market. */
  canAssemble: boolean;
  /** What the platform can assemble today, or why it cannot. */
  assembleNote: string;
  /** HONEST INVARIANT: always false — no transmission capability anywhere. */
  canTransmit: boolean;
  /**
   * Aggregated, de-duplicated blockers for this market: the honest
   * cannot-transmit / cannot-assemble flags plus every readiness blocker.
   */
  blockers: string[];
  /** Prioritized list of missing dossier elements to produce first. */
  nextActions: NextAction[];
}

/** A market id that was requested but is not in the registry. */
export interface UnknownMarket {
  /** The requested id that did not resolve. */
  requestedId: string;
  /** Honest reason it could not be planned. */
  reason: string;
}

/** Aggregate readiness counts across all planned markets. */
export interface ReadinessSummary {
  /** Total markets successfully planned. */
  totalPlanned: number;
  /** Markets that are fully ready (complete, score 100). */
  ready: number;
  /** Markets with partial coverage (some but not all elements present). */
  partial: number;
  /** Markets with no required elements present yet. */
  notStarted: number;
}

/** The complete global submission plan. */
export interface GlobalSubmissionPlan {
  /** Echo of the profile the plan was built for. */
  profile: DeviceProfile;
  /** Per-market plans, sorted by canonical market order. */
  marketPlans: MarketPlan[];
  /** Requested ids that did not resolve to a known market. */
  unknownMarkets: UnknownMarket[];
  /** Aggregate readiness counts. */
  readinessSummary: ReadinessSummary;
  /** Market ids the platform CAN assemble a dossier for. */
  assembleCapableMarkets: MarketId[];
  /** Market ids the platform CANNOT assemble a dossier for. */
  assembleIncapableMarkets: MarketId[];
  /**
   * HONEST INVARIANT: always empty — the platform transmits to no authority.
   */
  transmitCapableMarkets: MarketId[];
  /** De-duplicated rollup of every blocker across all planned markets. */
  globalBlockers: string[];
  /** Generation provenance. */
  provenance: {
    generatedAt: string;
    modules: string[];
  };
}
