/**
 * Global market registry — shared types.
 *
 * A NEW, self-contained descriptive registry of the world's major regulated
 * markets for medical devices and IVDs. Distinct from (and complementary to):
 *   - region-profiles/region-profile-service.ts   (drug eCTD Module-1 projection)
 *   - market-specs/market-submission-specs.ts      (per-format submission GOVERNANCE)
 *   - regulatory/global-pathways.ts                (drug pathway readiness)
 *   - ivd-knowledge/regulatory/global-ivd*.ts       (prose IVD market-access corpus)
 *
 * This module gives ONE typed, comparable descriptor per market spanning BOTH
 * devices and IVDs: dossier standard, classification scheme, primary pathways,
 * language/localization, QMS expectation, and HONEST capability flags.
 *
 * HONEST BY CONSTRUCTION:
 *   - `canAssemble` is true ONLY where the platform already has an assembler
 *     (eCTD backbone, FDA eSTAR mapper, EU CE technical-file / CER packager).
 *   - `canTransmit` is FALSE for every market — this registry never claims a
 *     transmission capability the platform does not have.
 *
 * PURE + DETERMINISTIC: static data + pure functions. No DB, no network, no LLM.
 *
 * @module server/services/global-markets/types
 */

/** Stable market identifiers (kebab-case, authority-anchored). */
export type MarketId =
  | 'us-fda'
  | 'eu-mdr-ivdr'
  | 'uk-mhra'
  | 'jp-pmda'
  | 'cn-nmpa'
  | 'ca-health-canada'
  | 'au-tga'
  | 'br-anvisa'
  | 'kr-mfds'
  | 'ch-swissmedic'
  | 'in-cdsco'
  | 'sg-hsa'
  | 'tw-tfda'
  | 'sa-sfda'
  | 'za-sahpra'
  | 'mdsap';

/** Coarse geographic / harmonisation region grouping. */
export type MarketRegion =
  | 'north-america'
  | 'europe'
  | 'asia-pacific'
  | 'south-america'
  | 'middle-east'
  | 'africa'
  | 'cross-market';

/** The dossier standard / format a market's device or IVD filing uses. */
export type DossierStandard =
  | 'fda-estar'
  | 'imdrf-toc'
  | 'ce-technical-documentation'
  | 'ectd'
  | 'national-form-set'
  | 'qms-audit-model';

/** QMS expectation a market imposes. */
export type QmsExpectation =
  | 'iso-13485'
  | 'mdsap'
  | 'national-gmp'
  | 'iso-13485-or-national';

/** Readiness band derived from the readiness score. */
export type ReadinessBand = 'ready' | 'substantial' | 'partial' | 'minimal' | 'not-started';

/** Language / localization expectations for a market. */
export interface MarketLocalization {
  /** Primary submission language (ISO 639-1), where one dominates. */
  primaryLanguage: string;
  /** Labelling / IFU language requirement, expressed as a human note. */
  labellingLanguages: string;
  /** Whether translation of foreign-language source content is required to file. */
  translationRequired: boolean;
  note: string;
}

/** A descriptor for one regulated market (device + IVD). */
export interface MarketDescriptor {
  /** Stable market id. */
  id: MarketId;
  /** Human-readable display name. */
  name: string;
  /** Coarse region grouping. */
  region: MarketRegion;
  /** Regulatory authority full name. */
  authority: string;
  /** Authority short code (FDA, EMA, MHRA, …). */
  authorityShort: string;
  /** ISO 3166-ish jurisdiction codes the market covers. */
  jurisdictions: string[];
  /** Device dossier standard / format. */
  dossierStandard: DossierStandard;
  /** Human-readable name of the dossier format + version where relevant. */
  dossierFormatName: string;
  /** IVD support notes (how IVDs are handled relative to devices in this market). */
  ivdSupport: string;
  /** Classification scheme summary (device + IVD risk tiers). */
  classificationScheme: string;
  /** Primary device market-access pathway name(s). */
  devicePathways: string[];
  /** Primary IVD market-access pathway name(s). */
  ivdPathways: string[];
  /** Whether a local in-country representative / sponsor is required. */
  localRepresentativeRequired: boolean;
  /** Language / localization expectations. */
  localization: MarketLocalization;
  /** QMS expectation imposed by the market. */
  qmsExpectation: QmsExpectation;
  /**
   * The required dossier element ids the readiness scorer checks an artifact set
   * against. Stable, lowercase snake_case ids.
   */
  requiredDossierElements: string[];
  /**
   * HONEST: whether the platform can currently ASSEMBLE a dossier for this
   * market (true only where an assembler exists: eCTD / eSTAR / CE tech-doc/CER).
   */
  canAssemble: boolean;
  /** What the platform can assemble today, or why it cannot (honest note). */
  assembleNote: string;
  /**
   * HONEST INVARIANT: false for EVERY market. The platform is descriptive +
   * readiness logic only and has no transmission capability to any authority.
   */
  canTransmit: boolean;
  /** Citations / notes backing the descriptor's values. */
  citations: string[];
}

/** Result of scoring an artifact set against a market's required elements. */
export interface MarketReadinessResult {
  /** The market assessed. */
  marketId: MarketId;
  /** Authority short code, for display. */
  authority: string;
  /** Readiness score 0..100 (percentage of required elements present). */
  score: number;
  /** Banded interpretation of the score. */
  band: ReadinessBand;
  /** Required element ids that are present in the supplied artifact set. */
  presentElements: string[];
  /** Required element ids that are missing. */
  missingElements: string[];
  /** Whether every required element is present. */
  complete: boolean;
  /** HONEST blockers that hold regardless of artifact completeness. */
  blockers: string[];
}
