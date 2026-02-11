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

export type StrategyRecommendation = 'CONSERVATIVE' | 'AGGRESSIVE' | 'BALANCED' | 'AVOID';

export type ObjectionTrigger =
  | 'INTENDED_USE_DRIFT'
  | 'MATERIAL_CHANGE'
  | 'ENERGY_SOURCE_CHANGE'
  | 'STERILIZATION_CHANGE'
  | 'SOFTWARE_CYBER_GAP'
  | 'TISSUE_CONTACT_DRIFT'
  | 'DURATION_MISMATCH'
  | 'OLD_PREDICATE_GAP'
  | 'MISSING_SUMMARY';

export type SuggestedEvidenceType =
  | 'bench'
  | 'biocomp'
  | 'clinical'
  | 'sw_lifecycle'
  | 'cybersecurity'
  | 'sterilization_validation'
  | 'risk_analysis'
  | 'performance_data';

export type PredicateFlag =
  | 'OLD_PREDICATE'
  | 'LOW_TEXT_MATCH'
  | 'MISSING_SUMMARY_TEXT'
  | 'VERY_NEW'
  | 'MATERIAL_MISMATCH'
  | 'CONTACT_MISMATCH'
  | 'WEAK_SUMMARY_TEXT'
  | 'ENERGY_MISMATCH'
  | 'SOFTWARE_MISMATCH'
  | 'STERILIZATION_MISMATCH';

export type RiskFlagSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskFlag {
  code: string;
  severity: RiskFlagSeverity;
  message: string;
}

export type ObjectionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Objection {
  trigger: string;
  severity: ObjectionSeverity;
  question: string;
  recommended_fix: string;
  evidence_types: SuggestedEvidenceType[];
}

/** Legacy alias */
export type AnticipatedObjection = Objection;

export interface EvidenceTaskSeed {
  evidence_type: string;
  description: string;
  source_objection: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** Legacy alias */
export type DefensePacketSeedLegacy = EvidenceTaskSeed;

export type EvidenceCategory =
  | 'BenchTesting'
  | 'Biocompatibility'
  | 'RiskManagement'
  | 'SoftwareLifecycle'
  | 'Cybersecurity'
  | 'SterilizationValidation'
  | 'ClinicalEvidence'
  | 'LabelingIFU'
  | 'StandardsConformance'
  | 'PostMarketSurveillance';

export interface EvidenceTask {
  task_id: string;
  category: EvidenceCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  rationale: string;
  trigger: string;
  recommended_artifacts: string[];
  mapping: Record<string, unknown>;
}

export interface DefensePacketSeed {
  subject_hash: string;
  generated_at: string;
  program_id: string;
  product_code: string;
  tasks: EvidenceTask[];
  readiness_score: number;
  top_risks: string[];
}

export interface MatchSnippet {
  text: string;
  source: string;
}

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
  product_code: string;
  decision_date?: string | null;
  summary_url?: string | null;
  // Scores (B2)
  similarity_score: number;
  defense_readiness_score: number;
  toxicity_score?: number | null; // placeholder until 6.6.A safety signals
  // Strategy
  strategy_recommendation: StrategyRecommendation;
  // Explainability
  reasoning: string;
  score_breakdown: {
    fts_score: number;
    name_match: number;
    recency_boost: number;
    completeness_bonus: number;
    weights: Record<string, number>;
  };
  risk_flags: RiskFlag[];
  match_snippets: MatchSnippet[];
  anticipated_objections: Objection[];
  // Per-suggestion evidence seeds (legacy compat)
  defense_packet_seed: EvidenceTaskSeed[];
  // Legacy compat
  matched_terms: string[];
  recency_years?: number | null;
  flags: string[];
  reviewer_heat: number;
  next_evidence: string[];
}

export interface PredicateSuggestRequest {
  program_id: string;
  // Required (B0)
  product_code: string;
  device_name: string;
  intended_use: string;
  technology_description: string;
  // Strongly recommended
  materials?: string[];
  energy_source?: string;
  tissue_contact?: string; // none / intact_skin / breached / blood / implant
  duration?: string; // transient / short / long (ISO 10993)
  software_present?: boolean;
  sterilization?: string; // EO, gamma, steam, none
  patient_population?: string; // pediatric, adult, geriatric
  // Legacy compat
  device_description?: string;
  software_flag?: boolean;
}

export interface PredicateSuggestResponse {
  suggestions: PredicateSuggestion[];
  subject_hash: string;
  product_code: string;
  total_candidates_scanned: number;
  latency_ms: number;
  generated_at: string;
  weights_version: string;
  cached: boolean;
  // Response-level Defense Packet Seed
  defense_packet_seed: DefensePacketSeed | null;
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

export interface EvidenceManifestEntry {
  row_id: string;
  category: string;
  characteristic: string;
  equivalence_status: EquivalenceStatus;
  diff_flag: string;
  evidence_placeholders: string[];
  highlight: boolean;
}

export interface GenerateSEMatrixResponse {
  se_matrix_payload: SEMatrixPayload;
  defense_readiness_score: number;
  row_count: number;
  discussion_required_count: number;
  generation_timestamp: string;
  evidence_manifest: EvidenceManifestEntry[];
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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — DOCX Render Request/Response
// ═══════════════════════════════════════════════════════════════════════════════

export interface RenderSEDocxRequest {
  program_id: string;
  selected_predicate_k_number: string;
  subject_device: Record<string, string>;
  design_control_ids?: Record<string, string>;
  include_reviewer_questions?: boolean;
  include_toxicity_warnings?: boolean;
}

export interface DownloadDefensePacketRequest {
  program_id: string;
  selected_predicate_k_number: string;
  subject_device: Record<string, string>;
  design_control_ids?: Record<string, string>;
}

export interface SEMatrixRenderPlan {
  table_header: string[];
  table_rows: Array<{
    index: number;
    characteristic: string;
    category: string;
    subject_text: string;
    predicate_text: string;
    diff_flag: string;
    discussion: string;
    evidence_status: string;
    diff_severity: string;
    severity_badge: string;
  }>;
  bookmarks: Array<{
    name: string;
    row: number;
    column: 'subject' | 'predicate';
    evidence_id: string;
  }>;
  color_map: Array<{
    row: number;
    subject_bg: string;
    predicate_bg: string;
    status_bg: string;
    diff_flag_bg: string;
  }>;
  total_rows: number;
  equivalent_count: number;
  discussion_count: number;
  not_equivalent_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C-V2 — Evidence-Linked SE Matrix Types (risk_code + evidence_task_ids)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Canonical risk_code enum — mirrors shadow_service RiskCode.
 * 24 deterministic risk codes covering all SE comparison categories.
 */
export type RiskCode =
  // A. Intended Use / Indications
  | 'IU_MISMATCH'
  | 'INDICATIONS_EXPANDED'
  // B. Technology / Design / Energy Source
  | 'TECH_DIFFERENCE'
  | 'ENERGY_SOURCE_CHANGE'
  | 'DESIGN_ARCH_CHANGE'
  // C. Materials / Bio / Contact
  | 'MATERIAL_CHANGE'
  | 'TISSUE_CONTACT_CHANGE'
  | 'CONTACT_DURATION_CHANGE'
  // D. Sterilization / Shelf-life / Packaging
  | 'STERILIZATION_METHOD_CHANGE'
  | 'PACKAGING_SYSTEM_CHANGE'
  | 'SHELF_LIFE_CHANGE'
  // E. Software / Cyber / Interop
  | 'SOFTWARE_PRESENT_NEW'
  | 'SOFTWARE_SAFETY_CLASS_DIFF'
  | 'CYBERSECURITY_SURFACE_INCREASED'
  | 'INTEROPERABILITY_CLAIM'
  | 'ML_ADAPTIVITY'
  // F. Clinical / Performance
  | 'PERFORMANCE_CLAIM_CHANGE'
  | 'CLINICAL_EVIDENCE_GAP'
  | 'HUMAN_FACTORS_CHANGE'
  // G. Standards / Labeling / PMS
  | 'STANDARDS_GAP'
  | 'LABELING_IFU_GAP'
  | 'PMS_SIGNAL_RISK'
  // H. Predicate Safety Lineage
  | 'PREDICATE_TOXICITY_HIGH'
  | 'PREDICATE_LINEAGE_COMPROMISED';

/** Diff flag for V2 SE matrix rows. */
export type DiffFlagV2 = 'EQUIVALENT' | 'DISCUSSION_REQUIRED' | 'SIGNIFICANT';

/** V2 SE matrix comparison row with risk_code linkage. */
export interface SEMatrixRowV2 {
  sort_order: number;
  characteristic: string;
  category: string;
  subject_value: string;
  predicate_value: string;
  diff_flag: DiffFlagV2;
  discussion_text: string;
  risk_code: RiskCode | null;
  triggered_risk_codes: string[];
  evidence_task_ids: string[];
  requires_citation: boolean;
  suggested_tests: string[];
  diff_severity: string;
  subject_evidence_ids: string[];
  predicate_evidence_ids: string[];
  subject_confidence: number;
  predicate_confidence: number;
}

/** V2 Evidence task with deterministic mapping. */
export interface EvidenceTaskV2 {
  task_id: string;
  category: string;
  risk_code: string;
  label: string;
  severity: string;
  recommended_artifacts: string[];
  mapping: {
    truth_machine_placeholder: boolean;
    se_matrix_linkable: boolean;
    ectd_section: string;
  };
}

/** Full V2 SE matrix payload returned by /generate-se-matrix-v2. */
export interface SEMatrixPayloadV2 {
  template_id: string;
  version: string;
  device_name: string;
  predicate_k_number: string;
  predicate_device_name: string;
  comparison_rows: SEMatrixRowV2[];
  evidence_tasks: EvidenceTaskV2[];
  defense_readiness_score: number;
  generated_at: string;
  risk_code_map_version: string;
  evidence_linkage: boolean;
  regulatory_standard: string;
}

/** Response shape from POST /generate-se-matrix-v2. */
export interface GenerateSEMatrixV2Response {
  se_matrix_payload: SEMatrixPayloadV2;
  defense_readiness_score: number;
  row_count: number;
  discussion_required_count: number;
  significant_count: number;
  evidence_task_count: number;
  risk_code_map_version: string;
  generation_timestamp: string;
}

/** Request body for POST /generate-se-matrix-v2. */
export interface GenerateSEMatrixV2Request {
  program_id: string;
  selected_predicate_k_number: string;
  subject_device: Record<string, string>;
  design_control_ids?: Record<string, string>;
}
