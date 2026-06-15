/**
 * Cross-region / harmonization comparison types for Report-OS global-markets reports.
 *
 * These types describe one program's submission readiness across multiple global
 * markets and the harmonization gaps between them. They carry no DB or IO concerns —
 * inputs are normalized before reaching this layer.
 *
 * @module server/services/report-os/regional/types
 */

/**
 * Submission readiness for a single market (one regulatory region).
 */
export interface MarketReadiness {
  market: string;
  dossierStandard: string;
  readinessScore: number;
  status: 'ready' | 'partial' | 'missing';
  presentArtifacts: string[];
  missingArtifacts: string[];
  regionalWarnings: string[];
}

/**
 * A single artifact whose presence diverges across markets — present in some,
 * missing in others. Artifacts present everywhere or absent everywhere are not gaps.
 */
export interface HarmonizationGap {
  artifact: string;
  presentInMarkets: string[];
  missingInMarkets: string[];
}

/**
 * The computed comparison across markets for one program scope.
 */
export interface RegionComparison {
  scopeId: string;
  markets: MarketReadiness[];
  harmonizationGaps: HarmonizationGap[];
  leadMarket: string | null;
  laggingMarkets: string[];
  reusableArtifacts: string[];
}
