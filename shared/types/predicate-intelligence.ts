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

export type EquivalenceStatus =
  | 'EQUIVALENT'
  | 'DISCUSSION_REQUIRED'
  | 'NOT_EQUIVALENT'
  | 'TOXIC'
  | 'PENDING';

export type EnforcementEventType =
  | 'recall_class_i'
  | 'recall_class_ii'
  | 'recall_class_iii'
  | 'safety_communication'
  | 'warning_letter'
  | '483_observation'
  | 'mdr_signal';

export type QuestionSeverity = 'high' | 'medium' | 'low' | 'critical';

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A/B — Strategy & FDA Universe Types
// ═══════════════════════════════════════════════════════════════════════════════

export type StrategyRecommendation = 'CONSERVATIVE' | 'AGGRESSIVE' | 'BALANCED' | 'RISKY' | 'AVOID';

export type LineageSafety = 'CLEAN' | 'COMPROMISED' | 'UNKNOWN';

export type SignalType =
  | 'Class1Recall'
  | 'Class2Recall'
  | 'Class3Recall'
  | 'MDRReport'
  | 'SafetyCommunication'
  | '483Warning'
  | 'Seizure'
  | 'WarningLetter';

export type DiffSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type SECategory =
  | 'intended_use'
  | 'technology'
  | 'material'
  | 'materials'
  | 'performance'
  | 'design'
  | 'software'
  | 'energy'
  | 'energy_source'
  | 'biocompatibility'
  | 'sterilization'
  | 'general';

export interface PredicateSuggestion {
  k_number: string;
  device_name: string;
  applicant?: string | null;
  clearance_date?: string | null;
  product_code?: string | null;
  similarity_score: number;
  toxicity_score: number;
  lineage_safety: LineageSafety;
  strategy_recommendation: StrategyRecommendation;
  reasoning: string;
  composite_score: number;
  semantic_distance?: number | null;
}

export interface PredicateSuggestRequest {
  program_id: string;
  product_code: string;
  intended_use: string;
  technology?: string;
  materials?: string;
  energy_source?: string;
  tissue_contact?: string;
  sterilization?: string;
  max_results?: number;
}

export interface PredicateSuggestResponse {
  suggestions: PredicateSuggestion[];
  subject_device_hash: string;
  total_candidates_evaluated: number;
  generated_at: string;
}

export interface FDA510kClearance {
  k_number: string;
  applicant?: string | null;
  device_name: string;
  product_code?: string | null;
  decision_date?: string | null;
  decision_code?: string | null;
  summary_url?: string | null;
  clearance_type?: string | null;
  third_party_review: boolean;
  expedited_review: boolean;
}

export interface SafetySignal {
  id: string;
  k_number: string;
  signal_type: SignalType;
  signal_date?: string | null;
  description?: string | null;
  severity_score: number;
  source_url?: string | null;
  recall_number?: string | null;
  event_id?: string | null;
}

export interface ToxicPredicate {
  k_number: string;
  device_name: string;
  product_code?: string | null;
  decision_date?: string | null;
  max_severity: number;
  signal_count: number;
  signal_types: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — SE Matrix Generation Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface GenerateSEMatrixRequest {
  program_id: string;
  selected_predicate_k_number: string;
  subject_device: Record<string, string>;
  design_control_ids?: Record<string, string>;
}

export interface SEMatrixComparisonRow {
  sort_order: number;
  category: string;
  characteristic: string;
  subject_value: {
    value: string;
    evidence_ids: string[];
    confidence: number;
  };
  predicate_value: {
    value: string;
    evidence_ids: string[];
    confidence: number;
  };
  equivalence_status: EquivalenceStatus;
  diff_severity: DiffSeverity;
  discussion_text: string;
  requires_citation: boolean;
  suggested_tests: string[];
}

export interface SEMatrixPayload {
  template_id: string;
  version: string;
  device_name: string;
  predicate_k_number: string;
  predicate_device_name: string;
  comparison_rows: SEMatrixComparisonRow[];
  defense_readiness_score: number;
  evidence_linkage: boolean;
  regulatory_standard: string;
  generation_timestamp: string;
}

export interface GenerateSEMatrixResponse {
  se_matrix_payload: SEMatrixPayload;
  defense_readiness_score: number;
  row_count: number;
  discussion_required_count: number;
  generation_timestamp: string;
}

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
  sort_order: number;
  characteristic: string;
  category: SECategory;
  subject_value: string;
  subject_evidence_ids: string[];
  subject_confidence: number;
  predicate_value: string;
  predicate_evidence_ids: string[];
  predicate_confidence: number;
  equivalence_status: EquivalenceStatus;
  diff_explanation: string;
  diff_severity: DiffSeverity;
}

export interface SEMatrixRowCreate {
  program_id: string;
  candidate_id: string;
  sort_order?: number;
  characteristic: string;
  category?: SECategory;
  subject_value: string;
  subject_evidence_ids?: string[];
  subject_confidence?: number;
  predicate_value: string;
  predicate_evidence_ids?: string[];
  predicate_confidence?: number;
  equivalence_status?: EquivalenceStatus;
  diff_explanation?: string;
  diff_severity?: DiffSeverity;
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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A — Health / Ingestion Stats
// ═══════════════════════════════════════════════════════════════════════════════

export interface PredicateUniverseHealth {
  status: 'ok' | 'empty' | 'degraded';
  total_clearances: number;
  total_embeddings: number;
  total_signals: number;
  total_lineage_edges: number;
  total_rollups: number;
  pct_with_embeddings: number;
  pct_with_signals: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.B — Deterministic Reviewer Questions
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReviewerQuestion {
  field: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  question: string;
  citation: string;
  required_evidence: string[];
  subject_value: string;
  predicate_value: string;
}

export interface ReviewerQuestionsResponse {
  questions: ReviewerQuestion[];
  total_questions: number;
  critical_count: number;
  high_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A — Toxic Detail (signal citations)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ToxicSignalDetail {
  signal_type: string;
  signal_date: string | null;
  severity_score: number;
  description: string;
  recall_number?: string;
  source_url?: string;
}

export interface ToxicPredicateDetail {
  k_number: string;
  signals: ToxicSignalDetail[];
  toxicity_score: number;
  family_toxicity_score: number;
  mdr_rate_bucket: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  family_recall_count: number;
  is_toxic: boolean;
  toxic_because: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — Defense Manifest
// ═══════════════════════════════════════════════════════════════════════════════

export interface DefenseManifestCell {
  row_index: number;
  characteristic: string;
  category: string;
  subject: {
    value: string;
    evidence_ids: string[];
    confidence: number;
    has_evidence: boolean;
  };
  predicate: {
    value: string;
    evidence_ids: string[];
    confidence: number;
    has_evidence: boolean;
  };
  equivalence_status: string;
  diff_severity: string;
  discussion_text: string;
  requires_citation: boolean;
  suggested_tests: string[];
  evidence_complete: boolean;
}

export interface DefenseManifest {
  manifest_version: string;
  generated_at: string;
  manifest_hash: string;
  subject_device_name: string;
  predicate_k_number: string;
  predicate_device_name: string;
  defense_readiness_score: number;
  summary: {
    total_cells: number;
    equivalent_count: number;
    discussion_required_count: number;
    not_equivalent_count: number;
    evidence_complete_count: number;
    missing_evidence_count: number;
  };
  cells: DefenseManifestCell[];
  missing_evidence: Array<{
    row_index: number;
    characteristic: string;
    category: string;
    missing_from: 'subject' | 'predicate' | 'none';
  }>;
  reviewer_questions: ReviewerQuestion[];
  toxicity_warnings: ToxicSignalDetail[];
}
