/**
 * Submission Twin — model types and enum validators
 *
 * The AI-facing result shapes (claim extraction, evidence assessment, drift
 * detection, regulator challenges, fragility zones, next-best-artifact) and
 * the enum validators that clamp model output onto the DB-backed enums.
 * Extracted from submission-twin-service.ts; the service is the only intended
 * consumer, but these shapes are pure data contracts with no service logic.
 */

import type {
  SubmissionTwinClaim,
  SubmissionTwinAssessment,
  SubmissionTwinDriftAlert,
  SubmissionTwinChallenge,
} from '../../shared/schema';

// ── Enum validators ──

const VALID_DRIFT_TYPES = new Set([
  'summary_detail_mismatch',
  'claim_escalation_without_evidence',
  'endpoint_framing_drift',
  'cmc_maturity_overstatement',
  'narrative_statistical_mismatch',
  'document_contradiction',
  'stale_downstream_summary',
]);

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'informational']);

export const VALID_REVIEWER_LENSES = new Set([
  'skeptical_reviewer',
  'evidence_sufficiency_skeptic',
  'cmc_heavy_reviewer',
  'clinical_risk_reviewer',
  'compliance_inspection',
  'claims_challenger',
  'biostatistics_skeptic',
]);

const VALID_SUPPORT_STRENGTHS = new Set([
  'direct',
  'indirect',
  'weak',
  'stale',
  'contradictory',
  'unsupported',
]);

export function validateDriftType(val: string): string {
  return VALID_DRIFT_TYPES.has(val) ? val : 'document_contradiction';
}

export function validateSeverity(val: string): string {
  return VALID_SEVERITIES.has(val) ? val : 'medium';
}

export function validateSupportStrength(val: string): string {
  return VALID_SUPPORT_STRENGTHS.has(val) ? val : 'unsupported';
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Types ──

export interface ClaimExtractionResult {
  claims: Array<{
    claimText: string;
    claimType: string;
    sectionPath: string;
    confidence: number;
    sourceLocation?: { page?: number; paragraph?: number };
  }>;
}

export interface EvidenceAssessment {
  claimId: number;
  claimText: string;
  supportStrength: 'direct' | 'indirect' | 'weak' | 'stale' | 'contradictory' | 'unsupported';
  relevanceScore: number;
  evidenceText: string;
  isStatistical: boolean;
  statisticalDetail?: Record<string, unknown>;
}

export interface DriftDetection {
  driftType: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  description: string;
  sourceExcerpt?: string;
  targetExcerpt?: string;
  suggestedFix?: string;
}

export interface ChallengeResult {
  reviewerLens: string;
  challengeText: string;
  targetSection?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  deficiencyLikelihood: number;
  suggestedResponse?: string;
  suggestedArtifact?: string;
}

export interface FragilityZone {
  section: string;
  sectionId?: number;
  score: number;
  issues: string[];
}

export interface NextBestArtifactPrediction {
  artifactType: string;
  rationale: string;
  priority: 'critical' | 'high' | 'medium';
  targetSection?: string;
}

export interface FullAssessmentResult {
  assessment: SubmissionTwinAssessment;
  claims: SubmissionTwinClaim[];
  driftAlerts: SubmissionTwinDriftAlert[];
  challenges: SubmissionTwinChallenge[];
  weakZones: FragilityZone[];
  nextBestArtifact: NextBestArtifactPrediction | null;
}
