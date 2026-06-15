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
  readinessScore: number;
  confidence: number;
  status: 'ready' | 'partial' | 'missing';
  criticalBlockerCount: number;
  riskLevel: RiskLevel;
  topBlockers?: string[];
  nextMilestone?: { label: string; targetDate?: string; forecastDate?: string };
}

/**
 * The aggregated portfolio (board-pack) summary across all program members.
 */
export interface PortfolioSummary {
  programGroupId: number;
  memberCount: number;
  avgReadiness: number;
  avgConfidence: number;
  worstRisk: RiskLevel;
  readyCount: number;
  partialCount: number;
  missingCount: number;
  totalCriticalBlockers: number;
  attentionRanked: ProgramMemberInsight[];
  topBlockerThemes: Array<{ theme: string; count: number }>;
}
