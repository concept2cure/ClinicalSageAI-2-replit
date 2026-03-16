// ============================================================================
// Snow Globe Prediction Engine — Domain Types
// ============================================================================

// ----------------------------------------------------------------------------
// Engine Identifiers
// ----------------------------------------------------------------------------

export type EngineId =
  | 'agency_screen'
  | 'reviewer_attack'
  | 'audit_inspection'
  | 'route_timing'
  | 'evidence_sufficiency'
  | 'collaboration_fragility';

// ----------------------------------------------------------------------------
// Score Types (mapped to engines)
// ----------------------------------------------------------------------------

export type ScoreType =
  | 'preTechnicalRejection'
  | 'submissionSurvival'
  | 'reviewerFriction'
  | 'auditExposure'
  | 'claimDefensibility'
  | 'traceabilityIntegrity'
  | 'routeViability'
  | 'approvalChainFragility';

// ----------------------------------------------------------------------------
// Scenario Types
// ----------------------------------------------------------------------------

export interface SnowGlobeScenario {
  id: number;
  organizationId: number;
  programId: number;
  name: string;
  description: string | null;
  isBaseline: boolean;
  isArchived: boolean;
  createdById: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioAssumption {
  id: number;
  scenarioId: number;
  category: string;
  key: string;
  value: string;
  rationale: string | null;
}

// ----------------------------------------------------------------------------
// Prediction Run Types
// ----------------------------------------------------------------------------

export type RunType =
  | 'full_stress_test'
  | 'pre_agency_scan'
  | 'reviewer_attack_scan'
  | 'audit_exposure_scan'
  | 'route_timing_scan'
  | 'evidence_scan'
  | 'collaboration_scan';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface PredictionRun {
  id: number;
  organizationId: number;
  programId: number;
  scenarioId: number | null;
  runType: RunType;
  status: RunStatus;
  triggeredById: number;
  enginesRun: EngineId[];
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

// ----------------------------------------------------------------------------
// Finding Types
// ----------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface BlastRadius {
  artifactsImpacted: number;
  sectionsImpacted: string[];
}

export interface FindingCluster {
  id: number;
  runId: number;
  engine: EngineId;
  severity: Severity;
  title: string;
  summary: string;
  regulatoryBasis: string;
  blastRadius: BlastRadius;
  suggestedRemediation: string;
  confidence: number;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Score Snapshot Types
// ----------------------------------------------------------------------------

export interface ScoreSnapshot {
  id: number;
  organizationId: number;
  programId: number;
  runId: number;
  scoreType: ScoreType;
  engine: EngineId;
  value: number;
  previousValue: number | null;
  trend: 'up' | 'down' | 'flat';
  explanation: string;
  metadata: Record<string, any>;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Remediation Types
// ----------------------------------------------------------------------------

export type EffortLevel = 'low' | 'medium' | 'high';

export type RemediationStatus =
  | 'proposed'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'dismissed';

export interface RemediationPlan {
  id: number;
  organizationId: number;
  programId: number;
  findingClusterId: number;
  priority: number;
  title: string;
  description: string;
  effort: EffortLevel;
  impactScore: number;
  status: RemediationStatus;
  assignedToId: number | null;
  dueDate: string | null;
  completedAt: string | null;
}

// ----------------------------------------------------------------------------
// Historical Intelligence Types
// ----------------------------------------------------------------------------

export interface HistoricalPriorFeature {
  id: number;
  therapeuticArea: string;
  indicationCode: string;
  regulatoryPathway: string;
  featureVector: Record<string, number>;
  outcome: string;
  sourceSubmissionYear: number;
  sourceAgency: string;
}

// ----------------------------------------------------------------------------
// Event Payload Types (cross-module integration)
// ----------------------------------------------------------------------------

export type SnowGlobeEventType =
  | 'prediction.run.started'
  | 'prediction.run.completed'
  | 'finding.created'
  | 'finding.resolved'
  | 'score.updated'
  | 'remediation.status_changed'
  | 'scenario.created'
  | 'scenario.archived';

export interface SnowGlobeEvent {
  type: SnowGlobeEventType;
  programId: number;
  timestamp: string;
  payload: Record<string, any>;
}

// ----------------------------------------------------------------------------
// Engine Configuration
// ----------------------------------------------------------------------------

export interface EngineConfig {
  id: EngineId;
  label: string;
  description: string;
  scoreTypes: ScoreType[];
  lowerIsBetter: boolean;
}

export const ENGINE_CONFIGS: Record<EngineId, EngineConfig> = {
  agency_screen: {
    id: 'agency_screen',
    label: 'Agency Screen',
    description: 'Pre-technical screening simulation',
    scoreTypes: ['preTechnicalRejection', 'submissionSurvival'],
    lowerIsBetter: true,
  },
  reviewer_attack: {
    id: 'reviewer_attack',
    label: 'Reviewer Attack',
    description: 'Adversarial reviewer simulation',
    scoreTypes: ['reviewerFriction'],
    lowerIsBetter: true,
  },
  audit_inspection: {
    id: 'audit_inspection',
    label: 'Audit & Inspection',
    description: 'GCP/GMP audit readiness assessment',
    scoreTypes: ['auditExposure', 'traceabilityIntegrity'],
    lowerIsBetter: true,
  },
  route_timing: {
    id: 'route_timing',
    label: 'Route & Timing',
    description: 'Regulatory pathway viability analysis',
    scoreTypes: ['routeViability'],
    lowerIsBetter: false,
  },
  evidence_sufficiency: {
    id: 'evidence_sufficiency',
    label: 'Evidence Sufficiency',
    description: 'Clinical evidence completeness scoring',
    scoreTypes: ['claimDefensibility'],
    lowerIsBetter: false,
  },
  collaboration_fragility: {
    id: 'collaboration_fragility',
    label: 'Collaboration Fragility',
    description: 'Team collaboration risk analysis',
    scoreTypes: ['approvalChainFragility'],
    lowerIsBetter: true,
  },
};

// ----------------------------------------------------------------------------
// API Response Envelope
// ----------------------------------------------------------------------------

export interface SnowGlobeApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// ----------------------------------------------------------------------------
// Dossier Sections Reference
// ----------------------------------------------------------------------------

export const DOSSIER_SECTIONS = [
  'Module 1 — Administrative',
  'Module 2.3 — Quality Overall Summary',
  'Module 2.5 — Clinical Overview',
  'Module 2.7 — Clinical Summary',
  'Module 3.2.S — Drug Substance',
  'Module 3.2.P — Drug Product',
  'Module 4 — Nonclinical Study Reports',
  'Module 5 — Clinical Study Reports',
  "Investigator's Brochure",
  'Clinical Protocol',
  'Statistical Analysis Plan',
  'Risk Management File',
] as const;

export type DossierSection = typeof DOSSIER_SECTIONS[number];
