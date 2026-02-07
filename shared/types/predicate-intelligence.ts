/**
 * Phase 6.6 — Predicate Intelligence Shared Types
 *
 * TypeScript interfaces shared between BFF routes and React client.
 *
 * @phase 6.6 — Predicate Intelligence
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════════════════════

export type EquivalenceStatus = 'EQUIVALENT' | 'DISCUSSION_REQUIRED' | 'NOT_EQUIVALENT' | 'TOXIC';

export type EnforcementEventType =
  | 'recall_class_i'
  | 'recall_class_ii'
  | 'recall_class_iii'
  | 'safety_communication'
  | 'warning_letter'
  | '483_observation'
  | 'mdr_signal';

export type QuestionSeverity = 'high' | 'medium' | 'low';

// ═══════════════════════════════════════════════════════════════════════════════
// Enforcement Events (FDA)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EnforcementEvent {
  k_number: string;
  event_type: EnforcementEventType;
  severity_weight: number;
  event_date: string;
  description: string;
  source_url?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Predicate Candidates
// ═══════════════════════════════════════════════════════════════════════════════

export interface PredicateCandidate {
  id: string;
  program_id: string;
  k_number: string;
  device_name: string;
  manufacturer: string;
  classification: string;
  similarity_score: number;
  toxicity_score: number;
  recommended: boolean;
  evidence_links: string[];
  golden_bridge_path: GoldenBridgeResult | null;
  enforcement_events: EnforcementEvent[];
  created_at: string;
  updated_at: string;
}

export interface PredicateCandidateCreate {
  program_id: string;
  k_number: string;
  device_name: string;
  manufacturer: string;
  classification?: string;
  similarity_score?: number;
  evidence_links?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Golden Bridge Path
// ═══════════════════════════════════════════════════════════════════════════════

export interface GoldenBridgeResult {
  conservative_route: BridgeHop[];
  aggressive_route: BridgeHop[];
  risk_analysis: {
    overall_risk: 'low' | 'medium' | 'high';
    toxic_flags: string[];
    recommendation: string;
  };
}

export interface BridgeHop {
  k_number: string;
  device_name: string;
  manufacturer: string;
  toxicity_score: number;
  product_code: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SE Matrix (Substantial Equivalence)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SEMatrixRow {
  id: string;
  program_id: string;
  candidate_id: string;
  characteristic: string;
  subject_value: string;
  subject_evidence_ids: string[];
  subject_confidence: number;
  predicate_value: string;
  predicate_evidence_ids: string[];
  predicate_confidence: number;
  equivalence_status: EquivalenceStatus;
  diff_explanation: string;
}

export interface SEMatrixRowCreate {
  program_id: string;
  candidate_id: string;
  characteristic: string;
  subject_value: string;
  subject_evidence_ids?: string[];
  subject_confidence?: number;
  predicate_value: string;
  predicate_evidence_ids?: string[];
  predicate_confidence?: number;
  equivalence_status?: EquivalenceStatus;
  diff_explanation?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Defense Preview (Shadow 510(k) Reviewer)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DefensePreview {
  id: string;
  program_id: string;
  candidate_id: string;
  anticipated_questions: AnticipatedQuestion[];
  internal_contradictions: InternalContradiction[];
  readiness_score: number;
  evidence_gaps: EvidenceGap[];
  recommendation: string;
}

export interface AnticipatedQuestion {
  category: string;
  question: string;
  fda_guidance_citation: string;
  severity: QuestionSeverity;
  suggested_evidence_types: string[];
}

export interface InternalContradiction {
  section_a: string;
  section_b: string;
  contradiction: string;
  severity: QuestionSeverity;
}

export interface EvidenceGap {
  category: string;
  missing_evidence: string;
  impact: QuestionSeverity;
  suggestion: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Radar Plot Data
// ═══════════════════════════════════════════════════════════════════════════════

export interface RadarPoint {
  id: string;
  k_number: string;
  device_name: string;
  manufacturer: string;
  similarity_score: number;
  toxicity_score: number;
  recommended: boolean;
  enforcement_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

export interface Generate510kPreviewRequest {
  program_id: string;
  candidate_id: string;
  subject_device: {
    device_name: string;
    manufacturer: string;
    product_code: string;
    classification: string;
    indications_for_use: string;
    technical_characteristics: Record<string, string>;
  };
}

export interface Generate510kPreviewResponse {
  candidates: PredicateCandidate[];
  se_matrix: SEMatrixRow[];
  defense_preview: DefensePreview;
  readiness_score: number;
  render_url?: string;
}
