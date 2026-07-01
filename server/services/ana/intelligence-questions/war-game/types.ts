/**
 * AnA War Game — type definitions.
 *
 * The War Game system simulates FDA auditor scrutiny on documents,
 * asking adversarial questions and producing advisory reports.
 *
 * @module server/services/ana/intelligence-questions/war-game/types
 */

import type { FlowCategory, IssueSeverity } from '../../../../../shared/types/intelligence-questions.js';

export type WarGameCategory =
  | 'protocol'
  | 'ind'
  | 'csr'
  | '510k'
  | 'cer'
  | 'sop'
  | 'nda'
  | 'bla'
  | 'pma'
  | 'cmc'
  | 'risk_management'
  | 'safety_narrative'
  | 'labeling'
  | 'briefing_book'
  | 'stability';

export type AuditDimension =
  | 'completeness'
  | 'consistency'
  | 'regulatory_alignment'
  | 'scientific_rigor'
  | 'practical_feasibility'
  | 'documentation'
  | 'risk_identification';

export interface WarGameFinding {
  id: string;
  dimension: AuditDimension;
  severity: IssueSeverity;
  title: string;
  question: string;
  observation: string;
  requirement: string;
  reference: string;
  recommendation: string;
  relatedFields: string[];
}

export interface WarGameReport {
  id: string;
  category: WarGameCategory;
  sourceFlowId: string;
  timestamp: string;
  overallScore: number;
  overallAssessment: 'audit_ready' | 'needs_work' | 'significant_gaps' | 'not_ready';
  findings: WarGameFinding[];
  dimensionScores: Record<AuditDimension, { score: number; findingCount: number }>;
  executiveSummary: string;
  topPriorities: string[];
  regulatoryRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface AuditRule {
  id: string;
  dimension: AuditDimension;
  title: string;
  question: string;
  check: (answers: Record<string, unknown>) => WarGameFinding | null;
}

export interface WarGameAuditor {
  category: WarGameCategory;
  name: string;
  description: string;
  rules: AuditRule[];
}
