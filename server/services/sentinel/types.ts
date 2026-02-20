/**
 * AI Sentinel — Type Definitions
 *
 * The Sentinel continuously monitors projects and proactively identifies risks,
 * cross-project conflicts, regulatory changes, quality drift, and budget burn.
 *
 * @module server/services/sentinel/types.ts
 */

export type SentinelAnalyzerType =
  | 'deadline_risk'
  | 'cross_project'
  | 'regulatory_change'
  | 'quality_drift'
  | 'budget_burn';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type FindingStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface SentinelFinding {
  findingId: string;
  organizationId: number;
  projectId: number;
  analyzerType: SentinelAnalyzerType;
  severity: FindingSeverity;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  recommendations: string[];
  affectedItems: Array<{ type: string; id: number; label?: string }>;
  status: FindingStatus;
  aiRequestId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AnalyzerResult {
  findings: SentinelFinding[];
  analyzerType: SentinelAnalyzerType;
  durationMs: number;
  projectsScanned: number;
  timestamp: Date;
}

export interface SentinelConfig {
  organizationId: number;
  enabled: boolean;
  intervalMinutes: number;
  analyzers: {
    deadline_risk: boolean;
    cross_project: boolean;
    regulatory_change: boolean;
    quality_drift: boolean;
    budget_burn: boolean;
  };
  thresholds: {
    deadlineWarningDays: number; // Warn when deadline within N days
    budgetBurnThreshold: number; // 0-100 percentage
    qualityDriftThreshold: number; // Task completion rate below this
    riskEscalationLevel: FindingSeverity;
  };
}

export const DEFAULT_SENTINEL_CONFIG: Omit<SentinelConfig, 'organizationId'> = {
  enabled: true,
  intervalMinutes: 60,
  analyzers: {
    deadline_risk: true,
    cross_project: true,
    regulatory_change: true,
    quality_drift: true,
    budget_burn: true,
  },
  thresholds: {
    deadlineWarningDays: 14,
    budgetBurnThreshold: 80,
    qualityDriftThreshold: 50,
    riskEscalationLevel: 'high',
  },
};
