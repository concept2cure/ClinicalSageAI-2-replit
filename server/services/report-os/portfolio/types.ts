/**
 * Portfolio (enterprise/program) rollup types for Report-OS.
 *
 * These types describe a pure aggregation of per-program-member insights into a
 * board-pack portfolio summary. They carry no DB or IO concerns.
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * A single program member's distilled insight, as produced upstream per project.
 */
export interface ProgramMemberInsight {
  projectId: number;
  name: string;
  /** Program/project code (e.g. "BX-204"), from projects.code when present. */
  code?: string | null;
  /** Therapeutic area / indication, from projects.therapeutic_area when present. */
  indication?: string | null;
  /** The evaluated submission readiness (evaluateReadiness), or null when none
   *  was computed for the member. Never the run's confidence. */
  readinessScore: number | null;
  /** A measured confidence, or null when none was (the readiness run measures none). */
  confidence: number | null;
  /** The evaluated readiness verdict (the run's `submission_readiness` row);
   *  'missing' when readiness was not computed or a critical gap is open. */
  status: 'ready' | 'partial' | 'missing';
  /** The regulatory_programs id the project is anchored to, when it is one. */
  programId?: string | null;
  criticalBlockerCount: number;
  riskLevel: RiskLevel;
  topBlockers?: string[];
  nextMilestone?: { label: string; targetDate?: string; forecastDate?: string };
}

/**
 * The shared, scope-agnostic aggregation of per-member insights. Both the
 * program-group board pack and the org-wide rollup are this shape plus a scope
 * key — kept as one type so the pure aggregator is never duplicated.
 */
export interface PortfolioAggregate {
  memberCount: number;
  /** Mean over members with a computed readiness; null when none has one. */
  avgReadiness: number | null;
  /** Mean over members with a measured confidence; null when none has one. */
  avgConfidence: number | null;
  worstRisk: RiskLevel;
  readyCount: number;
  partialCount: number;
  missingCount: number;
  totalCriticalBlockers: number;
  attentionRanked: ProgramMemberInsight[];
  topBlockerThemes: Array<{ theme: string; count: number }>;
}

/**
 * The aggregated portfolio (board-pack) summary across a program GROUP.
 */
export interface PortfolioSummary extends PortfolioAggregate {
  programGroupId: number;
}

/**
 * The aggregated rollup across ALL top-level programs in an ORG. Same math as
 * the board pack, scoped to the org instead of a program group. `truncated` is
 * set when the org has more programs than the compute cap (no silent drop).
 */
export interface OrgPortfolioSummary extends PortfolioAggregate {
  organizationId: number;
  truncated: boolean;
}
